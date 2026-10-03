import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { toNum } from '../../lib/money';
import { createInvoice, paymentAccount } from '../../market/payments';
import { storePaymentProof } from '../../market/proof';
import { prisma } from '../../lib/prisma';
import { maskContacts } from '../../market/contacts';
import { contactsRevealed, getThread, postMessage } from '../../market/messaging';
import { marketNotify } from '../../market/notify';
import { defaultPlan } from '../../market/plans';
import { OPEN_STATUSES, acceptQuote, closeRfq, createRfq, rfqEvent } from '../../market/rfq';
import { bumpStat } from '../../market/stats';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { publicProductWhere } from '../../services/catalog.service';
import { getSettings } from '../../services/settings.service';
import { POLICIES, validateAndStore } from '../../services/upload.service';
import { uniqueVendorSlug } from '../../services/vendor.service';
import { nameField, phoneField } from '../../validators/common';
import { productPublicSelect } from '../public/store';

/**
 * السوق الصناعي (B2B): الصفحة الرئيسية، الإعلانات، الانضمام كمورد، وطلبات عروض الأسعار للعملاء.
 */
export const marketRouter = Router();

function parseData(raw: unknown) {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('صيغة البيانات غير صحيحة');
  }
}

const adSelect = {
  id: true,
  type: true,
  placement: true,
  title: true,
  vendor: { select: { id: true, name: true, slug: true, logoUrl: true, verified: true, city: true, isHouse: true, description: true, awardTitle: true, awardUntil: true, plan: { select: { code: true, badge: true } } } },
  product: { select: productPublicSelect },
} satisfies Prisma.MarketAdSelect;

/** الإعلانات الفعّالة الآن في مكان معيّن (وتُحسب مشاهداتها) */
export async function activeAds(placement: string, take = 12) {
  const now = new Date();
  const ads = await prisma.marketAd.findMany({
    where: { status: 'ACTIVE', placement, startsAt: { lte: now }, endsAt: { gte: now }, vendor: { active: true, status: 'APPROVED' } },
    orderBy: [{ price: 'desc' }, { startsAt: 'asc' }],
    take,
    select: adSelect,
  });
  // منتج محذوف أو غير معتمد لا يُعرض
  const visible = ads.filter((a) => !a.product || a.product);
  if (visible.length) {
    void prisma.marketAd.updateMany({ where: { id: { in: visible.map((a) => a.id) } }, data: { impressions: { increment: 1 } } }).catch(() => undefined);
    for (const a of visible) void bumpStat(a.vendor.id, 'adImpressions');
  }
  return visible;
}

/** الصفحة الرئيسية للسوق: الإعلانات، منتجات FARJAR، أحدث المنتجات، الموردون المميزون وأرقام السوق */
marketRouter.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const [ads, farjar, latest, suppliers, stats] = await Promise.all([
      activeAds('MARKET_HOME', 20),
      prisma.product.findMany({ where: publicProductWhere({ vendor: { isHouse: true, active: true, status: 'APPROVED' } }), orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: 8, select: productPublicSelect }),
      prisma.product.findMany({ where: publicProductWhere(), orderBy: { createdAt: 'desc' }, take: 8, select: productPublicSelect }),
      prisma.vendor.findMany({
        where: { active: true, status: 'APPROVED' },
        orderBy: [{ isHouse: 'desc' }, { plan: { searchBoost: 'desc' } }, { verified: 'desc' }, { createdAt: 'asc' }],
        take: 8,
        select: { id: true, name: true, slug: true, logoUrl: true, verified: true, city: true, isHouse: true, businessField: true, awardTitle: true, awardUntil: true, plan: { select: { code: true, badge: true } }, _count: { select: { products: { where: publicProductWhere() } } } },
      }),
      Promise.all([
        prisma.vendor.count({ where: { active: true, status: 'APPROVED' } }),
        prisma.product.count({ where: publicProductWhere() }),
        prisma.rfq.count({ where: { deletedAt: null } }),
      ]),
    ]);
    const byType = (t: string) => ads.filter((a) => a.type === t);
    ok(res, {
      ads: {
        featuredProducts: byType('FEATURED_PRODUCT').filter((a) => a.product),
        featuredSuppliers: byType('FEATURED_SUPPLIER'),
        deals: byType('INDUSTRIAL_DEAL'),
        productOfWeek: byType('PRODUCT_OF_WEEK')[0] ?? null,
        supplierOfMonth: byType('SUPPLIER_OF_MONTH')[0] ?? null,
      },
      farjarProducts: farjar,
      latestProducts: latest,
      suppliers: suppliers.map(({ _count, ...v }) => ({ ...v, productCount: _count.products })),
      stats: { suppliers: stats[0], products: stats[1], rfqs: stats[2] },
    });
  }),
);

/** إعلانات أعلى نتائج البحث */
marketRouter.get(
  '/ads/search',
  asyncHandler(async (_req, res) => {
    ok(res, (await activeAds('SEARCH_TOP', 4)).filter((a) => a.product));
  }),
);

marketRouter.post(
  '/ads/:id/click',
  asyncHandler(async (req, res) => {
    const ad = await prisma.marketAd.findUnique({ where: { id: req.params.id }, select: { id: true, vendorId: true } });
    if (ad) {
      await prisma.marketAd.update({ where: { id: ad.id }, data: { clicks: { increment: 1 } } });
      void bumpStat(ad.vendorId, 'adClicks');
    }
    ok(res, { ok: true });
  }),
);

/** الباقات المتاحة (صفحة الانضمام كمورد) */
/** بيانات حساب التحويل (بنك / CliQ) لدفع الباقات — تظهر في نموذج الانضمام */
marketRouter.get(
  '/payment-account',
  asyncHandler(async (_req, res) => {
    ok(res, await paymentAccount());
  }),
);

marketRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await prisma.supplierPlan.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, code: true, name: true, description: true, price: true, durationDays: true, maxProducts: true, maxUsers: true, maxRfqPerMonth: true, leadsIncluded: true, features: true, badge: true, isDefault: true },
      }),
    );
  }),
);

// ───────────── الانضمام كمورد ─────────────

const joinInput = z.object({
  companyName: z.string().trim().min(2, 'اسم الشركة مطلوب').max(80),
  contactName: nameField,
  phone: phoneField,
  whatsapp: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().toLowerCase().email('البريد غير صحيح').max(120),
  address: z.string().trim().min(3, 'العنوان مطلوب').max(300),
  city: z.string().trim().min(2, 'المدينة مطلوبة').max(60),
  businessField: z.string().trim().min(2, 'مجال العمل مطلوب').max(200),
  productTypes: z.string().trim().min(2, 'نوع المنتجات مطلوب').max(500),
  licenseNumber: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(3000).default(''),
  categoryIds: z.array(z.string()).max(20).default([]),
  /** الباقة التي اختارها عند التسجيل — المدفوعة يدفعها بعد التسجيل ويرفق إيصالها */
  planId: z.string().max(40).optional().nullable(),
  /** رقم الحوالة (CliQ / تحويل) للباقة المدفوعة */
  paymentReference: z.string().trim().max(120).optional().nullable(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'وافق على شروط الانضمام' }) }),
});

const joinUpload = memoryUpload(20, 12).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'catalog', maxCount: 3 },
  { name: 'certificates', maxCount: 8 },
  { name: 'paymentProof', maxCount: 1 },
]);

/** تسجيل مورد جديد: يدخل "بانتظار المراجعة" حتى تعتمده إدارة FARJAR */
marketRouter.post(
  '/suppliers/join',
  requireCustomer,
  formLimiter,
  uploadGuard(80),
  joinUpload,
  asyncHandler(async (req, res) => {
    const input = joinInput.parse(parseData(req.body.data ?? req.body));
    const customerId = req.auth!.sub;
    const existing = await prisma.vendor.findFirst({ where: { OR: [{ customerId }, { members: { some: { customerId } } }] } });
    if (existing) throw conflict('لديك حساب مورد مسبقًا. ادخل لوحة المورد من حسابك.');
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const [logo, catalog, certs] = await Promise.all([
      validateAndStore(files.logo, POLICIES.photos, 'vendors/logos'),
      validateAndStore(files.catalog, POLICIES.technical, 'vendors/catalogs'),
      validateAndStore(files.certificates, POLICIES.technical, 'vendors/certificates'),
    ]);
    const settings = await getSettings();
    const cats = await prisma.category.findMany({ where: { id: { in: input.categoryIds }, deletedAt: null }, select: { id: true } });
    const plan = await defaultPlan();
    // الباقة المدفوعة: إيصال الدفع جزء من طلب الانضمام (يصل الإدارة مع البيانات)
    const chosen = input.planId ? await prisma.supplierPlan.findFirst({ where: { id: input.planId, active: true } }) : null;
    const paid = chosen && toNum(chosen.price) > 0 && chosen.id !== plan?.id ? chosen : null;
    const proof = paid ? await storePaymentProof(files.paymentProof?.[0], { reference: input.paymentReference }) : null;
    const vendor = await prisma.$transaction(async (tx) => {
      const v = await tx.vendor.create({
        data: {
          customerId,
          name: input.companyName,
          slug: await uniqueVendorSlug(tx, input.companyName),
          description: input.description,
          contactName: input.contactName,
          phone: input.phone,
          whatsapp: input.whatsapp || null,
          email: input.email,
          address: input.address,
          city: input.city,
          businessField: input.businessField,
          productTypes: input.productTypes,
          licenseNumber: input.licenseNumber || null,
          categoryIds: cats.map((c) => c.id),
          logoUrl: logo[0]?.url ?? null,
          logoPublicId: logo[0]?.publicId ?? null,
          catalogFiles: catalog.map((f) => ({ url: f.url, name: f.originalName, kind: f.kind })),
          certificates: certs.map((f) => ({ url: f.url, name: f.originalName, kind: f.kind })),
          status: settings.supplierApprovalRequired ? 'PENDING' : 'APPROVED',
          planId: plan?.id ?? null,
          planStartedAt: new Date(),
          commissionPercent: new Prisma.Decimal(0),
        },
      });
      await tx.vendorMember.create({ data: { vendorId: v.id, customerId, role: 'OWNER' } });
      await tx.customer.update({ where: { id: customerId }, data: { companyName: input.companyName } });
      if (paid && proof) {
        const created = await createInvoice(tx, {
          purpose: 'SUBSCRIPTION',
          description: `اشتراك باقة ${paid.name} (${paid.durationDays} يومًا)`,
          amount: toNum(paid.price),
          vendorId: v.id,
          refType: 'plan',
          refId: paid.id,
          dueDays: 7,
        });
        await tx.marketInvoice.update({ where: { id: created.id }, data: proof });
        await tx.vendorSubscription.create({ data: { vendorId: v.id, planId: paid.id, amount: paid.price, invoiceId: created.id } });
      }
      return v;
    });
    emitAdmin({ type: 'supplier.pending', id: vendor.id, title: paid ? `مورد جديد (باقة ${paid.name} مع إيصال دفع): ${vendor.name}` : `مورد جديد بانتظار المراجعة: ${vendor.name}` });
    await audit({ actorType: 'customer', actorId: customerId, action: 'supplier_join', entity: 'vendor', entityId: vendor.id });
    ok(res, { id: vendor.id, slug: vendor.slug, status: vendor.status, plan: paid ? { name: paid.name, price: toNum(paid.price) } : null }, 201);
  }),
);

// ───────────── طلبات عروض الأسعار (العميل) ─────────────

const rfqInput = z.object({
  companyName: z.string().trim().min(2, 'اسم الشركة مطلوب').max(120),
  contactName: nameField,
  phone: phoneField,
  email: z.union([z.string().trim().toLowerCase().email('البريد غير صحيح'), z.literal('')]).optional().nullable().transform((v) => v || null),
  city: z.string().trim().max(60).optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  categoryId: z.string().max(40).optional().nullable(),
  productId: z.string().max(40).optional().nullable(),
  vendorSlug: z.string().max(80).optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(2, 'اكتب المنتج المطلوب').max(200),
        quantity: z.coerce.number().positive('الكمية أكبر من صفر').max(10_000_000),
        unit: z.string().trim().max(20).optional(),
        specs: z.string().trim().max(3000).optional().nullable(),
        brand: z.string().trim().max(80).optional().nullable(),
      }),
    )
    .min(1, 'أضف منتجًا واحدًا على الأقل')
    .max(50),
  budget: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
  neededBy: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(3000).optional().nullable(),
});

const rfqUpload = memoryUpload(20, 10).array('files', 10);

marketRouter.post(
  '/rfqs',
  requireCustomer,
  formLimiter,
  uploadGuard(100),
  rfqUpload,
  asyncHandler(async (req, res) => {
    const input = rfqInput.parse(parseData(req.body.data ?? req.body));
    if (input.neededBy && input.neededBy < new Date(Date.now() - 86400_000)) throw badRequest('تاريخ الحاجة في الماضي', { fields: { neededBy: 'اختر تاريخًا قادمًا' } });
    const stored = await validateAndStore((req.files as Express.Multer.File[] | undefined) ?? [], POLICIES.technical, 'rfqs');
    const rfq = await createRfq(req.auth!.sub, {
      ...input,
      attachments: stored.map((f) => ({ url: f.url, name: f.originalName, kind: f.kind, publicId: f.publicId })),
    });
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: 'create', entity: 'rfq', entityId: rfq.id, meta: { code: rfq.code } });
    ok(res, { id: rfq.id, code: rfq.code, status: rfq.status }, 201);
  }),
);

marketRouter.get(
  '/rfqs',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const rows = await prisma.rfq.findMany({
      where: { customerId: req.auth!.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        createdAt: true,
        neededBy: true,
        finalValue: true,
        _count: { select: { items: true, recipients: true, quotes: { where: { status: { not: 'WITHDRAWN' } } } } },
      },
    });
    ok(res, rows.map(({ _count, ...r }) => ({ ...r, itemCount: _count.items, supplierCount: _count.recipients, quoteCount: _count.quotes })));
  }),
);

async function ownRfq(customerId: string, id: string) {
  const r = await prisma.rfq.findFirst({ where: { id, customerId, deletedAt: null } });
  if (!r) throw notFound('الطلب غير موجود');
  return r;
}

/** تفاصيل الطلب للعميل: البنود، العروض للمقارنة، المحادثات، وبيانات تواصل المورد بعد القبول فقط */
marketRouter.get(
  '/rfqs/:id',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const base = await ownRfq(req.auth!.sub, req.params.id);
    const rfq = await prisma.rfq.findUniqueOrThrow({
      where: { id: base.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        category: { select: { id: true, name: true, slug: true } },
        product: { select: { id: true, name: true, slug: true } },
        quotes: {
          where: { status: { not: 'WITHDRAWN' } },
          orderBy: { total: 'asc' },
          include: { vendor: { select: { id: true, name: true, slug: true, logoUrl: true, verified: true, city: true, isHouse: true, phone: true, email: true, whatsapp: true, plan: { select: { code: true, badge: true } } } } },
        },
        recipients: { select: { vendorId: true, status: true } },
        conversations: { select: { vendorId: true, lastAt: true, customerReadAt: true, _count: { select: { messages: true } } } },
        events: { orderBy: { createdAt: 'asc' }, select: { action: true, actorType: true, createdAt: true, note: true } },
        reviews: { select: { vendorId: true, overall: true } },
      },
    });
    const ratings = await prisma.supplierReview.groupBy({ by: ['vendorId'], where: { vendorId: { in: rfq.quotes.map((q) => q.vendorId) }, visible: true }, _avg: { overall: true }, _count: { _all: true } });
    const rating = new Map(ratings.map((r) => [r.vendorId, { average: Math.round((r._avg.overall ?? 0) * 10) / 10, count: r._count._all }]));
    const quotes = await Promise.all(
      rfq.quotes.map(async ({ vendor, filePublicId: _f, ...q }) => {
        const reveal = await contactsRevealed(rfq, vendor.id);
        // نصوص العرض الحرة تُخفى منها الأرقام والبريد حتى الترسية (منع تجاوز المنصة)
        const hide = (t: string | null) => (t && !reveal ? maskContacts(t).text : t);
        return {
          ...q,
          notes: hide(q.notes),
          specs: hide(q.specs),
          paymentTerms: hide(q.paymentTerms),
          warranty: hide(q.warranty),
          vendor: {
            id: vendor.id,
            name: vendor.name,
            slug: vendor.slug,
            logoUrl: vendor.logoUrl,
            verified: vendor.verified,
            city: vendor.city,
            isHouse: vendor.isHouse,
            plan: vendor.plan,
            rating: rating.get(vendor.id) ?? null,
            contact: reveal ? { phone: vendor.phone, email: vendor.email, whatsapp: vendor.whatsapp } : null,
          },
        };
      }),
    );
    const accepted = quotes.find((q) => q.id === rfq.acceptedQuoteId);
    ok(res, {
      ...rfq,
      quotes,
      recipients: undefined,
      supplierCount: rfq.recipients.length,
      respondedCount: rfq.recipients.filter((r) => r.status === 'QUOTED').length,
      conversations: rfq.conversations.map((c) => ({ vendorId: c.vendorId, lastAt: c.lastAt, messages: c._count.messages, unread: !c.customerReadAt || c.customerReadAt < c.lastAt })),
      canReview: Boolean(accepted && ['AWARDED', 'CLOSED'].includes(rfq.status) && !rfq.reviews.some((r) => r.vendorId === accepted.vendorId)),
      open: OPEN_STATUSES.includes(rfq.status),
    });
  }),
);

marketRouter.post(
  '/rfqs/:id/quotes/:quoteId/accept',
  requireCustomer,
  asyncHandler(async (req, res) => {
    await ownRfq(req.auth!.sub, req.params.id);
    const r = await acceptQuote(req.auth!.sub, req.params.id, req.params.quoteId);
    await audit({ actorType: 'customer', actorId: req.auth!.sub, action: 'accept_quote', entity: 'rfq', entityId: r.id, meta: { quoteId: req.params.quoteId } });
    ok(res, { id: r.id, status: r.status });
  }),
);

marketRouter.post(
  '/rfqs/:id/cancel',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const rfq = await ownRfq(req.auth!.sub, req.params.id);
    const { note } = z.object({ note: z.string().trim().max(500).optional().nullable() }).parse(req.body ?? {});
    const r = await closeRfq(rfq.id, { kind: 'customer', id: req.auth!.sub, name: rfq.contactName }, { cancel: true, note });
    ok(res, { id: r.id, status: r.status });
  }),
);

/** العميل يؤكد إتمام التوريد (يغلق الطلب ويتيح التقييم) */
marketRouter.post(
  '/rfqs/:id/complete',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const rfq = await ownRfq(req.auth!.sub, req.params.id);
    if (rfq.status !== 'AWARDED') throw conflict('يُغلق الطلب بعد قبول عرض');
    const r = await closeRfq(rfq.id, { kind: 'customer', id: req.auth!.sub, name: rfq.contactName }, { note: 'أكد العميل استلام التوريد' });
    ok(res, { id: r.id, status: r.status });
  }),
);

marketRouter.get(
  '/rfqs/:id/messages/:vendorId',
  requireCustomer,
  asyncHandler(async (req, res) => {
    await ownRfq(req.auth!.sub, req.params.id);
    ok(res, await getThread(req.params.id, req.params.vendorId, 'CUSTOMER'));
  }),
);

marketRouter.post(
  '/rfqs/:id/messages/:vendorId',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, res) => {
    const rfq = await ownRfq(req.auth!.sub, req.params.id);
    const { body } = z.object({ body: z.string().max(4000) }).parse(req.body);
    const m = await postMessage(rfq.id, req.params.vendorId, { side: 'CUSTOMER', id: req.auth!.sub, name: rfq.contactName }, body);
    ok(res, m, 201);
  }),
);

const star = z.coerce.number().int().min(1, 'اختر تقييمًا').max(5);

/** تقييم المورد: مرة واحدة، وفقط للمورد الذي قُبل عرضه في هذا الطلب (منع التقييمات الوهمية) */
marketRouter.post(
  '/rfqs/:id/review',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, res) => {
    const rfq = await ownRfq(req.auth!.sub, req.params.id);
    const input = z.object({ quality: star, delivery: star, commitment: star, communication: star, overall: star, comment: z.string().trim().max(1000).optional().nullable() }).parse(req.body);
    if (!rfq.acceptedQuoteId || !['AWARDED', 'CLOSED'].includes(rfq.status)) throw conflict('يمكن التقييم بعد قبول عرض وإتمام الصفقة');
    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: rfq.acceptedQuoteId } });
    if (await prisma.supplierReview.findUnique({ where: { rfqId_vendorId: { rfqId: rfq.id, vendorId: quote.vendorId } } })) throw conflict('قيّمت هذا المورد مسبقًا');
    const review = await prisma.$transaction(async (tx) => {
      const r = await tx.supplierReview.create({ data: { ...input, comment: input.comment || null, rfqId: rfq.id, vendorId: quote.vendorId, customerId: req.auth!.sub } });
      await rfqEvent(tx, rfq.id, { kind: 'customer', id: req.auth!.sub, name: rfq.contactName }, 'reviewed', null, { overall: input.overall });
      await marketNotify(tx, { vendorIds: [quote.vendorId] }, { title: 'تقييم جديد لشركتك', body: `قيّمك عميل بـ ${input.overall}/5 على الطلب ${rfq.code}.`, link: `/vendor/rfqs/${rfq.id}` });
      return r;
    });
    ok(res, review, 201);
  }),
);

/** للاستخدام الداخلي في الإحصائيات */
export const rfqValue = (v: Prisma.Decimal | null) => (v == null ? null : toNum(v));
