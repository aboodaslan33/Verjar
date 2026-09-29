import { Prisma, type RfqStatus } from '@prisma/client';
import { emitAdmin } from '../lib/events';
import { badRequest, conflict, forbidden, notFound } from '../lib/http';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/settings.service';
import { calcCommission } from './commission';
import { marketNotify } from './notify';
import { createInvoice, nextRef } from './payments';
import { effectivePlan, rfqQuotaLeft } from './plans';
import { bumpStat } from './stats';

type Db = Prisma.TransactionClient;

export const OPEN_STATUSES: RfqStatus[] = ['NEW', 'DISTRIBUTED', 'QUOTED', 'NEGOTIATING'];

export type RfqActor =
  | { kind: 'customer'; id: string; name: string }
  | { kind: 'vendor'; id: string; name: string }
  | { kind: 'admin'; id: string; name: string }
  | { kind: 'system' };

export async function rfqEvent(db: Db, rfqId: string, actor: RfqActor, action: string, note?: string | null, meta?: Prisma.InputJsonValue) {
  await db.rfqEvent.create({
    data: {
      rfqId,
      actorType: actor.kind,
      actorId: actor.kind === 'system' ? null : actor.id,
      actorName: actor.kind === 'system' ? null : actor.name,
      action,
      note: note ?? null,
      meta: meta ?? undefined,
    },
  });
}

export type RfqInput = {
  companyName: string;
  contactName: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  location?: string | null;
  categoryId?: string | null;
  productId?: string | null;
  vendorSlug?: string | null;
  items: { name: string; quantity: number; unit?: string; specs?: string | null; brand?: string | null }[];
  budget?: number | null;
  neededBy?: Date | null;
  notes?: string | null;
  attachments?: { url: string; name: string; kind: string; publicId?: string | null }[];
};

/** إنشاء طلب عرض سعر (RFQ-000001) + توزيعه تلقائيًا حسب الإعدادات */
export async function createRfq(customerId: string, input: RfqInput) {
  const settings = await getSettings();
  const rfq = await prisma.$transaction(async (tx) => {
    const product = input.productId
      ? await tx.product.findFirst({ where: { id: input.productId, deletedAt: null }, select: { id: true, categoryId: true, vendorId: true, name: true } })
      : null;
    const directVendor = input.vendorSlug
      ? await tx.vendor.findFirst({ where: { slug: input.vendorSlug, active: true, status: 'APPROVED' }, select: { id: true } })
      : null;
    const categoryId = input.categoryId ?? product?.categoryId ?? null;
    if (categoryId && !(await tx.category.findFirst({ where: { id: categoryId, deletedAt: null } }))) throw badRequest('التصنيف غير موجود', { fields: { categoryId: 'اختر التصنيف' } });
    const created = await tx.rfq.create({
      data: {
        code: await nextRef(tx, 'RFQ', 'RFQ'),
        customerId,
        companyName: input.companyName,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email ?? null,
        city: input.city ?? null,
        location: input.location ?? null,
        categoryId,
        productId: product?.id ?? null,
        directVendorId: directVendor?.id ?? product?.vendorId ?? null,
        title: input.items[0].name,
        budget: input.budget != null ? new Prisma.Decimal(input.budget) : null,
        expectedValue: input.budget != null ? new Prisma.Decimal(input.budget) : null,
        neededBy: input.neededBy ?? null,
        notes: input.notes ?? null,
        attachments: (input.attachments ?? []) as Prisma.InputJsonValue,
        items: {
          create: input.items.map((it, i) => ({
            name: it.name,
            quantity: new Prisma.Decimal(it.quantity),
            unit: it.unit || 'قطعة',
            specs: it.specs ?? null,
            brand: it.brand ?? null,
            sortOrder: i,
          })),
        },
      },
    });
    await rfqEvent(tx, created.id, { kind: 'customer', id: customerId, name: input.contactName }, 'created');
    // طلب من صفحة منتج/مورد: يصل لهذا المورد مباشرة
    if (created.directVendorId) await distribute(tx, created.id, [created.directVendorId], 'DIRECT', { kind: 'system' });
    if (settings.rfqAutoDistribute) {
      // لا يُرسل طلب العميل لمتجره هو (إن كان موردًا أيضًا)
      const own = new Set((await tx.vendor.findMany({ where: { OR: [{ customerId }, { members: { some: { customerId } } }] }, select: { id: true } })).map((v) => v.id));
      const suggested = await suggestSuppliers(tx, created.id, settings.rfqSuppliersPerRequest + own.size);
      const ids = suggested.map((s) => s.id).filter((id) => id !== created.directVendorId && !own.has(id));
      const room = Math.max(0, settings.rfqSuppliersPerRequest - (created.directVendorId ? 1 : 0));
      if (ids.length && room) await distribute(tx, created.id, ids.slice(0, room), 'AUTO', { kind: 'system' });
    }
    return created;
  });
  emitAdmin({ type: 'rfq.new', id: rfq.id, title: `طلب عرض سعر جديد ${rfq.code}: ${rfq.title}` });
  return rfq;
}

/**
 * اقتراح الموردين المناسبين: معتمد وفعّال، يخدم التصنيف أو لديه منتجات فيه،
 * مع أولوية الباقة والتوثيق والتقييم، ولديه رصيد طلبات في باقته.
 */
export async function suggestSuppliers(db: Db, rfqId: string, limit = 10) {
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { category: true, recipients: { select: { vendorId: true } } } });
  const exclude = new Set(rfq.recipients.map((r) => r.vendorId));
  const catIds = rfq.category ? [rfq.category.id, ...(rfq.category.parentId ? [rfq.category.parentId] : [])] : [];
  const children = rfq.category ? await db.category.findMany({ where: { parentId: rfq.category.id }, select: { id: true } }) : [];
  const allCats = [...catIds, ...children.map((c) => c.id)];
  const vendors = await db.vendor.findMany({
    where: { active: true, status: 'APPROVED', id: { notIn: [...exclude] } },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      verified: true,
      isHouse: true,
      categoryIds: true,
      planId: true,
      planExpiresAt: true,
      plan: { select: { code: true, name: true, rfqPriority: true } },
      _count: { select: { products: allCats.length ? { where: { deletedAt: null, approvalStatus: 'APPROVED', categoryId: { in: allCats } } } : { where: { deletedAt: null, approvalStatus: 'APPROVED' } } } },
    },
  });
  const ratings = await db.supplierReview.groupBy({ by: ['vendorId'], where: { visible: true }, _avg: { overall: true } });
  const rating = new Map(ratings.map((r) => [r.vendorId, r._avg.overall ?? 0]));
  const scored = [];
  for (const v of vendors) {
    const servesCategory = allCats.some((c) => v.categoryIds.includes(c));
    const products = v._count.products;
    if (allCats.length && !servesCategory && products === 0) continue;
    if ((await rfqQuotaLeft(v, db)) <= 0) continue;
    const plan = await effectivePlan(v, db);
    const score = (servesCategory ? 50 : 0) + Math.min(products, 20) * 2 + (plan?.rfqPriority ?? 0) + (v.verified ? 10 : 0) + (rating.get(v.id) ?? 0) * 3 + (sameCity(v.city, rfq.city) ? 8 : 0);
    scored.push({ id: v.id, name: v.name, slug: v.slug, city: v.city, verified: v.verified, isHouse: v.isHouse, plan: plan ? { code: plan.code, name: plan.name } : null, products, servesCategory, rating: rating.get(v.id) ?? null, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const sameCity = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim() === b.trim());

/** رسوم الـ Lead لمورد على طلب (0 إن كانت مشمولة بباقته أو الرسوم غير مفعّلة) */
async function leadFeeFor(db: Db, vendor: { planId: string | null; planExpiresAt: Date | null; isHouse: boolean }, expectedValue: number | null) {
  const s = await getSettings();
  if (vendor.isHouse) return { fee: 0, charge: false };
  const plan = await effectivePlan(vendor, db);
  const fee = expectedValue != null && expectedValue >= s.leadLargeThreshold ? s.leadFeeLarge : s.leadFeeStandard;
  if (plan?.leadsIncluded) return { fee: 0, charge: false };
  return { fee, charge: s.leadFeesEnabled && fee > 0 };
}

/** إرسال الطلب لمجموعة موردين (يتجاهل من أُرسل لهم سابقًا) */
export async function distribute(db: Db, rfqId: string, vendorIds: string[], source: 'AUTO' | 'MANUAL' | 'DIRECT', actor: RfqActor) {
  const rfq = await db.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  if (!OPEN_STATUSES.includes(rfq.status)) throw conflict('الطلب مغلق ولا يمكن إرساله لموردين');
  const existing = new Set((await db.rfqRecipient.findMany({ where: { rfqId }, select: { vendorId: true } })).map((r) => r.vendorId));
  const vendors = await db.vendor.findMany({
    where: { id: { in: [...new Set(vendorIds)].filter((id) => !existing.has(id)) }, active: true, status: 'APPROVED' },
    select: { id: true, name: true, planId: true, planExpiresAt: true, isHouse: true },
  });
  const added: string[] = [];
  for (const v of vendors) {
    const { fee, charge } = await leadFeeFor(db, v, rfq.expectedValue ? toNum(rfq.expectedValue) : null);
    const invoice = charge
      ? await createInvoice(db, { purpose: 'LEAD_FEE', description: `رسوم طلب عرض سعر ${rfq.code}`, amount: fee, vendorId: v.id, refType: 'rfq', refId: rfq.id, dueDays: 7 })
      : null;
    await db.rfqRecipient.create({ data: { rfqId, vendorId: v.id, source, leadFee: new Prisma.Decimal(fee), leadInvoiceId: invoice?.id ?? null } });
    added.push(v.id);
    void bumpStat(v.id, 'rfqs');
  }
  if (!added.length) return [];
  if (rfq.status === 'NEW') await db.rfq.update({ where: { id: rfqId }, data: { status: 'DISTRIBUTED' } });
  await rfqEvent(db, rfqId, actor, 'distributed', null, { vendorIds: added, source });
  await marketNotify(db, { vendorIds: added }, {
    title: `طلب عرض سعر جديد ${rfq.code}`,
    body: `لديك طلب عرض سعر جديد: ${rfq.title}${rfq.city ? ` — ${rfq.city}` : ''}. قدّم عرضك من لوحة المورد.`,
    link: `/vendor/rfqs/${rfq.id}`,
    cta: 'تقديم عرض سعر',
  });
  return added;
}

export type QuoteInput = {
  unitPrice: number;
  quantity: number;
  total?: number | null;
  leadTimeDays?: number | null;
  warranty?: string | null;
  originCountry?: string | null;
  brand?: string | null;
  specs?: string | null;
  paymentTerms?: string | null;
  validUntil?: Date | null;
  notes?: string | null;
  fileUrl?: string | null;
  filePublicId?: string | null;
};

/** تقديم/تعديل عرض المورد (قبل قبول أي عرض) */
export async function submitQuote(vendor: { id: string; name: string }, rfqId: string, input: QuoteInput) {
  return prisma.$transaction(async (tx) => {
    const rec = await tx.rfqRecipient.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId: vendor.id } }, include: { rfq: true } });
    if (!rec) throw notFound('الطلب غير موجود');
    if (!OPEN_STATUSES.includes(rec.rfq.status)) throw conflict('الطلب لم يعد يستقبل عروضًا');
    const total = input.total != null ? input.total : round3(input.unitPrice * input.quantity);
    const data = {
      unitPrice: new Prisma.Decimal(input.unitPrice),
      quantity: new Prisma.Decimal(input.quantity),
      total: new Prisma.Decimal(total),
      leadTimeDays: input.leadTimeDays ?? null,
      warranty: input.warranty ?? null,
      originCountry: input.originCountry ?? null,
      brand: input.brand ?? null,
      specs: input.specs ?? null,
      paymentTerms: input.paymentTerms ?? null,
      validUntil: input.validUntil ?? null,
      notes: input.notes ?? null,
      ...(input.fileUrl ? { fileUrl: input.fileUrl, filePublicId: input.filePublicId ?? null } : {}),
      status: 'SUBMITTED' as const,
    };
    const prev = await tx.quote.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId: vendor.id } } });
    const quote = prev ? await tx.quote.update({ where: { id: prev.id }, data }) : await tx.quote.create({ data: { ...data, rfqId, vendorId: vendor.id } });
    await tx.rfqRecipient.update({ where: { id: rec.id }, data: { status: 'QUOTED', respondedAt: new Date() } });
    if (rec.rfq.status === 'NEW' || rec.rfq.status === 'DISTRIBUTED') await tx.rfq.update({ where: { id: rfqId }, data: { status: 'QUOTED' } });
    await rfqEvent(tx, rfqId, { kind: 'vendor', id: vendor.id, name: vendor.name }, prev ? 'quote_updated' : 'quoted', null, { total });
    await marketNotify(tx, { customerIds: [rec.rfq.customerId] }, {
      title: prev ? `تحديث عرض على طلبك ${rec.rfq.code}` : `عرض سعر جديد على طلبك ${rec.rfq.code}`,
      body: `وصلك عرض بقيمة ${total} د.أ على "${rec.rfq.title}". قارن العروض واختر الأنسب.`,
      link: `/account/rfq/${rfqId}`,
      cta: 'مقارنة العروض',
    });
    if (!prev) void bumpStat(vendor.id, 'quotes');
    return quote;
  });
}

/** قبول عرض: يُرفض الباقي، تُسجَّل قيمة الصفقة والعمولة حسب نموذج الإيراد الحالي */
export async function acceptQuote(customerId: string, rfqId: string, quoteId: string) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findFirst({ where: { id: rfqId, customerId, deletedAt: null } });
    if (!rfq) throw notFound('الطلب غير موجود');
    if (!OPEN_STATUSES.includes(rfq.status)) throw conflict('تم اختيار عرض لهذا الطلب أو أُغلق');
    const quote = await tx.quote.findFirst({ where: { id: quoteId, rfqId, status: 'SUBMITTED' }, include: { vendor: { select: { id: true, name: true, planId: true, planExpiresAt: true, isHouse: true } } } });
    if (!quote) throw notFound('العرض غير موجود');
    if (quote.validUntil && quote.validUntil < new Date()) throw conflict('انتهت صلاحية هذا العرض. اطلب من المورد تحديثه.');
    const plan = await effectivePlan(quote.vendor, tx);
    const value = toNum(quote.total);
    const c = await calcCommission({ amount: value, categoryId: rfq.categoryId, planCode: plan?.code, dealType: 'RFQ_DEAL' }, tx);
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
    await tx.quote.updateMany({ where: { rfqId, id: { not: quote.id }, status: 'SUBMITTED' }, data: { status: 'REJECTED' } });
    const updated = await tx.rfq.update({
      where: { id: rfqId },
      data: {
        status: 'AWARDED',
        acceptedQuoteId: quote.id,
        finalValue: quote.total,
        revenueModel: settings.marketRevenueMode,
        commissionRate: new Prisma.Decimal(c.percent),
        commissionAmount: new Prisma.Decimal(c.amount),
        commissionRuleId: c.rule?.id ?? null,
      },
    });
    // عمولة الصفقة: فاتورة على المورد عند تفعيل نموذج العمولة (ومنتجات FARJAR نفسها لا عمولة عليها)
    if (settings.marketRevenueMode !== 'LEAD' && c.amount > 0 && !quote.vendor.isHouse) {
      await createInvoice(tx, { purpose: 'COMMISSION', description: `عمولة صفقة ${rfq.code} (${c.percent}%)`, amount: c.amount, vendorId: quote.vendorId, refType: 'rfq', refId: rfq.id, dueDays: 14 });
    }
    await rfqEvent(tx, rfqId, { kind: 'customer', id: customerId, name: rfq.contactName }, 'accepted', null, { quoteId: quote.id, vendorId: quote.vendorId, value, commission: c.amount });
    const others = (await tx.quote.findMany({ where: { rfqId, status: 'REJECTED' }, select: { vendorId: true } })).map((q) => q.vendorId);
    await marketNotify(tx, { vendorIds: [quote.vendorId] }, { title: `تم قبول عرضك على ${rfq.code}`, body: `اختار العميل عرضك بقيمة ${value} د.أ. تواصل معه من صفحة الطلب لإتمام التوريد.`, link: `/vendor/rfqs/${rfqId}`, cta: 'فتح الطلب' });
    if (others.length) await marketNotify(tx, { vendorIds: others }, { title: `أُغلق الطلب ${rfq.code}`, body: 'اختار العميل عرضًا آخر لهذا الطلب. شكرًا لمشاركتك.', link: `/vendor/rfqs/${rfqId}` });
    emitAdmin({ type: 'rfq.awarded', id: rfqId, title: `تمت ترسية ${rfq.code} بقيمة ${value} د.أ` });
    return updated;
  });
}

/** إغلاق الطلب (تمّ التوريد) أو إلغاؤه */
export async function closeRfq(rfqId: string, actor: RfqActor, opts: { cancel?: boolean; finalValue?: number | null; note?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUniqueOrThrow({ where: { id: rfqId } });
    if (rfq.status === 'CLOSED' || rfq.status === 'CANCELLED') throw conflict('الطلب مغلق مسبقًا');
    if (opts.cancel && rfq.status === 'AWARDED' && actor.kind === 'customer') throw forbidden('تمت الترسية على مورد. تواصل مع الإدارة للإلغاء.');
    const data: Prisma.RfqUpdateInput = { status: opts.cancel ? 'CANCELLED' : 'CLOSED', closedAt: new Date() };
    if (!opts.cancel && opts.finalValue != null) {
      const c = await calcCommission({ amount: opts.finalValue, categoryId: rfq.categoryId, dealType: 'RFQ_DEAL' }, tx);
      Object.assign(data, { finalValue: new Prisma.Decimal(opts.finalValue), commissionRate: new Prisma.Decimal(c.percent), commissionAmount: new Prisma.Decimal(c.amount), commissionRuleId: c.rule?.id ?? null });
    }
    if (opts.cancel) await tx.quote.updateMany({ where: { rfqId, status: 'SUBMITTED' }, data: { status: 'REJECTED' } });
    const updated = await tx.rfq.update({ where: { id: rfqId }, data });
    await rfqEvent(tx, rfqId, actor, opts.cancel ? 'cancelled' : 'closed', opts.note ?? null);
    const vendorIds = (await tx.rfqRecipient.findMany({ where: { rfqId }, select: { vendorId: true } })).map((r) => r.vendorId);
    if (opts.cancel && vendorIds.length) await marketNotify(tx, { vendorIds }, { title: `أُلغي الطلب ${rfq.code}`, body: `ألغى العميل طلب "${rfq.title}".`, link: `/vendor/rfqs/${rfqId}` });
    return updated;
  });
}
