import { Prisma, type DeliveryStatus, type FinancialStatus, type PaymentMethod, type RequestStatus } from '@prisma/client';
import { badRequest, notFound } from '../lib/http';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/settings.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * مالية المورد مع فرجار: كل طلب فرعي غير ملغي يحمل نسبة فرجار المثبتة وقت البيع (commissionTotal).
 * حالة المبلغ تُشتق من الطلب والدفعات — لا تُحفظ يدويًا:
 *  - DISPUTED: عليه اعتراض
 *  - PAID: سُدّد كاملًا (دفعات المورد، أو فرجار حصّلت المبلغ واحتفظت بنسبتها في تسوية)
 *  - PARTIALLY_PAID: سُدّد جزء منه
 *  - DUE: الطلب اكتمل أو سُلّم — أصبح قابلًا للتحصيل
 *  - PENDING: الطلب قيد التنفيذ
 */
export const FEE_STATUSES = ['PENDING', 'DUE', 'PAID', 'PARTIALLY_PAID', 'DISPUTED'] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

const DELIVERED: DeliveryStatus[] = ['DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'];

type VoFee = {
  status: RequestStatus;
  commissionTotal: Prisma.Decimal;
  feePaid: Prisma.Decimal;
  feeDisputed: boolean;
  payoutId: string | null;
  order: { deliveryStatus: DeliveryStatus };
};

/** المبالغ والحالة لطلب فرعي واحد */
export function feeOf(vo: VoFee) {
  const amount = round3(toNum(vo.commissionTotal));
  // التسوية تعني أن فرجار حصّلت المبلغ من العميل واحتفظت بنسبتها
  const paid = vo.payoutId ? amount : Math.min(round3(toNum(vo.feePaid)), amount);
  const remaining = round3(amount - paid);
  const collectible = vo.status === 'COMPLETED' || DELIVERED.includes(vo.order.deliveryStatus);
  const status: FeeStatus = vo.feeDisputed && remaining > 0
    ? 'DISPUTED'
    : remaining <= 0
      ? 'PAID'
      : paid > 0
        ? 'PARTIALLY_PAID'
        : collectible
          ? 'DUE'
          : 'PENDING';
  return { amount, paid, remaining, status, collectible };
}

const voWhere = (vendorId?: string): Prisma.VendorOrderWhereInput => ({
  ...(vendorId ? { vendorId } : {}),
  status: { not: 'CANCELLED' },
  vendor: { isHouse: false },
  order: { deletedAt: null },
});

const summarySelect = {
  id: true,
  vendorId: true,
  status: true,
  total: true,
  vendorNet: true,
  commissionTotal: true,
  feePaid: true,
  feeDisputed: true,
  payoutId: true,
  createdAt: true,
  order: { select: { deliveryStatus: true } },
} satisfies Prisma.VendorOrderSelect;

type SummaryRow = Prisma.VendorOrderGetPayload<{ select: typeof summarySelect }>;

export type FeeSummary = {
  orders: number;
  /** قيمة المبيعات للعملاء (شاملة نسبة فرجار) */
  customerSales: number;
  /** قيمة المنتجات قبل نسبة فرجار = مستحق المورد */
  supplierBase: number;
  fees: number;
  paid: number;
  outstanding: number;
  pending: number;
  due: number;
  disputed: number;
};

function summarize(rows: SummaryRow[]): FeeSummary {
  const s: FeeSummary = { orders: 0, customerSales: 0, supplierBase: 0, fees: 0, paid: 0, outstanding: 0, pending: 0, due: 0, disputed: 0 };
  for (const vo of rows) {
    const f = feeOf(vo);
    s.orders++;
    s.customerSales += toNum(vo.total);
    s.supplierBase += toNum(vo.vendorNet);
    s.fees += f.amount;
    s.paid += f.paid;
    s.outstanding += f.remaining;
    // المتبقي يُصنَّف حسب مرحلة الطلب: نزاع، مستحق الآن، أو بانتظار اكتمال الطلب
    if (f.remaining > 0) {
      if (vo.feeDisputed) s.disputed += f.remaining;
      else if (f.collectible) s.due += f.remaining;
      else s.pending += f.remaining;
    }
  }
  for (const k of Object.keys(s) as (keyof FeeSummary)[]) if (k !== 'orders') s[k] = round3(s[k]);
  return s;
}

/** نسبة فرجار الحالية للمورد: نسبته الخاصة أو الافتراضي، ونطاق النسب الفعلية على منتجاته */
export async function currentRate(vendorId: string) {
  const [vendor, settings, rates] = await Promise.all([
    prisma.vendor.findUnique({ where: { id: vendorId }, select: { platformFeePercent: true } }),
    getSettings(),
    prisma.product.groupBy({ by: ['platformFeePercent'], where: { vendorId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const values = rates.map((r) => toNum(r.platformFeePercent)).sort((a, b) => a - b);
  const def = vendor?.platformFeePercent != null ? toNum(vendor.platformFeePercent) : settings.platformFeeDefault;
  return { percent: def, min: values[0] ?? def, max: values[values.length - 1] ?? def, perProduct: values.length > 1 };
}

export async function supplierSummary(vendorId: string) {
  const [rows, rate] = await Promise.all([
    prisma.vendorOrder.findMany({ where: voWhere(vendorId), select: summarySelect }),
    currentRate(vendorId),
  ]);
  return { summary: summarize(rows), rate };
}

/** ملخص كل الموردين (لوحة الأدمن) */
export async function allSuppliers() {
  const [vendors, rows, lastPayments, settings] = await Promise.all([
    prisma.vendor.findMany({
      where: { isHouse: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, active: true, status: true, platformFeePercent: true },
    }),
    prisma.vendorOrder.findMany({ where: voWhere(), select: summarySelect }),
    prisma.farjarFeePayment.groupBy({ by: ['vendorId'], _max: { paidAt: true } }),
    getSettings(),
  ]);
  const byVendor = new Map<string, SummaryRow[]>();
  for (const r of rows) byVendor.set(r.vendorId, [...(byVendor.get(r.vendorId) ?? []), r]);
  const last = new Map(lastPayments.map((p) => [p.vendorId, p._max.paidAt]));
  const list = vendors.map((v) => ({
    vendor: { id: v.id, name: v.name, slug: v.slug, active: v.active, status: v.status },
    feePercent: v.platformFeePercent != null ? toNum(v.platformFeePercent) : settings.platformFeeDefault,
    lastPayment: last.get(v.id) ?? null,
    ...summarize(byVendor.get(v.id) ?? []),
  }));
  return { suppliers: list, totals: summarize(rows) };
}

export type StatementFilters = { status?: FeeStatus; from?: Date; to?: Date };

/** كشف حساب فرجار: كل طلب ترتّب عليه مبلغ لفرجار مع منتجاته ومبالغه وحالاته */
export async function statement(vendorId: string, f: StatementFilters = {}, limit = 300) {
  const vos = await prisma.vendorOrder.findMany({
    where: { ...voWhere(vendorId), ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      ...summarySelect,
      number: true,
      feeDisputeNote: true,
      feeDisputedBy: true,
      order: { select: { id: true, number: true, code: true, deliveryStatus: true, financialStatus: true } },
      items: {
        select: { id: true, name: true, variant: true, quantity: true, supplierUnitPrice: true, unitFinalPrice: true, platformFeePercent: true, platformFeeAmount: true, lineTotal: true, vendorNet: true },
      },
    },
  });
  const rows = vos
    .map((vo) => {
      const fee = feeOf(vo);
      return {
        id: vo.id,
        number: vo.number,
        orderId: vo.order.id,
        orderNumber: vo.order.number,
        orderCode: vo.order.code,
        date: vo.createdAt,
        orderStatus: vo.status,
        paymentStatus: vo.order.financialStatus as FinancialStatus | null,
        deliveryStatus: vo.order.deliveryStatus,
        customerTotal: round3(toNum(vo.total)),
        supplierBase: round3(toNum(vo.vendorNet)),
        feeAmount: fee.amount,
        feePaid: fee.paid,
        remaining: fee.remaining,
        feeStatus: fee.status,
        settledByPayout: !!vo.payoutId,
        dispute: vo.feeDisputed ? { note: vo.feeDisputeNote, by: vo.feeDisputedBy } : null,
        items: vo.items.map((i) => ({
          id: i.id,
          product: i.variant ? `${i.name} (${i.variant})` : i.name,
          quantity: i.quantity,
          supplierPrice: round3(toNum(i.supplierUnitPrice)),
          customerPrice: round3(toNum(i.unitFinalPrice)),
          feePercent: round3(toNum(i.platformFeePercent)),
          feeAmount: round3(toNum(i.platformFeeAmount)),
        })),
      };
    })
    .filter((r) => !f.status || r.feeStatus === f.status);
  return { rows: rows.slice(0, limit), total: rows.length };
}

/** آخر العمليات المالية: المبيعات (نسبة مستحقة)، دفعات المورد لفرجار، والتسويات */
export async function recentActivity(vendorId: string, take = 15) {
  const [sales, payments, payouts] = await Promise.all([
    prisma.vendorOrder.findMany({
      where: voWhere(vendorId),
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, number: true, createdAt: true, total: true, commissionTotal: true },
    }),
    prisma.farjarFeePayment.findMany({ where: { vendorId }, orderBy: { paidAt: 'desc' }, take, select: { id: true, amount: true, method: true, reference: true, paidAt: true } }),
    prisma.vendorPayout.findMany({ where: { vendorId }, orderBy: { paidAt: 'desc' }, take, select: { id: true, amount: true, commissionTotal: true, paidAt: true, reference: true } }),
  ]);
  return [
    ...sales.map((s) => ({ kind: 'SALE' as const, id: s.id, date: s.createdAt, amount: round3(toNum(s.commissionTotal)), ref: `#${s.number}`, total: round3(toNum(s.total)) })),
    ...payments.map((p) => ({ kind: 'FEE_PAYMENT' as const, id: p.id, date: p.paidAt, amount: round3(toNum(p.amount)), ref: p.reference, method: p.method })),
    ...payouts.map((p) => ({ kind: 'PAYOUT' as const, id: p.id, date: p.paidAt, amount: round3(toNum(p.commissionTotal)), ref: p.reference, total: round3(toNum(p.amount)) })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, take);
}

export async function paymentsOf(vendorId: string) {
  const list = await prisma.farjarFeePayment.findMany({
    where: { vendorId },
    orderBy: { paidAt: 'desc' },
    include: { recordedBy: { select: { name: true } }, allocations: { select: { amount: true, vendorOrder: { select: { id: true, number: true } } } } },
  });
  return list.map((p) => ({
    id: p.id,
    amount: round3(toNum(p.amount)),
    method: p.method,
    reference: p.reference,
    note: p.note,
    paidAt: p.paidAt,
    recordedBy: p.recordedBy?.name ?? null,
    orders: p.allocations.map((a) => ({ id: a.vendorOrder.id, number: a.vendorOrder.number, amount: round3(toNum(a.amount)) })),
  }));
}

/**
 * تسجيل دفعة من المورد لفرجار. تُوزَّع على الطلبات: المستحقة أولًا (الأقدم فالأحدث) ثم قيد التنفيذ.
 * الطلبات المتنازع عليها لا تُسدَّد تلقائيًا، والدفعة لا تتجاوز المتبقي.
 */
export async function recordFeePayment(
  tx: Prisma.TransactionClient,
  vendorId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; note?: string | null; paidAt?: Date },
  recordedById: string | null,
) {
  const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true, isHouse: true } });
  if (!vendor || vendor.isHouse) throw notFound('المورد غير موجود');
  // قفل صفوف طلبات المورد حتى لا تتداخل دفعتان
  await tx.$queryRaw`SELECT id FROM "VendorOrder" WHERE "vendorId" = ${vendorId} FOR UPDATE`;
  const vos = await tx.vendorOrder.findMany({ where: { ...voWhere(vendorId), payoutId: null, feeDisputed: false }, select: summarySelect, orderBy: { createdAt: 'asc' } });
  const open = vos
    .map((vo) => ({ vo, fee: feeOf(vo) }))
    .filter((x) => x.fee.remaining > 0)
    .sort((a, b) => Number(b.fee.collectible) - Number(a.fee.collectible) || a.vo.createdAt.getTime() - b.vo.createdAt.getTime());
  const outstanding = round3(open.reduce((n, x) => n + x.fee.remaining, 0));
  const amount = round3(input.amount);
  if (amount <= 0) throw badRequest('المبلغ يجب أن يكون أكبر من صفر', { fields: { amount: 'اكتب المبلغ' } });
  if (amount > outstanding) {
    throw badRequest(`المبلغ أكبر من المتبقي على المورد (${outstanding} د.أ)`, { fields: { amount: `الحد الأقصى ${outstanding}` } });
  }
  const payment = await tx.farjarFeePayment.create({
    data: {
      vendorId,
      amount: new Prisma.Decimal(amount),
      method: input.method,
      reference: input.reference || null,
      note: input.note || null,
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
      recordedById,
    },
  });
  let left = amount;
  for (const { vo, fee } of open) {
    if (left <= 0) break;
    const part = round3(Math.min(left, fee.remaining));
    await tx.farjarFeeAllocation.create({ data: { paymentId: payment.id, vendorOrderId: vo.id, amount: new Prisma.Decimal(part) } });
    await tx.vendorOrder.update({ where: { id: vo.id }, data: { feePaid: { increment: new Prisma.Decimal(part) } } });
    left = round3(left - part);
  }
  return { payment, remaining: round3(outstanding - amount) };
}

/** حذف دفعة مسجّلة بالخطأ: يُرجع المبالغ للطلبات */
export async function deleteFeePayment(tx: Prisma.TransactionClient, id: string) {
  const p = await tx.farjarFeePayment.findUnique({ where: { id }, include: { allocations: true } });
  if (!p) throw notFound('الدفعة غير موجودة');
  for (const a of p.allocations) {
    await tx.vendorOrder.update({ where: { id: a.vendorOrderId }, data: { feePaid: { decrement: a.amount } } });
  }
  await tx.farjarFeePayment.delete({ where: { id } });
  return p;
}

export async function setDispute(db: Db, vendorOrderId: string, input: { disputed: boolean; note?: string | null; by: 'SUPPLIER' | 'ADMIN' }, vendorId?: string) {
  const vo = await db.vendorOrder.findFirst({ where: { id: vendorOrderId, ...voWhere(vendorId) }, select: { id: true, vendorId: true, number: true } });
  if (!vo) throw notFound('الطلب غير موجود');
  await db.vendorOrder.update({
    where: { id: vo.id },
    data: input.disputed
      ? { feeDisputed: true, feeDisputeNote: input.note || null, feeDisputedAt: new Date(), feeDisputedBy: input.by }
      : { feeDisputed: false, feeDisputeNote: input.note || null, feeDisputedAt: null, feeDisputedBy: null },
  });
  return vo;
}

/** تقرير مالي مجمّع حسب اليوم/الأسبوع/الشهر/السنة، مع فلتر المورد وحالة المبلغ */
export async function periodReport(opts: { groupBy: 'day' | 'week' | 'month' | 'year'; vendorId?: string; status?: FeeStatus; from?: Date; to?: Date }) {
  const rows = await prisma.vendorOrder.findMany({
    where: { ...voWhere(opts.vendorId), ...(opts.from || opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}) },
    select: { ...summarySelect, vendor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const keyOf = (d: Date) => {
    // توقيت عمّان (UTC+3)
    const a = new Date(d.getTime() + 3 * 3600_000);
    const y = a.getUTCFullYear();
    const m = String(a.getUTCMonth() + 1).padStart(2, '0');
    const day = String(a.getUTCDate()).padStart(2, '0');
    if (opts.groupBy === 'year') return `${y}`;
    if (opts.groupBy === 'month') return `${y}-${m}`;
    if (opts.groupBy === 'day') return `${y}-${m}-${day}`;
    // بداية الأسبوع (السبت)
    const back = (a.getUTCDay() + 1) % 7;
    const s = new Date(Date.UTC(y, a.getUTCMonth(), a.getUTCDate() - back));
    return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
  };
  const groups = new Map<string, SummaryRow[]>();
  for (const r of rows) {
    if (opts.status && feeOf(r).status !== opts.status) continue;
    const k = keyOf(r.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const periods = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([period, list]) => ({ period, ...summarize(list) }));
  return { periods, totals: summarize([...groups.values()].flat()) };
}
