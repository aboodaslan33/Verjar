import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { FEE_MAX, pricingData } from '../../market/fees';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { DEFAULT_COMMISSION, emptyTotals, uniqueVendorSlug, vendorTotals } from '../../services/vendor.service';
import { optionalDate } from './shared';

export const vendorsAdminRouter = Router();

const commissionInput = z.coerce.number().min(0, 'العمولة من 0 إلى 100').max(100, 'العمولة من 0 إلى 100');

const vendorSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  commissionPercent: true,
  platformFeePercent: true,
  active: true,
  isHouse: true,
  createdAt: true,
  customer: { select: { id: true, name: true, phone: true, email: true } },
} satisfies Prisma.VendorSelect;

/** قائمة الموردين مع المنتجات والمبالغ */
vendorsAdminRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z.object({ q: z.string().trim().max(80).optional(), active: z.enum(['true', 'false']).optional() }).parse(req.query);
    const vendors = await prisma.vendor.findMany({
      where: {
        ...(q.active ? { active: q.active === 'true' } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { customer: { phone: { contains: q.q } } }] } : {}),
      },
      orderBy: [{ isHouse: 'desc' }, { createdAt: 'desc' }],
      select: vendorSelect,
    });
    const ids = vendors.map((v) => v.id);
    const [totals, products, pending] = await Promise.all([
      vendorTotals(),
      prisma.product.groupBy({ by: ['vendorId'], where: { vendorId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
      prisma.product.groupBy({ by: ['vendorId'], where: { vendorId: { in: ids }, deletedAt: null, approvalStatus: 'PENDING' }, _count: { _all: true } }),
    ]);
    const pc = new Map(products.map((p) => [p.vendorId, p._count._all]));
    const pp = new Map(pending.map((p) => [p.vendorId, p._count._all]));
    ok(
      res,
      vendors.map((v) => ({ ...v, productCount: pc.get(v.id) ?? 0, pendingCount: pp.get(v.id) ?? 0, totals: totals.get(v.id) ?? emptyTotals() })),
    );
  }),
);

/**
 * التقرير المالي للموردين: المبيعات، عمولة المنصة، صافي المورد، المدفوع، والمستحق.
 * المبيعات والعمولة ضمن الفترة (إن حُددت)، والمستحق والمدفوع إجمالي حتى الآن.
 */
vendorsAdminRouter.get(
  '/report',
  asyncHandler(async (req, res) => {
    const q = z.object({ from: optionalDate, to: optionalDate }).parse(req.query);
    const totals = await vendorTotals({
      from: q.from ? ammanToUtc(q.from, '00:00') : undefined,
      to: q.to ? ammanToUtc(q.to, '23:59') : undefined,
    });
    const vendors = await prisma.vendor.findMany({ orderBy: [{ isHouse: 'desc' }, { name: 'asc' }], select: vendorSelect });
    const rows = vendors
      .map((v) => ({ vendor: v, ...(totals.get(v.id) ?? emptyTotals()) }))
      .filter((r) => r.vendor.active || r.ordersCount > 0 || r.due > 0);
    const sum = (f: (r: (typeof rows)[number]) => number) => round3(rows.reduce((n, r) => n + f(r), 0));
    ok(res, {
      rows,
      summary: {
        salesTotal: sum((r) => r.salesTotal),
        commissionTotal: sum((r) => r.commissionTotal),
        vendorNetTotal: sum((r) => r.vendorNetTotal),
        due: sum((r) => r.due),
        paid: sum((r) => r.paid),
      },
    });
  }),
);

/** منح صلاحية مورد لعميل (أو إعادة تفعيلها) */
vendorsAdminRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        customerId: z.string().min(1, 'اختر العميل'),
        commissionPercent: commissionInput.optional(),
        name: z.string().trim().min(2).max(60).optional(),
      })
      .parse(req.body);
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw notFound('العميل غير موجود');
    if (!customer.passwordHash) throw badRequest('العميل ليس لديه حساب بكلمة مرور. يجب أن يسجّل في الموقع أولًا.');
    const existing = await prisma.vendor.findUnique({ where: { customerId: customer.id } });
    const vendor = existing
      ? await prisma.vendor.update({
          where: { id: existing.id },
          data: {
            active: true,
            ...(input.commissionPercent !== undefined ? { commissionPercent: new Prisma.Decimal(input.commissionPercent) } : {}),
            ...(input.name ? { name: input.name } : {}),
          },
          select: vendorSelect,
        })
      : await prisma.vendor.create({
          data: {
            customerId: customer.id,
            name: input.name ?? customer.companyName ?? customer.name,
            slug: await uniqueVendorSlug(prisma, input.name ?? customer.companyName ?? customer.name),
            commissionPercent: new Prisma.Decimal(input.commissionPercent ?? DEFAULT_COMMISSION),
          },
          select: vendorSelect,
        });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'grant', entity: 'vendor', entityId: vendor.id, meta: { customerId: customer.id } });
    ok(res, vendor, existing ? 200 : 201);
  }),
);

vendorsAdminRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id }, select: vendorSelect });
    if (!vendor) throw notFound('المورد غير موجود');
    const [totals, payouts, due] = await Promise.all([
      vendorTotals({ vendorId: vendor.id }),
      prisma.vendorPayout.findMany({
        where: { vendorId: vendor.id },
        orderBy: { paidAt: 'desc' },
        include: { recordedBy: { select: { name: true } } },
        take: 50,
      }),
      prisma.vendorOrder.findMany({
        where: { vendorId: vendor.id, status: 'COMPLETED', payoutId: null, order: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, number: true, total: true, commissionTotal: true, vendorNet: true, createdAt: true, order: { select: { id: true, number: true } } },
      }),
    ]);
    ok(res, { vendor, totals: totals.get(vendor.id) ?? emptyTotals(), payouts, dueOrders: due });
  }),
);

/** تعديل العمولة أو الاسم، أو سحب الصلاحية (active=false) — العمولة الجديدة تسري على الطلبات القادمة فقط */
vendorsAdminRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        commissionPercent: commissionInput.optional(),
        /** نسبة فرجار الافتراضية لمنتجات المورد الجديدة (null = حسب القسم/الافتراضي) */
        platformFeePercent: z.coerce.number().min(0).max(FEE_MAX).nullable().optional(),
        /** تطبيق النسبة على كل منتجات المورد الحالية أيضًا */
        applyFeeToProducts: z.boolean().optional(),
        name: z.string().trim().min(2).max(60).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    const current = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound('المورد غير موجود');
    if (current.isHouse && input.active === false) throw badRequest('لا يمكن إيقاف المورد الافتراضي (الشركة)');
    const vendor = await prisma.vendor.update({
      where: { id: current.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.commissionPercent !== undefined ? { commissionPercent: new Prisma.Decimal(input.commissionPercent) } : {}),
        ...(input.platformFeePercent !== undefined
          ? { platformFeePercent: input.platformFeePercent === null ? null : new Prisma.Decimal(input.platformFeePercent) }
          : {}),
      },
      select: vendorSelect,
    });
    if (input.applyFeeToProducts && input.platformFeePercent != null && !current.isHouse) {
      const products = await prisma.product.findMany({ where: { vendorId: current.id, deletedAt: null }, select: { id: true, supplierPrice: true, discountPercent: true } });
      await prisma.$transaction(
        products.map((p) => prisma.product.update({ where: { id: p.id }, data: pricingData(p.supplierPrice, input.platformFeePercent, p.discountPercent) })),
      );
    }
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: input.active === false ? 'revoke' : 'update',
      entity: 'vendor',
      entityId: vendor.id,
      meta: input,
    });
    ok(res, vendor);
  }),
);

/**
 * "تم الدفع": تسوية كل الطلبات الفرعية المكتملة غير المسوّاة لهذا المورد.
 * المبالغ من القيم المحفوظة وقت البيع، ويُرفض الطلب إن تغيّر المستحق أثناء التسوية.
 */
vendorsAdminRouter.post(
  '/:id/payouts',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        method: z.enum(['CASH', 'BANK_TRANSFER', 'CLIQ', 'CARD', 'OTHER']).default('BANK_TRANSFER'),
        reference: z.string().trim().max(120).optional(),
        note: z.string().trim().max(500).optional(),
        /** المبلغ الذي رآه الأدمن — للتأكد أنه لم يتغير */
        expectedAmount: z.coerce.number().min(0).optional(),
      })
      .parse(req.body ?? {});
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!vendor) throw notFound('المورد غير موجود');

    const payout = await prisma.$transaction(async (tx) => {
      const due = await tx.vendorOrder.findMany({
        where: { vendorId: vendor.id, status: 'COMPLETED', payoutId: null, order: { deletedAt: null } },
        select: { id: true, total: true, commissionTotal: true, vendorNet: true },
      });
      const amount = round3(due.reduce((n, v) => n + toNum(v.vendorNet), 0));
      if (!due.length || amount <= 0) throw badRequest('لا يوجد مبلغ مستحق لهذا المورد');
      if (input.expectedAmount !== undefined && Math.abs(input.expectedAmount - amount) > 0.0005) {
        throw conflict('تغيّر المبلغ المستحق. حدّث الصفحة وراجع المبلغ قبل التسوية.');
      }
      const created = await tx.vendorPayout.create({
        data: {
          vendorId: vendor.id,
          amount: new Prisma.Decimal(amount),
          salesTotal: new Prisma.Decimal(round3(due.reduce((n, v) => n + toNum(v.total), 0))),
          commissionTotal: new Prisma.Decimal(round3(due.reduce((n, v) => n + toNum(v.commissionTotal), 0))),
          ordersCount: due.length,
          method: input.method,
          reference: input.reference || null,
          note: input.note || null,
          recordedById: req.auth!.sub,
        },
      });
      // ربط الطلبات بالتسوية بشرط ألا تكون سُوّيت في طلب متزامن
      const linked = await tx.vendorOrder.updateMany({
        where: { id: { in: due.map((d) => d.id) }, payoutId: null, status: 'COMPLETED' },
        data: { payoutId: created.id },
      });
      if (linked.count !== due.length) throw conflict('تغيّرت الطلبات أثناء التسوية، حاول مرة أخرى');
      return created;
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'payout', entity: 'vendor', entityId: vendor.id, meta: { payoutId: payout.id, amount: toNum(payout.amount) } });
    ok(res, payout, 201);
  }),
);
