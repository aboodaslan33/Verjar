import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { ammanParts } from '../../lib/time';
import { maskContacts, partialEmail, partialPhone } from '../../market/contacts';
import { contactsRevealed, getThread, postMessage } from '../../market/messaging';
import { activateSubscription, cancelInvoice, createInvoice, paymentAccount, paymentProvider } from '../../market/payments';
import { emitAdmin } from '../../lib/events';
import { storePaymentProof } from '../../market/proof';
import { assertMemberQuota, effectivePlan, planFeatures, rfqQuotaLeft } from '../../market/plans';
import { OPEN_STATUSES, rfqEvent, submitQuote } from '../../market/rfq';
import { requireApprovedVendor, requireVendorOwner } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { POLICIES, validateAndStore } from '../../services/upload.service';

/** السوق الصناعي في لوحة المورد: الطلبات والعروض والمحادثات والإحصائيات والاشتراك والإعلانات والفريق */
export const vendorMarketRouter = Router();

type VReq = { vendor?: { id: string; name: string } };
const vid = (req: VReq) => req.vendor!.id;

async function vendorRow(id: string) {
  return prisma.vendor.findUniqueOrThrow({ where: { id }, include: { plan: true } });
}

/** ملخص السوق للمورد: الحالة، الباقة وحدودها، والأرقام */
vendorMarketRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const v = await vendorRow(vid(req));
    const plan = await effectivePlan(v);
    const since = new Date(Date.now() - 30 * 86400_000);
    const [products, members, quota, stats, rfqCounts, deals, rating, pendingInvoices] = await Promise.all([
      prisma.product.count({ where: { vendorId: v.id, deletedAt: null } }),
      prisma.vendorMember.count({ where: { vendorId: v.id } }),
      rfqQuotaLeft(v),
      prisma.vendorDailyStat.aggregate({ where: { vendorId: v.id, day: { gte: ammanParts(since).date } }, _sum: { profileViews: true, productViews: true, rfqs: true, quotes: true } }),
      prisma.rfqRecipient.groupBy({ by: ['status'], where: { vendorId: v.id }, _count: { _all: true } }),
      prisma.quote.aggregate({ where: { vendorId: v.id, status: 'ACCEPTED' }, _sum: { total: true }, _count: { _all: true } }),
      prisma.supplierReview.aggregate({ where: { vendorId: v.id, visible: true }, _avg: { overall: true }, _count: { _all: true } }),
      prisma.marketInvoice.count({ where: { vendorId: v.id, status: 'PENDING' } }),
    ]);
    const counts = Object.fromEntries(rfqCounts.map((r) => [r.status, r._count._all]));
    ok(res, {
      vendor: {
        id: v.id,
        name: v.name,
        slug: v.slug,
        status: v.status,
        rejectionReason: v.rejectionReason,
        verified: v.verified,
        isHouse: v.isHouse,
        planStartedAt: v.planStartedAt,
        planExpiresAt: v.planExpiresAt,
      },
      plan: plan ? { id: plan.id, code: plan.code, name: plan.name, price: plan.price, maxProducts: plan.maxProducts, maxUsers: plan.maxUsers, maxRfqPerMonth: plan.maxRfqPerMonth, leadsIncluded: plan.leadsIncluded, features: planFeatures(plan) } : null,
      planExpired: Boolean(v.planId && plan?.id !== v.planId),
      usage: { products, members, rfqQuotaLeft: Number.isFinite(quota) ? quota : null },
      last30: { profileViews: stats._sum.profileViews ?? 0, productViews: stats._sum.productViews ?? 0, rfqs: stats._sum.rfqs ?? 0, quotes: stats._sum.quotes ?? 0 },
      rfqs: { total: Object.values(counts).reduce((a, b) => a + b, 0), newCount: (counts.SENT ?? 0) + (counts.VIEWED ?? 0), quoted: counts.QUOTED ?? 0 },
      deals: { count: deals._count._all, value: toNum(deals._sum.total ?? 0) },
      rating: rating._count._all ? { average: Math.round((rating._avg.overall ?? 0) * 10) / 10, count: rating._count._all } : null,
      pendingInvoices,
    });
  }),
);

// ───────────── طلبات عروض الأسعار ─────────────

const TABS = ['new', 'negotiating', 'quoted', 'accepted', 'closed'] as const;

function tabWhere(vendorId: string, tab: (typeof TABS)[number]): Prisma.RfqRecipientWhereInput {
  const base = { vendorId, rfq: { deletedAt: null } };
  switch (tab) {
    case 'new':
      return { ...base, status: { in: ['SENT', 'VIEWED'] }, rfq: { deletedAt: null, status: { in: OPEN_STATUSES } } };
    case 'negotiating':
      return { ...base, status: { not: 'DECLINED' }, rfq: { deletedAt: null, status: 'NEGOTIATING', conversations: { some: { vendorId } } } };
    case 'quoted':
      return { ...base, rfq: { deletedAt: null, quotes: { some: { vendorId, status: 'SUBMITTED' } } } };
    case 'accepted':
      return { ...base, rfq: { deletedAt: null, quotes: { some: { vendorId, status: 'ACCEPTED' } } } };
    case 'closed':
      return {
        ...base,
        OR: [
          { status: 'DECLINED' },
          { rfq: { status: { in: ['CLOSED', 'CANCELLED'] }, NOT: { quotes: { some: { vendorId, status: 'ACCEPTED' } } } } },
          { rfq: { quotes: { some: { vendorId, status: { in: ['REJECTED', 'WITHDRAWN'] } } } } },
        ],
      };
  }
}

vendorMarketRouter.get(
  '/rfqs',
  asyncHandler(async (req, res) => {
    const { tab } = z.object({ tab: z.enum(TABS).default('new') }).parse(req.query);
    const v = vid(req);
    const [rows, counts] = await Promise.all([
      prisma.rfqRecipient.findMany({
        where: tabWhere(v, tab),
        orderBy: { sentAt: 'desc' },
        take: 100,
        select: {
          status: true,
          sentAt: true,
          source: true,
          rfq: {
            select: {
              id: true,
              code: true,
              title: true,
              city: true,
              status: true,
              neededBy: true,
              createdAt: true,
              category: { select: { name: true } },
              _count: { select: { items: true } },
              quotes: { where: { vendorId: v }, select: { total: true, status: true } },
              conversations: { where: { vendorId: v }, select: { lastAt: true, vendorReadAt: true } },
            },
          },
        },
      }),
      Promise.all(TABS.map((t) => prisma.rfqRecipient.count({ where: tabWhere(v, t) }))),
    ]);
    ok(res, {
      counts: Object.fromEntries(TABS.map((t, i) => [t, counts[i]])),
      items: rows.map((r) => ({
        ...r.rfq,
        itemCount: r.rfq._count.items,
        myQuote: r.rfq.quotes[0] ?? null,
        unread: Boolean(r.rfq.conversations[0] && (!r.rfq.conversations[0].vendorReadAt || r.rfq.conversations[0].vendorReadAt < r.rfq.conversations[0].lastAt)),
        recipientStatus: r.status,
        sentAt: r.sentAt,
        source: r.source,
        quotes: undefined,
        conversations: undefined,
        _count: undefined,
      })),
    });
  }),
);

async function recipientOf(vendorId: string, rfqId: string) {
  const rec = await prisma.rfqRecipient.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId } } });
  if (!rec) throw notFound('الطلب غير موجود');
  return rec;
}

/** تفاصيل الطلب للمورد: بيانات العميل مخفية جزئيًا حتى قبول عرضه */
vendorMarketRouter.get(
  '/rfqs/:id',
  asyncHandler(async (req, res) => {
    const v = vid(req);
    const rec = await recipientOf(v, req.params.id);
    const rfq = await prisma.rfq.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        category: { select: { name: true } },
        product: { select: { name: true, slug: true } },
        quotes: { where: { vendorId: v } },
        _count: { select: { quotes: { where: { status: { not: 'WITHDRAWN' } } } } },
      },
    });
    if (rec.status === 'SENT') {
      await prisma.rfqRecipient.update({ where: { id: rec.id }, data: { status: 'VIEWED', viewedAt: new Date() } });
      await rfqEvent(prisma, rfq.id, { kind: 'vendor', id: v, name: req.vendor!.name }, 'viewed');
    }
    const reveal = await contactsRevealed(rfq, v);
    const { phone, email, customerId: _c, expectedValue: _e, budget: _b, finalValue, commissionAmount: _ca, commissionRate: _cr, commissionRuleId: _cri, adminNote: _an, revenueModel: _rm, quotes, _count, ...rest } = rfq;
    const hide = (t: string | null) => (t && !reveal ? maskContacts(t).text : t);
    ok(res, {
      ...rest,
      location: hide(rest.location),
      notes: hide(rest.notes),
      items: rest.items.map((it) => ({ ...it, specs: hide(it.specs), name: hide(it.name) ?? it.name })),
      contact: reveal ? { phone, email, contactName: rfq.contactName } : { phone: partialPhone(phone), email: partialEmail(email), contactName: rfq.contactName, hidden: true },
      myQuote: quotes[0] ? { ...quotes[0], filePublicId: undefined } : null,
      competitorCount: Math.max(0, _count.quotes - (quotes[0] && quotes[0].status !== 'WITHDRAWN' ? 1 : 0)),
      finalValue: quotes[0]?.status === 'ACCEPTED' ? finalValue : null,
      recipientStatus: rec.status === 'SENT' ? 'VIEWED' : rec.status,
      open: OPEN_STATUSES.includes(rfq.status),
      canQuote: req.vendor && OPEN_STATUSES.includes(rfq.status) && rec.status !== 'DECLINED',
    });
  }),
);

const quoteInput = z.object({
  unitPrice: z.coerce.number().min(0, 'سعر الوحدة لا يكون سالبًا').max(100_000_000),
  quantity: z.coerce.number().positive('الكمية أكبر من صفر').max(100_000_000),
  total: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).max(730).optional().nullable(),
  warranty: z.string().trim().max(200).optional().nullable(),
  originCountry: z.string().trim().max(60).optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  specs: z.string().trim().max(3000).optional().nullable(),
  paymentTerms: z.string().trim().max(500).optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(3000).optional().nullable(),
});

const quoteUpload = memoryUpload(20, 1).single('file');

vendorMarketRouter.post(
  '/rfqs/:id/quote',
  requireApprovedVendor,
  formLimiter,
  uploadGuard(25),
  quoteUpload,
  asyncHandler(async (req, res) => {
    const raw = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const input = quoteInput.parse(raw);
    if (input.validUntil && input.validUntil < new Date()) throw badRequest('تاريخ صلاحية العرض في الماضي', { fields: { validUntil: 'اختر تاريخًا قادمًا' } });
    const rec = await recipientOf(vid(req), req.params.id);
    if (rec.status === 'DECLINED') throw conflict('اعتذرت عن هذا الطلب سابقًا');
    const [file] = req.file ? await validateAndStore([req.file], POLICIES.technical, 'quotes') : [];
    const q = await submitQuote({ id: vid(req), name: req.vendor!.name }, req.params.id, {
      ...input,
      total: input.total ?? round3(input.unitPrice * input.quantity),
      fileUrl: file?.url ?? null,
      filePublicId: file?.publicId ?? null,
    });
    await audit({ actorType: 'vendor', action: 'quote', entity: 'rfq', entityId: req.params.id, meta: { vendorId: vid(req), total: toNum(q.total) } });
    ok(res, q, 201);
  }),
);

vendorMarketRouter.post(
  '/rfqs/:id/decline',
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(300).optional().nullable() }).parse(req.body ?? {});
    const rec = await recipientOf(vid(req), req.params.id);
    const quote = await prisma.quote.findUnique({ where: { rfqId_vendorId: { rfqId: rec.rfqId, vendorId: vid(req) } } });
    if (quote?.status === 'ACCEPTED') throw conflict('تم قبول عرضك على هذا الطلب');
    await prisma.$transaction(async (tx) => {
      await tx.rfqRecipient.update({ where: { id: rec.id }, data: { status: 'DECLINED', respondedAt: new Date(), declineReason: reason ?? null } });
      if (quote && quote.status === 'SUBMITTED') await tx.quote.update({ where: { id: quote.id }, data: { status: 'WITHDRAWN' } });
      await rfqEvent(tx, rec.rfqId, { kind: 'vendor', id: vid(req), name: req.vendor!.name }, 'declined', reason ?? null);
    });
    ok(res, { declined: true });
  }),
);

vendorMarketRouter.post(
  '/rfqs/:id/withdraw',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quote.findUnique({ where: { rfqId_vendorId: { rfqId: req.params.id, vendorId: vid(req) } } });
    if (!quote || quote.status !== 'SUBMITTED') throw notFound('لا يوجد عرض قابل للسحب');
    await prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'WITHDRAWN' } });
      await tx.rfqRecipient.update({ where: { rfqId_vendorId: { rfqId: quote.rfqId, vendorId: vid(req) } }, data: { status: 'VIEWED' } });
      await rfqEvent(tx, quote.rfqId, { kind: 'vendor', id: vid(req), name: req.vendor!.name }, 'quote_withdrawn');
    });
    ok(res, { withdrawn: true });
  }),
);

vendorMarketRouter.get(
  '/rfqs/:id/messages',
  asyncHandler(async (req, res) => {
    await recipientOf(vid(req), req.params.id);
    ok(res, await getThread(req.params.id, vid(req), 'VENDOR'));
  }),
);

vendorMarketRouter.post(
  '/rfqs/:id/messages',
  requireApprovedVendor,
  formLimiter,
  asyncHandler(async (req, res) => {
    await recipientOf(vid(req), req.params.id);
    const { body } = z.object({ body: z.string().max(4000) }).parse(req.body);
    ok(res, await postMessage(req.params.id, vid(req), { side: 'VENDOR', id: vid(req), name: req.vendor!.name }, body), 201);
  }),
);

// ───────────── الإحصائيات ─────────────

vendorMarketRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    const v = await vendorRow(vid(req));
    const plan = await effectivePlan(v);
    const f = planFeatures(plan);
    const from = ammanParts(new Date(Date.now() - (days - 1) * 86400_000)).date;
    const [daily, topProducts, quotes] = await Promise.all([
      prisma.vendorDailyStat.findMany({ where: { vendorId: v.id, day: { gte: from } }, orderBy: { day: 'asc' } }),
      prisma.product.findMany({ where: { vendorId: v.id, deletedAt: null }, orderBy: { views: 'desc' }, take: 10, select: { id: true, name: true, slug: true, views: true } }),
      prisma.quote.groupBy({ by: ['status'], where: { vendorId: v.id }, _count: { _all: true }, _sum: { total: true } }),
    ]);
    const interested = await prisma.rfq.findMany({ where: { recipients: { some: { vendorId: v.id } } }, distinct: ['customerId'], select: { customerId: true } });
    ok(res, {
      analyticsEnabled: f.analytics || v.isHouse,
      advanced: f.advancedReports || v.isHouse,
      daily: f.analytics || v.isHouse ? daily : [],
      topProducts: f.analytics || v.isHouse ? topProducts : [],
      totals: {
        profileViews: v.profileViews,
        productViews: daily.reduce((n, d) => n + d.productViews, 0),
        rfqs: daily.reduce((n, d) => n + d.rfqs, 0),
        quotes: daily.reduce((n, d) => n + d.quotes, 0),
        interestedCustomers: interested.length,
        adImpressions: daily.reduce((n, d) => n + d.adImpressions, 0),
        adClicks: daily.reduce((n, d) => n + d.adClicks, 0),
      },
      quotes: Object.fromEntries(quotes.map((q) => [q.status, { count: q._count._all, value: toNum(q._sum.total ?? 0) }])),
    });
  }),
);

// ───────────── الاشتراك والفواتير ─────────────

vendorMarketRouter.get(
  '/subscription',
  asyncHandler(async (req, res) => {
    const v = await vendorRow(vid(req));
    const [plans, history, invoices] = await Promise.all([
      prisma.supplierPlan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.vendorSubscription.findMany({ where: { vendorId: v.id }, orderBy: { createdAt: 'desc' }, take: 20, include: { plan: { select: { name: true, code: true } }, invoice: { select: { number: true, status: true } } } }),
      prisma.marketInvoice.findMany({ where: { vendorId: v.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const plan = await effectivePlan(v);
    ok(res, {
      current: plan,
      planId: v.planId,
      startedAt: v.planStartedAt,
      expiresAt: v.planExpiresAt,
      plans,
      history,
      invoices: invoices.map(({ proofPublicId: _p, ...i }) => i),
      paymentProvider: paymentProvider().name,
      account: await paymentAccount(),
    });
  }),
);

// ───────────── الدفع اليدوي ─────────────

const proofUpload = memoryUpload(10, 1).single('file');
const proofMeta = z.object({ reference: z.string().trim().max(120).optional().nullable(), note: z.string().trim().max(500).optional().nullable() });
const bodyData = (req: { body: Record<string, unknown> }) => (typeof req.body?.data === 'string' ? JSON.parse(req.body.data as string) : req.body ?? {});

const requireProof = (req: { file?: Express.Multer.File }, meta: z.infer<typeof proofMeta>) => storePaymentProof(req.file, meta);

/** طلب ترقية/تجديد: الباقة المدفوعة تُطلب مع إيصال الدفع (تُراجعه الإدارة)، والمجانية تُفعَّل فورًا */
vendorMarketRouter.post(
  '/subscription',
  requireVendorOwner,
  formLimiter,
  uploadGuard(15),
  proofUpload,
  asyncHandler(async (req, res) => {
    const raw = bodyData(req);
    const { planId } = z.object({ planId: z.string().min(1) }).parse(raw);
    const meta = proofMeta.parse(raw);
    const plan = await prisma.supplierPlan.findFirst({ where: { id: planId, active: true } });
    if (!plan) throw notFound('الباقة غير متاحة');
    const price = toNum(plan.price);
    const pending = await prisma.vendorSubscription.findFirst({ where: { vendorId: vid(req), status: 'PENDING_PAYMENT' }, include: { invoice: true } });
    if (pending?.invoice?.proofStatus === 'SUBMITTED') throw conflict('لديك طلب اشتراك قيد مراجعة الدفع. انتظر تأكيد الإدارة قبل طلب باقة أخرى.');
    const proof = price > 0 ? await requireProof(req, meta) : null;
    const result = await prisma.$transaction(async (tx) => {
      // طلب سابق لم يُدفع (بدون إيصال أو رُفض إيصاله) يُستبدل بالطلب الجديد
      if (pending?.invoiceId) await cancelInvoice(tx, pending.invoiceId);
      else if (pending) await tx.vendorSubscription.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
      const invoice = proof
        ? await createInvoice(tx, { purpose: 'SUBSCRIPTION', description: `اشتراك باقة ${plan.name} (${plan.durationDays} يومًا)`, amount: price, vendorId: vid(req), refType: 'plan', refId: plan.id, dueDays: 7 })
        : null;
      const withProof = invoice ? await tx.marketInvoice.update({ where: { id: invoice.id }, data: proof! }) : null;
      const sub = await tx.vendorSubscription.create({ data: { vendorId: vid(req), planId: plan.id, amount: plan.price, invoiceId: invoice?.id ?? null } });
      if (!invoice) await activateSubscription(tx, sub.id);
      return { sub, invoice: withProof };
    });
    if (result.invoice) emitAdmin({ type: 'invoice.proof', id: result.invoice.id, title: `طلب باقة ${plan.name} مع إيصال دفع — ${req.vendor!.name}` });
    await audit({ actorType: 'vendor', action: 'subscription_request', entity: 'vendor', entityId: vid(req), meta: { plan: plan.code, invoice: result.invoice?.number ?? null } });
    const invoice = result.invoice ? (({ proofPublicId: _p, ...i }) => i)(result.invoice) : null;
    ok(res, { subscriptionId: result.sub.id, invoice, activated: !result.invoice }, 201);
  }),
);

// ───────────── الدفع اليدوي: إثبات الدفع ─────────────

/** المورد يرفع صورة أو PDF لإيصال الحوالة مع رقم المرجع — تصل للإدارة للمراجعة */
vendorMarketRouter.post(
  '/invoices/:id/proof',
  formLimiter,
  uploadGuard(15),
  proofUpload,
  asyncHandler(async (req, res) => {
    const raw = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const input = z
      .object({
        reference: z.string().trim().max(120).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(raw ?? {});
    const inv = await prisma.marketInvoice.findFirst({ where: { id: req.params.id, vendorId: vid(req) } });
    if (!inv) throw notFound('الفاتورة غير موجودة');
    if (inv.status !== 'PENDING') throw conflict('هذه الفاتورة ليست بانتظار الدفع');
    if (!req.file) throw badRequest('أرفق صورة أو ملف PDF لإيصال الدفع', { fields: { file: 'أرفق إثبات الدفع' } });
    const [file] = await validateAndStore([req.file], POLICIES.documents, 'payments');
    const updated = await prisma.marketInvoice.update({
      where: { id: inv.id },
      data: {
        proofUrl: file.url,
        proofPublicId: file.publicId,
        proofName: file.originalName.slice(0, 120),
        proofKind: file.kind,
        proofStatus: 'SUBMITTED',
        proofSubmittedAt: new Date(),
        payerReference: input.reference || inv.payerReference,
        payerNote: input.note || null,
        reviewNote: null,
      },
    });
    emitAdmin({ type: 'invoice.proof', id: inv.id, title: `إثبات دفع جديد للفاتورة ${inv.number} — ${req.vendor!.name}` });
    await audit({ actorType: 'vendor', action: 'invoice_proof', entity: 'invoice', entityId: inv.id, meta: { number: inv.number, reference: input.reference ?? null } });
    const { proofPublicId: _p, ...out } = updated;
    ok(res, out, 201);
  }),
);

/** المورد يلغي طلبًا لم يدفعه بعد (مثلًا اختار باقة خاطئة) — لا يُلغى بعد إرسال إثبات الدفع */
vendorMarketRouter.post(
  '/invoices/:id/cancel',
  requireVendorOwner,
  asyncHandler(async (req, res) => {
    const inv = await prisma.marketInvoice.findFirst({ where: { id: req.params.id, vendorId: vid(req) } });
    if (!inv) throw notFound('الفاتورة غير موجودة');
    if (inv.status !== 'PENDING') throw conflict('هذه الفاتورة ليست بانتظار الدفع');
    if (inv.proofStatus === 'SUBMITTED') throw conflict('أرسلت إثبات الدفع وهو قيد المراجعة. تواصل مع الإدارة للإلغاء.');
    if (inv.purpose !== 'SUBSCRIPTION' && inv.purpose !== 'AD') throw conflict('لا يمكن إلغاء هذه الفاتورة');
    await prisma.$transaction((tx) => cancelInvoice(tx, inv.id));
    await audit({ actorType: 'vendor', action: 'invoice_cancel', entity: 'invoice', entityId: inv.id });
    ok(res, { cancelled: true });
  }),
);

// ───────────── الإعلانات ─────────────

vendorMarketRouter.get(
  '/ads',
  asyncHandler(async (req, res) => {
    const [ads, packages] = await Promise.all([
      prisma.marketAd.findMany({ where: { vendorId: vid(req) }, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true, slug: true } }, invoice: { select: { id: true, number: true, status: true, amount: true, purpose: true, description: true, createdAt: true, dueAt: true, proofStatus: true, proofSubmittedAt: true, reviewNote: true, payerReference: true } } } }),
      prisma.adPackage.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    ok(res, { ads, packages, account: await paymentAccount() });
  }),
);

vendorMarketRouter.post(
  '/ads',
  requireApprovedVendor,
  formLimiter,
  uploadGuard(15),
  proofUpload,
  asyncHandler(async (req, res) => {
    const raw = bodyData(req);
    const input = z.object({ packageId: z.string().min(1), productId: z.string().optional().nullable(), startsAt: z.coerce.date().optional().nullable(), note: z.string().trim().max(300).optional().nullable() }).parse(raw);
    const meta = proofMeta.parse({ reference: raw.reference, note: raw.payerNote });
    const pkg = await prisma.adPackage.findFirst({ where: { id: input.packageId, active: true } });
    if (!pkg) throw notFound('باقة الإعلان غير متاحة');
    const needsProduct = ['FEATURED_PRODUCT', 'PRODUCT_OF_WEEK', 'INDUSTRIAL_DEAL'].includes(pkg.type);
    if (needsProduct && !input.productId) throw badRequest('اختر المنتج المعلن عنه', { fields: { productId: 'اختر المنتج' } });
    if (input.productId && !(await prisma.product.findFirst({ where: { id: input.productId, vendorId: vid(req), deletedAt: null, approvalStatus: 'APPROVED' } }))) {
      throw badRequest('المنتج غير موجود أو لم يُعتمد بعد', { fields: { productId: 'اختر منتجًا معتمدًا' } });
    }
    const startsAt = input.startsAt && input.startsAt > new Date() ? input.startsAt : new Date();
    const price = toNum(pkg.price);
    const proof = price > 0 ? await requireProof(req, meta) : null;
    const out = await prisma.$transaction(async (tx) => {
      const created = proof ? await createInvoice(tx, { purpose: 'AD', description: `إعلان: ${pkg.name}`, amount: price, vendorId: vid(req), refType: 'adPackage', refId: pkg.id, dueDays: 3 }) : null;
      const invoice = created ? await tx.marketInvoice.update({ where: { id: created.id }, data: proof! }) : null;
      const ad = await tx.marketAd.create({
        data: {
          type: pkg.type,
          placement: pkg.placement,
          vendorId: vid(req),
          productId: input.productId ?? null,
          packageId: pkg.id,
          price: pkg.price,
          startsAt,
          endsAt: new Date(startsAt.getTime() + pkg.durationDays * 86400_000),
          status: invoice ? 'PENDING_PAYMENT' : 'REQUESTED',
          invoiceId: invoice?.id ?? null,
          note: input.note ?? null,
        },
      });
      return { ad, invoice };
    });
    if (out.invoice) emitAdmin({ type: 'invoice.proof', id: out.invoice.id, title: `طلب إعلان ${pkg.name} مع إيصال دفع — ${req.vendor!.name}` });
    ok(res, { ad: out.ad, invoice: out.invoice ? (({ proofPublicId: _p, ...i }) => i)(out.invoice) : null }, 201);
  }),
);

// ───────────── فريق المورد ─────────────

vendorMarketRouter.get(
  '/team',
  asyncHandler(async (req, res) => {
    const members = await prisma.vendorMember.findMany({ where: { vendorId: vid(req) }, orderBy: { createdAt: 'asc' }, include: { customer: { select: { id: true, name: true, phone: true, email: true } } } });
    const v = await vendorRow(vid(req));
    const plan = await effectivePlan(v);
    ok(res, { members, maxUsers: plan?.maxUsers ?? 1, role: (req as { vendor?: { role: string } }).vendor?.role });
  }),
);

/** إضافة موظف: حساب عميل مسجّل (بهاتفه أو بريده) — حسب عدد المستخدمين في الباقة */
vendorMarketRouter.post(
  '/team',
  requireVendorOwner,
  formLimiter,
  asyncHandler(async (req, res) => {
    const { identifier } = z.object({ identifier: z.string().trim().min(5, 'اكتب هاتف أو بريد الموظف').max(120) }).parse(req.body);
    const phone = normalizePhone(identifier);
    const customer = await prisma.customer.findFirst({
      where: { deletedAt: null, passwordHash: { not: null }, OR: [...(phone ? [{ phone }] : []), { email: identifier.toLowerCase() }] },
      select: { id: true, name: true },
    });
    if (!customer) throw notFound('لا يوجد حساب مسجّل بهذا الهاتف أو البريد. اطلب من الموظف التسجيل في الموقع أولًا.');
    const other = await prisma.vendor.findFirst({ where: { id: { not: vid(req) }, OR: [{ customerId: customer.id }, { members: { some: { customerId: customer.id } } }] } });
    if (other) throw conflict('هذا الحساب مرتبط بمورد آخر');
    if (await prisma.vendorMember.findUnique({ where: { vendorId_customerId: { vendorId: vid(req), customerId: customer.id } } })) throw conflict('الموظف مضاف مسبقًا');
    await assertMemberQuota(vid(req));
    const m = await prisma.vendorMember.create({ data: { vendorId: vid(req), customerId: customer.id, role: 'STAFF' } });
    await audit({ actorType: 'vendor', action: 'member_add', entity: 'vendor', entityId: vid(req), meta: { customerId: customer.id } });
    ok(res, m, 201);
  }),
);

vendorMarketRouter.delete(
  '/team/:memberId',
  requireVendorOwner,
  asyncHandler(async (req, res) => {
    const m = await prisma.vendorMember.findFirst({ where: { id: req.params.memberId, vendorId: vid(req) } });
    if (!m) throw notFound('الموظف غير موجود');
    if (m.role === 'OWNER') throw badRequest('لا يمكن حذف مالك الحساب');
    await prisma.vendorMember.delete({ where: { id: m.id } });
    await audit({ actorType: 'vendor', action: 'member_remove', entity: 'vendor', entityId: vid(req), meta: { customerId: m.customerId } });
    ok(res, { deleted: true });
  }),
);

// ───────────── ملفات الشركة (كتالوج وشهادات) ─────────────

const filesUpload = memoryUpload(20, 5).array('files', 5);

vendorMarketRouter.post(
  '/files/:kind',
  requireVendorOwner,
  formLimiter,
  uploadGuard(60),
  filesUpload,
  asyncHandler(async (req, res) => {
    const kind = z.enum(['catalog', 'certificates']).parse(req.params.kind);
    const field = kind === 'catalog' ? 'catalogFiles' : 'certificates';
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: vid(req) } });
    const current = (Array.isArray(v[field]) ? v[field] : []) as unknown[];
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('اختر ملفًا');
    if (current.length + files.length > 10) throw badRequest('الحد الأقصى 10 ملفات');
    const stored = await validateAndStore(files, POLICIES.technical, `vendors/${kind}`);
    const next = [...current, ...stored.map((f) => ({ url: f.url, name: f.originalName.slice(0, 120), kind: f.kind }))];
    await prisma.vendor.update({ where: { id: v.id }, data: { [field]: next } });
    ok(res, next, 201);
  }),
);

vendorMarketRouter.delete(
  '/files/:kind/:index',
  requireVendorOwner,
  asyncHandler(async (req, res) => {
    const kind = z.enum(['catalog', 'certificates']).parse(req.params.kind);
    const field = kind === 'catalog' ? 'catalogFiles' : 'certificates';
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: vid(req) } });
    const current = (Array.isArray(v[field]) ? v[field] : []) as unknown[];
    const i = Number(req.params.index);
    if (!current[i]) throw notFound('الملف غير موجود');
    const next = current.filter((_, j) => j !== i);
    await prisma.vendor.update({ where: { id: v.id }, data: { [field]: next as Prisma.InputJsonValue } });
    ok(res, next);
  }),
);
