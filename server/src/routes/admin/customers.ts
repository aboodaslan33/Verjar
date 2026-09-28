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
      },
    });
    if (!c) throw notFound('العميل غير موجود');
    const { passwordHash: _p, otpHash: _o, otpExpiresAt: _e, otpAttempts: _a, ...safe } = c;
    ok(res, { ...safe, hasPassword: Boolean(c.passwordHash), finance: await customerFinance(c.id) });
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
