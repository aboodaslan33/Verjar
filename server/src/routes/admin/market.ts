import { Router, type Request } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { calcCommission } from '../../market/commission';
import { getThread, postMessage } from '../../market/messaging';
import { marketNotify } from '../../market/notify';
import { activateSubscription, cancelInvoice, createInvoice, markInvoicePaid } from '../../market/payments';
import { FEATURE_KEYS } from '../../market/plans';
import { OPEN_STATUSES, closeRfq, distribute, rfqEvent, suggestSuppliers } from '../../market/rfq';
import { requirePermission } from '../../middleware/auth';
import { createDeliveryOrder } from '../../services/delivery.service';
import { getSettings } from '../../services/settings.service';
import { optionalDate } from './shared';

/**
 * إدارة السوق الصناعي: الموردون، طلبات عروض الأسعار (Leads)، الباقات، العمولات، الإعلانات، الفواتير، التقييمات والتقارير المالية.
 * العرض بصلاحية market.view، والتعديل market.manage، والأسعار والعمولات والفواتير market.finance.
 */
export const marketAdminRouter = Router();
const finance = requirePermission('market.finance');

const adminActor = (req: Request) => ({ kind: 'admin' as const, id: req.auth!.sub, name: req.auth!.name ?? 'الإدارة' });
const range = (from?: string, to?: string) =>
  from || to ? { ...(from ? { gte: ammanToUtc(from, '00:00') } : {}), ...(to ? { lte: ammanToUtc(to, '23:59') } : {}) } : undefined;

// ═════════ الموردون ═════════

marketAdminRouter.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(), q: z.string().trim().max(80).optional(), plan: z.string().max(20).optional(), verified: z.enum(['true', 'false']).optional() })
      .parse(req.query);
    const c = q.q ? { contains: q.q, mode: 'insensitive' as const } : null;
    const where: Prisma.VendorWhereInput = {
      active: true,
      ...(q.status ? { status: q.status } : {}),
      ...(q.plan ? { plan: { code: q.plan } } : {}),
      ...(q.verified ? { verified: q.verified === 'true' } : {}),
      ...(c ? { OR: [{ name: c }, { city: c }, { email: c }, { phone: { contains: q.q } }, { customer: { phone: { contains: q.q } } }] } : {}),
    };
    const [items, total, statusCounts] = await Promise.all([
      prisma.vendor.findMany({
        where,
        orderBy: [{ isHouse: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          status: true,
          verified: true,
          isHouse: true,
          city: true,
          businessField: true,
          createdAt: true,
          planExpiresAt: true,
          plan: { select: { code: true, name: true } },
          customer: { select: { name: true, phone: true } },
          _count: { select: { products: { where: { deletedAt: null } }, rfqRecipients: true, quotes: true } },
        },
        ...pageArgs(q),
      }),
      prisma.vendor.count({ where }),
      prisma.vendor.groupBy({ by: ['status'], where: { active: true }, _count: { _all: true } }),
    ]);
    ok(res, { ...paged(items, total, q), statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) });
  }),
);

marketAdminRouter.get(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const v = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: {
        plan: true,
        customer: { select: { id: true, name: true, phone: true, email: true } },
        members: { include: { customer: { select: { name: true, phone: true, email: true } } } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 20, include: { plan: { select: { name: true } }, invoice: { select: { number: true, status: true } } } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 30 },
        ads: { orderBy: { createdAt: 'desc' }, take: 20, include: { product: { select: { name: true } } } },
      },
    });
    if (!v) throw notFound('المورد غير موجود');
    const [products, rfqs, quotes, deals, rating, categories] = await Promise.all([
      prisma.product.groupBy({ by: ['approvalStatus'], where: { vendorId: v.id, deletedAt: null }, _count: { _all: true } }),
      prisma.rfqRecipient.count({ where: { vendorId: v.id } }),
      prisma.quote.count({ where: { vendorId: v.id } }),
      prisma.quote.aggregate({ where: { vendorId: v.id, status: 'ACCEPTED' }, _sum: { total: true }, _count: { _all: true } }),
      prisma.supplierReview.aggregate({ where: { vendorId: v.id }, _avg: { overall: true }, _count: { _all: true } }),
      prisma.category.findMany({ where: { id: { in: v.categoryIds } }, select: { id: true, name: true } }),
    ]);
    ok(res, {
      ...v,
      categories,
      stats: {
        products: Object.fromEntries(products.map((p) => [p.approvalStatus, p._count._all])),
        rfqs,
        quotes,
        deals: { count: deals._count._all, value: toNum(deals._sum.total ?? 0) },
        rating: rating._count._all ? { average: Math.round((rating._avg.overall ?? 0) * 10) / 10, count: rating._count._all } : null,
      },
    });
  }),
);

const STATUS_MSG: Record<string, { title: string; body: string }> = {
  APPROVED: { title: 'تم اعتماد حسابك كمورد', body: 'مبروك! حسابك في سوق FARJAR الصناعي معتمد الآن، ومنتجاتك وصفحتك ظاهرة للشركات.' },
  REJECTED: { title: 'لم يُعتمد طلب انضمامك', body: 'راجع ملاحظة الإدارة في لوحة المورد وعدّل بياناتك لإعادة المراجعة.' },
  SUSPENDED: { title: 'تم تعليق حسابك كمورد', body: 'حسابك معلّق مؤقتًا ولا تظهر منتجاتك. تواصل مع الإدارة للتفاصيل.' },
  PENDING: { title: 'حسابك قيد المراجعة', body: 'أُعيد حسابك للمراجعة من الإدارة.' },
};

/** اعتماد، رفض، تعليق أو إعادة للمراجعة */
marketAdminRouter.post(
  '/suppliers/:id/status',
  asyncHandler(async (req, res) => {
    const { status, reason } = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']), reason: z.string().trim().max(500).optional().nullable() }).parse(req.body);
    if ((status === 'REJECTED' || status === 'SUSPENDED') && !reason) throw badRequest('اكتب السبب ليعرفه المورد', { fields: { reason: 'السبب مطلوب' } });
    const v = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!v) throw notFound('المورد غير موجود');
    if (v.isHouse && status !== 'APPROVED') throw badRequest('لا يمكن تعليق متجر FARJAR');
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id: v.id }, data: { status, rejectionReason: status === 'APPROVED' ? null : reason ?? null } });
      await marketNotify(tx, { vendorIds: [v.id] }, { title: STATUS_MSG[status].title, body: reason ? `${STATUS_MSG[status].body} الملاحظة: ${reason}` : STATUS_MSG[status].body, link: '/vendor', cta: 'لوحة المورد' });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: `supplier_${status.toLowerCase()}`, entity: 'vendor', entityId: v.id, meta: { reason } });
    ok(res, { id: v.id, status });
  }),
);

marketAdminRouter.post(
  '/suppliers/:id/verify',
  asyncHandler(async (req, res) => {
    const { verified } = z.object({ verified: z.boolean() }).parse(req.body);
    const v = await prisma.vendor.update({ where: { id: req.params.id }, data: { verified, verifiedAt: verified ? new Date() : null } });
    if (verified) await marketNotify(prisma, { vendorIds: [v.id] }, { title: 'أصبحت موردًا موثّقًا ✔', body: 'تظهر علامة "مورد موثّق" بجانب اسم شركتك في السوق.', link: `/store/vendor/${v.slug}` });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: verified ? 'supplier_verify' : 'supplier_unverify', entity: 'vendor', entityId: v.id });
    ok(res, { id: v.id, verified });
  }),
);

/** تغيير باقة المورد: منح مباشر (بدون دفع) أو فاتورة بانتظار الدفع */
marketAdminRouter.post(
  '/suppliers/:id/plan',
  finance,
  asyncHandler(async (req, res) => {
    const input = z.object({ planId: z.string().min(1), charge: z.boolean().default(false), days: z.coerce.number().int().min(1).max(3650).optional() }).parse(req.body);
    const plan = await prisma.supplierPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw notFound('الباقة غير موجودة');
    const v = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!v) throw notFound('المورد غير موجود');
    const out = await prisma.$transaction(async (tx) => {
      const amount = input.charge ? toNum(plan.price) : 0;
      const invoice = amount > 0 ? await createInvoice(tx, { purpose: 'SUBSCRIPTION', description: `اشتراك باقة ${plan.name}`, amount, vendorId: v.id, refType: 'plan', refId: plan.id, dueDays: 7 }) : null;
      const sub = await tx.vendorSubscription.create({ data: { vendorId: v.id, planId: plan.id, amount: new Prisma.Decimal(amount), invoiceId: invoice?.id ?? null, note: input.charge ? null : 'منحة من الإدارة' } });
      if (!invoice) {
        await activateSubscription(tx, sub.id);
        if (input.days) {
          const ends = new Date(Date.now() + input.days * 86400_000);
          await tx.vendorSubscription.update({ where: { id: sub.id }, data: { endsAt: ends } });
          await tx.vendor.update({ where: { id: v.id }, data: { planExpiresAt: ends } });
        }
        await marketNotify(tx, { vendorIds: [v.id] }, { title: `تم تفعيل باقة ${plan.name}`, body: 'تم تحديث باقتك من الإدارة. استمتع بالمزايا الجديدة.', link: '/vendor/subscription' });
      } else {
        await marketNotify(tx, { vendorIds: [v.id] }, { title: `فاتورة اشتراك ${plan.name}`, body: `صدرت فاتورة ${invoice.number} بقيمة ${amount} د.أ. تُفعّل الباقة بعد الدفع.`, link: '/vendor/subscription' });
      }
      return { sub, invoice };
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'supplier_plan', entity: 'vendor', entityId: v.id, meta: { plan: plan.code, charge: input.charge } });
    ok(res, out);
  }),
);

marketAdminRouter.patch(
  '/suppliers/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(3000),
        contactName: z.string().trim().max(100).nullable(),
        phone: z.string().trim().max(30).nullable(),
        whatsapp: z.string().trim().max(20).nullable(),
        email: z.string().trim().max(120).nullable(),
        address: z.string().trim().max(300).nullable(),
        city: z.string().trim().max(60).nullable(),
        businessField: z.string().trim().max(200).nullable(),
        productTypes: z.string().trim().max(500).nullable(),
        licenseNumber: z.string().trim().max(60).nullable(),
        categoryIds: z.array(z.string()).max(30),
        planExpiresAt: z.coerce.date().nullable(),
      })
      .partial()
      .parse(req.body);
    const v = await prisma.vendor.update({ where: { id: req.params.id }, data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'vendor', entityId: v.id, meta: input });
    ok(res, v);
  }),
);

// ═════════ طلبات عروض الأسعار / Leads ═════════

marketAdminRouter.get(
  '/rfqs',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ status: z.string().max(20).optional(), q: z.string().trim().max(80).optional(), categoryId: z.string().optional(), from: optionalDate, to: optionalDate })
      .parse(req.query);
    const c = q.q ? { contains: q.q, mode: 'insensitive' as const } : null;
    const where: Prisma.RfqWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(range(q.from, q.to) ? { createdAt: range(q.from, q.to) } : {}),
      ...(c ? { OR: [{ code: { contains: q.q!.toUpperCase() } }, { title: c }, { companyName: c }, { contactName: c }, { phone: { contains: q.q } }] } : {}),
    };
    const [items, total, statusCounts, sums] = await Promise.all([
      prisma.rfq.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          code: true,
          title: true,
          companyName: true,
          contactName: true,
          city: true,
          status: true,
          createdAt: true,
          expectedValue: true,
          finalValue: true,
          commissionAmount: true,
          revenueModel: true,
          category: { select: { name: true } },
          acceptedQuote: { select: { vendor: { select: { name: true } } } },
          _count: { select: { recipients: true, quotes: { where: { status: { not: 'WITHDRAWN' } } }, items: true } },
        },
        ...pageArgs(q),
      }),
      prisma.rfq.count({ where }),
      prisma.rfq.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.rfq.aggregate({ where, _sum: { expectedValue: true, finalValue: true, commissionAmount: true } }),
    ]);
    ok(res, {
      ...paged(items, total, q),
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      sums: { expected: toNum(sums._sum.expectedValue ?? 0), final: toNum(sums._sum.finalValue ?? 0), commission: toNum(sums._sum.commissionAmount ?? 0) },
    });
  }),
);

marketAdminRouter.get(
  '/rfqs/:id',
  asyncHandler(async (req, res) => {
    const rfq = await prisma.rfq.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        category: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, name: true, phone: true, email: true, companyName: true } },
        recipients: { orderBy: { sentAt: 'asc' }, include: { vendor: { select: { id: true, name: true, slug: true, verified: true, city: true, plan: { select: { code: true } } } } } },
        quotes: { orderBy: { total: 'asc' }, include: { vendor: { select: { id: true, name: true, slug: true } } } },
        events: { orderBy: { createdAt: 'asc' } },
        conversations: { include: { vendor: { select: { name: true } }, _count: { select: { messages: true } } } },
      },
    });
    if (!rfq) throw notFound('الطلب غير موجود');
    const rule = rfq.commissionRuleId ? await prisma.commissionRule.findUnique({ where: { id: rfq.commissionRuleId }, select: { name: true } }) : null;
    ok(res, { ...rfq, commissionRule: rule, open: OPEN_STATUSES.includes(rfq.status) });
  }),
);

marketAdminRouter.get(
  '/rfqs/:id/suggestions',
  asyncHandler(async (req, res) => {
    ok(res, await prisma.$transaction((tx) => suggestSuppliers(tx, req.params.id, 20)));
  }),
);

marketAdminRouter.post(
  '/rfqs/:id/distribute',
  asyncHandler(async (req, res) => {
    const { vendorIds } = z.object({ vendorIds: z.array(z.string()).min(1, 'اختر موردًا واحدًا على الأقل').max(30) }).parse(req.body);
    const added = await prisma.$transaction((tx) => distribute(tx, req.params.id, vendorIds, 'MANUAL', adminActor(req)));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'rfq_distribute', entity: 'rfq', entityId: req.params.id, meta: { vendorIds: added } });
    ok(res, { added });
  }),
);

/** قيم الـ Lead والصفقة وملاحظة الإدارة (تغيير القيمة النهائية يعيد حساب العمولة) */
marketAdminRouter.patch(
  '/rfqs/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({ expectedValue: z.coerce.number().min(0).nullable(), finalValue: z.coerce.number().min(0).nullable(), adminNote: z.string().trim().max(2000).nullable(), categoryId: z.string().nullable() })
      .partial()
      .parse(req.body);
    const rfq = await prisma.rfq.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!rfq) throw notFound('الطلب غير موجود');
    const data: Prisma.RfqUpdateInput = {
      ...(input.expectedValue !== undefined ? { expectedValue: input.expectedValue == null ? null : new Prisma.Decimal(input.expectedValue) } : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      ...(input.categoryId !== undefined ? { category: input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true } } : {}),
    };
    if (input.finalValue !== undefined) {
      if (input.finalValue == null) Object.assign(data, { finalValue: null, commissionAmount: null, commissionRate: null, commissionRuleId: null });
      else {
        const c = await calcCommission({ amount: input.finalValue, categoryId: input.categoryId ?? rfq.categoryId, dealType: 'RFQ_DEAL' });
        Object.assign(data, { finalValue: new Prisma.Decimal(input.finalValue), commissionRate: new Prisma.Decimal(c.percent), commissionAmount: new Prisma.Decimal(c.amount), commissionRuleId: c.rule?.id ?? null });
      }
    }
    const updated = await prisma.rfq.update({ where: { id: rfq.id }, data });
    await rfqEvent(prisma, rfq.id, adminActor(req), 'admin_updated', null, input as Prisma.InputJsonValue);
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'rfq', entityId: rfq.id, meta: input });
    ok(res, updated);
  }),
);

marketAdminRouter.post(
  '/rfqs/:id/close',
  asyncHandler(async (req, res) => {
    const input = z.object({ cancel: z.boolean().default(false), finalValue: z.coerce.number().min(0).optional().nullable(), note: z.string().trim().max(500).optional().nullable() }).parse(req.body ?? {});
    const r = await closeRfq(req.params.id, adminActor(req), input);
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: input.cancel ? 'rfq_cancel' : 'rfq_close', entity: 'rfq', entityId: r.id });
    ok(res, { id: r.id, status: r.status });
  }),
);

marketAdminRouter.get(
  '/rfqs/:id/messages/:vendorId',
  asyncHandler(async (req, res) => {
    ok(res, await getThread(req.params.id, req.params.vendorId, 'ADMIN'));
  }),
);

marketAdminRouter.post(
  '/rfqs/:id/messages/:vendorId',
  asyncHandler(async (req, res) => {
    const { body } = z.object({ body: z.string().max(4000) }).parse(req.body);
    ok(res, await postMessage(req.params.id, req.params.vendorId, { side: 'ADMIN', id: req.auth!.sub, name: 'إدارة FARJAR' }, body), 201);
  }),
);

/** بعد الترسية: إنشاء طلب توصيل من العرض المقبول (نظام التوصيل الحالي) */
marketAdminRouter.post(
  '/rfqs/:id/delivery-order',
  requirePermission('orders.manage'),
  asyncHandler(async (req, res) => {
    const { address, area } = z.object({ address: z.string().trim().min(3, 'عنوان التسليم مطلوب').max(300), area: z.string().trim().max(80).optional().nullable() }).parse(req.body);
    const rfq = await prisma.rfq.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { acceptedQuote: true, items: true } });
    if (!rfq?.acceptedQuote) throw conflict('أنشئ طلب التوصيل بعد قبول عرض');
    if (rfq.orderId) throw conflict('لهذا الطلب طلب توصيل مسبقًا');
    const q = rfq.acceptedQuote;
    const order = await prisma.$transaction(async (tx) => {
      const o = await createDeliveryOrder(
        tx,
        q.vendorId,
        {
          customerName: rfq.companyName,
          customerPhone: rfq.phone,
          address,
          area: area ?? rfq.city ?? null,
          items: [{ name: `${rfq.title} (${rfq.code})`, quantity: 1, unitPrice: toNum(q.total) }],
          discount: 0,
          deliveryFee: 0,
          customerPaysFee: false,
          paymentMethod: 'BANK_TRANSFER',
          notes: `من طلب عرض السعر ${rfq.code}`,
        },
        'ADMIN',
        { kind: 'user', id: req.auth!.sub, name: req.auth!.name ?? 'الإدارة', perms: req.auth!.perms },
      );
      await tx.rfq.update({ where: { id: rfq.id }, data: { orderId: o.id } });
      await rfqEvent(tx, rfq.id, adminActor(req), 'delivery_order', o.code);
      return o;
    });
    ok(res, { id: order.id, code: order.code }, 201);
  }),
);

// ═════════ الباقات ═════════

const planInput = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,19}$/, 'رمز الباقة بأحرف إنجليزية كبيرة'),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(1000).default(''),
  price: z.coerce.number().min(0).max(100_000),
  durationDays: z.coerce.number().int().min(1).max(36500),
  maxProducts: z.coerce.number().int().min(0).max(1_000_000).nullable(),
  maxUsers: z.coerce.number().int().min(1).max(1000),
  maxRfqPerMonth: z.coerce.number().int().min(0).max(1_000_000).nullable(),
  searchBoost: z.coerce.number().int().min(0).max(1000),
  rfqPriority: z.coerce.number().int().min(0).max(1000),
  leadsIncluded: z.boolean(),
  features: z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().default(false)])) as Record<(typeof FEATURE_KEYS)[number], z.ZodDefault<z.ZodBoolean>>),
  badge: z.string().trim().max(20).nullable().optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

marketAdminRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await prisma.supplierPlan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { vendors: true } } } });
    ok(res, plans);
  }),
);

marketAdminRouter.post(
  '/plans',
  finance,
  asyncHandler(async (req, res) => {
    const input = planInput.parse(req.body);
    if (await prisma.supplierPlan.findUnique({ where: { code: input.code } })) throw conflict('رمز الباقة مستخدم', { fields: { code: 'اختر رمزًا آخر' } });
    const p = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.supplierPlan.updateMany({ data: { isDefault: false } });
      return tx.supplierPlan.create({ data: { ...input, price: new Prisma.Decimal(input.price) } });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'plan', entityId: p.id, meta: input });
    ok(res, p, 201);
  }),
);

marketAdminRouter.patch(
  '/plans/:id',
  finance,
  asyncHandler(async (req, res) => {
    const input = planInput.omit({ code: true }).partial().parse(req.body);
    const p = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.supplierPlan.updateMany({ where: { id: { not: req.params.id } }, data: { isDefault: false } });
      return tx.supplierPlan.update({ where: { id: req.params.id }, data: { ...input, ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}) } });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'plan', entityId: p.id, meta: input });
    ok(res, p);
  }),
);

// ═════════ العمولات ═════════

const ruleInput = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().nullable().optional(),
  commissionGroup: z.string().trim().max(40).nullable().optional(),
  planCode: z.string().trim().max(20).nullable().optional(),
  dealType: z.enum(['PRODUCT_SALE', 'RFQ_DEAL', 'PROCUREMENT']).nullable().optional(),
  percent: z.coerce.number().min(0).max(100),
  minAmount: z.coerce.number().min(0).nullable().optional(),
  maxAmount: z.coerce.number().min(0).nullable().optional(),
  priority: z.coerce.number().int().min(-1000).max(1000).default(0),
  active: z.boolean().default(true),
});

const ruleData = (i: Partial<z.infer<typeof ruleInput>>) => ({
  ...i,
  ...(i.percent !== undefined ? { percent: new Prisma.Decimal(i.percent) } : {}),
  ...(i.minAmount !== undefined ? { minAmount: i.minAmount == null ? null : new Prisma.Decimal(i.minAmount) } : {}),
  ...(i.maxAmount !== undefined ? { maxAmount: i.maxAmount == null ? null : new Prisma.Decimal(i.maxAmount) } : {}),
  ...(i.commissionGroup !== undefined ? { commissionGroup: i.commissionGroup || null } : {}),
  ...(i.planCode !== undefined ? { planCode: i.planCode || null } : {}),
  ...(i.categoryId !== undefined ? { categoryId: i.categoryId || null } : {}),
});

marketAdminRouter.get(
  '/commissions',
  asyncHandler(async (_req, res) => {
    const [rules, groups] = await Promise.all([
      prisma.commissionRule.findMany({ orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }], include: { category: { select: { name: true } } } }),
      prisma.category.findMany({ where: { deletedAt: null, commissionGroup: { not: null } }, distinct: ['commissionGroup'], select: { commissionGroup: true } }),
    ]);
    ok(res, { rules, groups: groups.map((g) => g.commissionGroup) });
  }),
);

marketAdminRouter.post(
  '/commissions',
  finance,
  asyncHandler(async (req, res) => {
    const input = ruleInput.parse(req.body);
    if (input.minAmount != null && input.maxAmount != null && input.minAmount > input.maxAmount) throw badRequest('الحد الأدنى أكبر من الأقصى', { fields: { minAmount: 'أصغر من الحد الأقصى' } });
    const r = await prisma.commissionRule.create({ data: ruleData(input) as Prisma.CommissionRuleUncheckedCreateInput });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'commission_rule', entityId: r.id, meta: input });
    ok(res, r, 201);
  }),
);

marketAdminRouter.patch(
  '/commissions/:id',
  finance,
  asyncHandler(async (req, res) => {
    const input = ruleInput.partial().parse(req.body);
    const r = await prisma.commissionRule.update({ where: { id: req.params.id }, data: ruleData(input) as Prisma.CommissionRuleUncheckedUpdateInput });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'commission_rule', entityId: r.id, meta: input });
    ok(res, r);
  }),
);

marketAdminRouter.delete(
  '/commissions/:id',
  finance,
  asyncHandler(async (req, res) => {
    await prisma.commissionRule.delete({ where: { id: req.params.id } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'commission_rule', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

/** حاسبة: أي قاعدة ستُطبّق وكم العمولة */
marketAdminRouter.post(
  '/commissions/preview',
  asyncHandler(async (req, res) => {
    const input = z.object({ amount: z.coerce.number().min(0), categoryId: z.string().nullable().optional(), planCode: z.string().nullable().optional(), dealType: z.enum(['PRODUCT_SALE', 'RFQ_DEAL', 'PROCUREMENT']).nullable().optional() }).parse(req.body);
    const c = await calcCommission(input);
    ok(res, { percent: c.percent, amount: c.amount, capped: c.capped, floored: c.floored, rule: c.rule ? { id: c.rule.id, name: c.rule.name } : null });
  }),
);

// ═════════ الإعلانات ═════════

const pkgInput = z.object({
  type: z.enum(['FEATURED_PRODUCT', 'FEATURED_SUPPLIER', 'INDUSTRIAL_DEAL', 'PRODUCT_OF_WEEK', 'SUPPLIER_OF_MONTH']),
  name: z.string().trim().min(2).max(80),
  placement: z.enum(['MARKET_HOME', 'SEARCH_TOP']).default('MARKET_HOME'),
  price: z.coerce.number().min(0).max(100_000),
  durationDays: z.coerce.number().int().min(1).max(365),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

marketAdminRouter.get(
  '/ads',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.string().max(20).optional() }).parse(req.query);
    const [ads, packages] = await Promise.all([
      prisma.marketAd.findMany({
        where: status ? { status: status as never } : {},
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { vendor: { select: { id: true, name: true } }, product: { select: { name: true } }, invoice: { select: { id: true, number: true, status: true } } },
      }),
      prisma.adPackage.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    ok(res, { ads, packages });
  }),
);

marketAdminRouter.post(
  '/ad-packages',
  finance,
  asyncHandler(async (req, res) => {
    const input = pkgInput.parse(req.body);
    ok(res, await prisma.adPackage.create({ data: { ...input, price: new Prisma.Decimal(input.price) } }), 201);
  }),
);

marketAdminRouter.patch(
  '/ad-packages/:id',
  finance,
  asyncHandler(async (req, res) => {
    const input = pkgInput.partial().parse(req.body);
    ok(res, await prisma.adPackage.update({ where: { id: req.params.id }, data: { ...input, ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}) } }));
  }),
);

/** إعلان تنشئه الإدارة لمورد (مجاني أو بسعر مع فاتورة) */
marketAdminRouter.post(
  '/ads',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        type: pkgInput.shape.type,
        placement: pkgInput.shape.placement,
        vendorId: z.string().min(1, 'اختر المورد'),
        productId: z.string().nullable().optional(),
        title: z.string().trim().max(120).nullable().optional(),
        price: z.coerce.number().min(0).default(0),
        startsAt: z.coerce.date(),
        endsAt: z.coerce.date(),
        charge: z.boolean().default(false),
      })
      .parse(req.body);
    if (input.endsAt <= input.startsAt) throw badRequest('تاريخ النهاية بعد البداية', { fields: { endsAt: 'بعد تاريخ البداية' } });
    if (input.productId && !(await prisma.product.findFirst({ where: { id: input.productId, vendorId: input.vendorId, deletedAt: null } }))) throw badRequest('المنتج لا يخص هذا المورد', { fields: { productId: 'اختر منتجًا للمورد' } });
    const ad = await prisma.$transaction(async (tx) => {
      const invoice = input.charge && input.price > 0 ? await createInvoice(tx, { purpose: 'AD', description: `إعلان ${input.type}`, amount: input.price, vendorId: input.vendorId, refType: 'ad', dueDays: 3 }) : null;
      return tx.marketAd.create({
        data: {
          type: input.type,
          placement: input.placement,
          vendorId: input.vendorId,
          productId: input.productId ?? null,
          title: input.title ?? null,
          price: new Prisma.Decimal(input.price),
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: invoice ? 'PENDING_PAYMENT' : 'ACTIVE',
          invoiceId: invoice?.id ?? null,
        },
      });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'ad', entityId: ad.id });
    ok(res, ad, 201);
  }),
);

marketAdminRouter.patch(
  '/ads/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({ status: z.enum(['REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED']), startsAt: z.coerce.date(), endsAt: z.coerce.date(), title: z.string().trim().max(120).nullable(), note: z.string().trim().max(300).nullable() })
      .partial()
      .parse(req.body);
    const ad = await prisma.marketAd.update({ where: { id: req.params.id }, data: input });
    if (input.status === 'ACTIVE' || input.status === 'REJECTED') {
      await marketNotify(prisma, { vendorIds: [ad.vendorId] }, { title: input.status === 'ACTIVE' ? 'إعلانك فعّال الآن' : 'لم يُقبل طلب الإعلان', body: input.status === 'ACTIVE' ? 'بدأ عرض إعلانك في السوق. تابع النتائج من لوحة المورد.' : input.note ?? 'تواصل مع الإدارة للتفاصيل.', link: '/vendor/ads' });
    }
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'ad', entityId: ad.id, meta: input });
    ok(res, ad);
  }),
);

// ═════════ الفواتير ═════════

marketAdminRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.extend({ status: z.string().max(20).optional(), purpose: z.string().max(20).optional(), vendorId: z.string().optional(), from: optionalDate, to: optionalDate }).parse(req.query);
    const where: Prisma.MarketInvoiceWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.purpose ? { purpose: q.purpose as never } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(range(q.from, q.to) ? { createdAt: range(q.from, q.to) } : {}),
    };
    const [items, total, sums] = await Promise.all([
      prisma.marketInvoice.findMany({ where, orderBy: { createdAt: 'desc' }, include: { vendor: { select: { id: true, name: true } } }, ...pageArgs(q) }),
      prisma.marketInvoice.count({ where }),
      prisma.marketInvoice.groupBy({ by: ['status'], where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    ok(res, { ...paged(items, total, q), sums: Object.fromEntries(sums.map((s) => [s.status, { count: s._count._all, amount: toNum(s._sum.amount ?? 0) }])) });
  }),
);

marketAdminRouter.post(
  '/invoices/:id/paid',
  finance,
  asyncHandler(async (req, res) => {
    const { providerRef, note } = z.object({ providerRef: z.string().trim().max(120).optional().nullable(), note: z.string().trim().max(300).optional().nullable() }).parse(req.body ?? {});
    const inv = await prisma.$transaction((tx) => markInvoicePaid(tx, req.params.id, { providerRef, note }));
    if (inv.vendorId) await marketNotify(prisma, { vendorIds: [inv.vendorId] }, { title: `تم استلام دفعة الفاتورة ${inv.number}`, body: `${inv.description} — ${toNum(inv.amount)} د.أ. شكرًا لك.`, link: '/vendor/subscription' });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'invoice_paid', entity: 'invoice', entityId: inv.id, meta: { providerRef } });
    ok(res, inv);
  }),
);

marketAdminRouter.post(
  '/invoices/:id/cancel',
  finance,
  asyncHandler(async (req, res) => {
    const inv = await prisma.$transaction((tx) => cancelInvoice(tx, req.params.id));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'invoice_cancel', entity: 'invoice', entityId: inv.id });
    ok(res, inv);
  }),
);

// ═════════ التقييمات ═════════

marketAdminRouter.get(
  '/reviews',
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await prisma.supplierReview.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { vendor: { select: { name: true, slug: true } }, customer: { select: { name: true, companyName: true } }, rfq: { select: { code: true } } },
      }),
    );
  }),
);

marketAdminRouter.patch(
  '/reviews/:id',
  asyncHandler(async (req, res) => {
    const { visible } = z.object({ visible: z.boolean() }).parse(req.body);
    const r = await prisma.supplierReview.update({ where: { id: req.params.id }, data: { visible } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: visible ? 'review_show' : 'review_hide', entity: 'review', entityId: r.id });
    ok(res, r);
  }),
);

// ═════════ لوحة السوق والتقرير المالي ═════════

marketAdminRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const { from, to } = z.object({ from: optionalDate, to: optionalDate }).parse(req.query);
    const created = range(from, to);
    const settings = await getSettings();
    const [suppliers, products, rfqs, invoices, deals, pendingProducts, plans] = await Promise.all([
      prisma.vendor.groupBy({ by: ['status'], where: { active: true }, _count: { _all: true } }),
      prisma.product.count({ where: { deletedAt: null, approvalStatus: 'APPROVED' } }),
      prisma.rfq.groupBy({ by: ['status'], where: { deletedAt: null, ...(created ? { createdAt: created } : {}) }, _count: { _all: true } }),
      prisma.marketInvoice.groupBy({ by: ['purpose', 'status'], where: created ? { OR: [{ paidAt: created }, { status: 'PENDING', createdAt: created }] } : {}, _sum: { amount: true }, _count: { _all: true } }),
      prisma.rfq.aggregate({ where: { deletedAt: null, status: { in: ['AWARDED', 'CLOSED'] }, ...(created ? { createdAt: created } : {}) }, _sum: { finalValue: true, commissionAmount: true, expectedValue: true }, _count: { _all: true } }),
      prisma.product.count({ where: { deletedAt: null, approvalStatus: 'PENDING' } }),
      prisma.vendor.groupBy({ by: ['planId'], where: { active: true, status: 'APPROVED' }, _count: { _all: true } }),
    ]);
    const planNames = new Map((await prisma.supplierPlan.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]));
    const inv = (purpose: string, status: string) => invoices.filter((i) => i.purpose === purpose && i.status === status).reduce((n, i) => n + toNum(i._sum.amount ?? 0), 0);
    const paid = { SUBSCRIPTION: inv('SUBSCRIPTION', 'PAID'), AD: inv('AD', 'PAID'), LEAD_FEE: inv('LEAD_FEE', 'PAID'), COMMISSION: inv('COMMISSION', 'PAID'), ORDER: inv('ORDER', 'PAID'), PROCUREMENT: inv('PROCUREMENT', 'PAID') };
    const pending = { SUBSCRIPTION: inv('SUBSCRIPTION', 'PENDING'), AD: inv('AD', 'PENDING'), LEAD_FEE: inv('LEAD_FEE', 'PENDING'), COMMISSION: inv('COMMISSION', 'PENDING') };
    const leadValue = await prisma.rfqRecipient.aggregate({ where: created ? { sentAt: created } : {}, _sum: { leadFee: true }, _count: { _all: true } });
    ok(res, {
      revenueMode: settings.marketRevenueMode,
      suppliers: Object.fromEntries(suppliers.map((s) => [s.status, s._count._all])),
      plans: plans.map((p) => ({ plan: p.planId ? planNames.get(p.planId) ?? '—' : 'بدون', count: p._count._all })),
      products,
      pendingProducts,
      rfqs: Object.fromEntries(rfqs.map((r) => [r.status, r._count._all])),
      deals: { count: deals._count._all, value: toNum(deals._sum.finalValue ?? 0), expected: toNum(deals._sum.expectedValue ?? 0), commission: toNum(deals._sum.commissionAmount ?? 0) },
      leads: { sent: leadValue._count._all, feesValue: toNum(leadValue._sum.leadFee ?? 0) },
      revenue: { paid, pending, total: round3(Object.values(paid).reduce((a, b) => a + b, 0)) },
    });
  }),
);
