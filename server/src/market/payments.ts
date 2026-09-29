import type { InvoicePurpose, MarketInvoice, Prisma } from '@prisma/client';
import { Prisma as P } from '@prisma/client';
import { badRequest, notFound } from '../lib/http';

type Db = Prisma.TransactionClient;

/**
 * طبقة الدفع — مفصولة عن باقي النظام:
 * كل ما يُدفع (اشتراك، إعلان، رسوم Lead، عمولة، طلب) يمر بفاتورة MarketInvoice،
 * ومزود الدفع (provider) يتعامل مع الفاتورة فقط. تغيير المزود = إضافة كلاس جديد هنا وتفعيله بـ PAYMENT_PROVIDER.
 * عند تأكيد الدفع تُنفَّذ "آثار الدفع" حسب الغرض (تفعيل الاشتراك أو الإعلان…) بنفس الطريقة أيًا كان المزود.
 */
export interface PaymentProvider {
  readonly name: string;
  /** يبدأ الدفع: رابط بوابة أو تعليمات دفع يدوي */
  startPayment(invoice: MarketInvoice): Promise<{ redirectUrl?: string; instructions?: string }>;
}

/** الدفع اليدوي (CliQ / تحويل / نقدًا) — الإدارة تؤكد الاستلام */
class ManualProvider implements PaymentProvider {
  readonly name = 'manual';
  async startPayment(invoice: MarketInvoice) {
    return {
      instructions: `ادفع ${invoice.amount} ${invoice.currency} عبر CliQ أو تحويل بنكي واذكر رقم الفاتورة ${invoice.number}، وتؤكد الإدارة الاستلام فتُفعَّل الخدمة تلقائيًا.`,
    };
  }
}

const providers: Record<string, PaymentProvider> = { manual: new ManualProvider() };

export function paymentProvider(): PaymentProvider {
  return providers[process.env.PAYMENT_PROVIDER ?? 'manual'] ?? providers.manual;
}

export async function nextRef(db: Db, key: string, prefix: string) {
  const row = await db.refCounter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}-${String(row.value).padStart(6, '0')}`;
}

export async function createInvoice(
  db: Db,
  input: { purpose: InvoicePurpose; description: string; amount: number; vendorId?: string | null; customerId?: string | null; refType?: string; refId?: string; dueDays?: number },
) {
  return db.marketInvoice.create({
    data: {
      number: await nextRef(db, 'INV', 'INV'),
      purpose: input.purpose,
      description: input.description,
      amount: new P.Decimal(input.amount),
      vendorId: input.vendorId ?? null,
      customerId: input.customerId ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      provider: paymentProvider().name,
      dueAt: input.dueDays ? new Date(Date.now() + input.dueDays * 86400_000) : null,
    },
  });
}

/** آثار الدفع حسب الغرض — تُستدعى مرة واحدة عند تحوّل الفاتورة إلى مدفوعة */
async function onPaid(db: Db, inv: MarketInvoice) {
  if (inv.purpose === 'SUBSCRIPTION') {
    const sub = await db.vendorSubscription.findUnique({ where: { invoiceId: inv.id } });
    if (sub) await activateSubscription(db, sub.id);
  }
  if (inv.purpose === 'AD') {
    const ad = await db.marketAd.findUnique({ where: { invoiceId: inv.id } });
    if (ad && (ad.status === 'PENDING_PAYMENT' || ad.status === 'REQUESTED')) {
      const now = new Date();
      const len = ad.endsAt.getTime() - ad.startsAt.getTime();
      const startsAt = ad.startsAt > now ? ad.startsAt : now;
      await db.marketAd.update({ where: { id: ad.id }, data: { status: 'ACTIVE', startsAt, endsAt: new Date(startsAt.getTime() + len) } });
    }
  }
}

/** تفعيل اشتراك: التجديد على نفس الباقة يمدد من تاريخ الانتهاء الحالي، والترقية تبدأ الآن */
export async function activateSubscription(db: Db, subscriptionId: string) {
  const sub = await db.vendorSubscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { plan: true, vendor: true } });
  if (sub.status === 'ACTIVE') return sub;
  const now = new Date();
  const renewing = sub.vendor.planId === sub.planId && sub.vendor.planExpiresAt && sub.vendor.planExpiresAt > now;
  const startsAt = renewing ? sub.vendor.planExpiresAt! : now;
  const endsAt = new Date(startsAt.getTime() + sub.plan.durationDays * 86400_000);
  await db.vendorSubscription.updateMany({ where: { vendorId: sub.vendorId, status: 'ACTIVE', id: { not: sub.id }, planId: { not: sub.planId } }, data: { status: 'CANCELLED' } });
  const updated = await db.vendorSubscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', startsAt, endsAt } });
  await db.vendor.update({
    where: { id: sub.vendorId },
    data: { planId: sub.planId, planStartedAt: renewing ? sub.vendor.planStartedAt : now, planExpiresAt: endsAt },
  });
  return updated;
}

export async function markInvoicePaid(db: Db, invoiceId: string, opts: { providerRef?: string | null; note?: string | null } = {}) {
  const inv = await db.marketInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound('الفاتورة غير موجودة');
  if (inv.status === 'PAID') return inv;
  if (inv.status !== 'PENDING' && inv.status !== 'FAILED') throw badRequest('لا يمكن تأكيد دفع فاتورة ملغاة');
  const paid = await db.marketInvoice.update({
    where: { id: inv.id },
    data: { status: 'PAID', paidAt: new Date(), providerRef: opts.providerRef ?? inv.providerRef, note: opts.note ?? inv.note },
  });
  await onPaid(db, paid);
  return paid;
}

export async function cancelInvoice(db: Db, invoiceId: string) {
  const inv = await db.marketInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound('الفاتورة غير موجودة');
  if (inv.status === 'PAID') throw badRequest('الفاتورة مدفوعة. استخدم الاسترجاع بدل الإلغاء');
  const c = await db.marketInvoice.update({ where: { id: inv.id }, data: { status: 'CANCELLED' } });
  await db.vendorSubscription.updateMany({ where: { invoiceId: inv.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
  await db.marketAd.updateMany({ where: { invoiceId: inv.id, status: { in: ['PENDING_PAYMENT', 'REQUESTED'] } }, data: { status: 'REJECTED' } });
  return c;
}
