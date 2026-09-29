import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, conflict, notFound, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { isWeakPassword } from '../../validators/common';
import { customerFinance } from '../../services/customer.service';

export const customersRouter = Router();

customersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.extend({ q: z.string().trim().optional() }).parse(req.query);
    const phone = q.q ? normalizePhone(q.q) : null;
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { companyName: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: phone ?? (q.q.replace(/\D/g, '') || q.q) } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          companyName: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              bookings: { where: { deletedAt: null } },
              orders: { where: { deletedAt: null } },
              corporateRequests: { where: { deletedAt: null } },
            },
          },
        },
        ...pageArgs(q),
      }),
      prisma.customer.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/** السجل الكامل للعميل */
customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        bookings: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        orders: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { items: true } },
        vendor: { select: { id: true, name: true, slug: true, active: true, commissionPercent: true } },
        corporateRequests: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { services: { select: { name: true } } } },
        contracts: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } },
        quoteFiles: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
        _count: { select: { bookings: true, orders: true, tenders: true, corporateRequests: true, contracts: true, quoteFiles: true, payments: true, rfqs: true, reviews: true } },
      },
    });
    if (!c) throw notFound('العميل غير موجود');
    const { passwordHash: _p, otpHash: _o, otpExpiresAt: _e, otpAttempts: _a, _count, ...safe } = c;
    // كل سجلات العميل (بما فيها المحذوفة من القوائم) — تحدد طريقة حذف الحساب
    ok(res, { ...safe, recordCounts: _count, hasPassword: Boolean(c.passwordHash), finance: await customerFinance(c.id) });
  }),
);

customersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        email: z
          .union([z.string().trim().toLowerCase().email('بريد غير صالح'), z.literal('')])
          .nullable()
          .optional()
          .transform((v) => (v === undefined ? undefined : v || null)),
        companyName: z.string().trim().max(150).nullable().optional(),
        notes: z.string().max(3000).nullable().optional(),
        resetPassword: z.boolean().optional(),
        /** كلمة مرور مؤقتة يبلّغها الأدمن للعميل (تُنهي جلساته الحالية) */
        tempPassword: z.string().min(8, 'كلمة المرور المؤقتة 8 أحرف على الأقل').max(100).refine((v) => !isWeakPassword(v), 'كلمة المرور سهلة التخمين، اختر كلمة أقوى').optional(),
      })
      .parse(req.body);
    const { resetPassword, tempPassword, ...data } = input;
    if (data.email) {
      const other = await prisma.customer.findUnique({ where: { email: data.email }, select: { id: true } });
      if (other && other.id !== req.params.id) throw conflict('هذا البريد مستخدم لعميل آخر', { field: 'email' });
    }
    const c = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(resetPassword ? { passwordHash: null } : {}),
        ...(tempPassword ? { passwordHash: await bcrypt.hash(tempPassword, 11) } : {}),
      },
      select: { id: true, name: true, phone: true, email: true, companyName: true, notes: true },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'customer', entityId: c.id });
    ok(res, c);
  }),
);

/**
 * حذف حساب العميل نهائيًا من النظام — يستطيع بعدها التسجيل من جديد بنفس الهاتف والبريد.
 * - بدون أي سجلات (حجوزات، طلبات، عقود، دفعات، طلبات عروض أسعار…): يُحذف السجل بالكامل.
 * - له سجلات: تُمسح بياناته الشخصية وبيانات الدخول (الاسم، الهاتف، البريد، كلمة المرور…)
 *   وتبقى الطلبات والحجوزات والدفعات مرتبطة بـ"عميل محذوف" للحسابات والتقارير.
 * في الحالتين: تنتهي جلساته فورًا، وتُحذف إشعاراته وعضويته في فرق الموردين، ويُعلَّق متجره إن كان موردًا.
 */
customersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true } },
        _count: { select: { bookings: true, orders: true, tenders: true, corporateRequests: true, contracts: true, quoteFiles: true, payments: true, rfqs: true, reviews: true } },
      },
    });
    if (!c) throw notFound('العميل غير موجود');
    const records = Object.values(c._count).reduce((a, b) => a + b, 0);
    const mode = await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { recipientType: 'CUSTOMER', recipientId: c.id } });
      await tx.emailOtp.deleteMany({ where: { subjectType: 'customer', subjectId: c.id } });
      await tx.loginLock.deleteMany({ where: { key: { in: [c.phone, c.email ?? ''].filter(Boolean) } } });
      await tx.vendorMember.deleteMany({ where: { customerId: c.id } });
      // متجر المورد المملوك: يُفصل ويُعلَّق (منتجاته تختفي من السوق وتبقى طلباته للحسابات)
      if (c.vendor) {
        await tx.vendor.update({ where: { id: c.vendor.id }, data: { customerId: null, active: false, status: 'SUSPENDED', rejectionReason: 'حُذف حساب مالك المتجر' } });
      }
      if (records === 0) {
        await tx.customer.delete({ where: { id: c.id } });
        return 'deleted' as const;
      }
      await tx.customer.update({
        where: { id: c.id },
        data: {
          name: 'عميل محذوف',
          // الهاتف فريد: قيمة بديلة تحرر الرقم الحقيقي للتسجيل من جديد
          phone: `deleted:${c.id}`,
          email: null,
          companyName: null,
          passwordHash: null,
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          notes: null,
          emailOptIn: false,
          emailVerifiedAt: null,
          deletedAt: new Date(),
        },
      });
      return 'anonymized' as const;
    });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'delete',
      entity: 'customer',
      entityId: c.id,
      meta: { mode, records, vendor: c.vendor?.name ?? null },
    });
    ok(res, { deleted: true, mode, records, vendorSuspended: Boolean(c.vendor) });
  }),
);
