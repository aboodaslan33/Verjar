import { Prisma, type RequestStatus } from '@prisma/client';
import { badRequest, conflict } from '../lib/http';
import { randomSuffix, slugify } from '../lib/ids';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/** المورد الافتراضي (الشركة): منتجات المتجر القديمة ومنتجات الأدمن */
export const HOUSE_VENDOR_ID = 'house_vendor';
export const DEFAULT_COMMISSION = 10;

export async function ensureHouseVendor(db: Db = prisma) {
  return db.vendor.upsert({
    where: { id: HOUSE_VENDOR_ID },
    create: {
      id: HOUSE_VENDOR_ID,
      name: 'مجموعة فرجا',
      slug: 'farja-group',
      description: 'منتجات من ورشة مجموعة فرجا.',
      commissionPercent: new Prisma.Decimal(100),
      isHouse: true,
      status: 'APPROVED',
      verified: true,
      verifiedAt: new Date(),
      city: 'عمّان',
      // متجر FARJAR على أعلى باقة (إن وُجدت)
      planId: (await db.supplierPlan.findUnique({ where: { code: 'BUSINESS' }, select: { id: true } }))?.id ?? null,
    },
    update: {},
  });
}

export async function uniqueVendorSlug(db: Db, name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  while (await db.vendor.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

/** عمولة بند واحد — تُحسب مرة واحدة وقت البيع وتُحفظ مع البند */
export function splitLine(lineTotal: number, commissionPercent: number) {
  const pct = Math.min(Math.max(commissionPercent, 0), 100);
  const commission = round3((lineTotal * pct) / 100);
  return { commissionPercent: pct, commission, vendorNet: round3(lineTotal - commission) };
}

const PROGRESS: RequestStatus[] = ['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

/** حالة الطلب الرئيسي من حالات طلباته الفرعية: الكل ملغي = ملغي، وإلا أبطأ طلب فرعي نشط */
export function deriveOrderStatus(statuses: RequestStatus[]): RequestStatus {
  const active = statuses.filter((s) => s !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  return active.reduce((min, s) => (PROGRESS.indexOf(s) < PROGRESS.indexOf(min) ? s : min), active[0]);
}

type VendorOrderWithItems = Prisma.VendorOrderGetPayload<{ include: { items: true } }>;

/**
 * تغيير حالة طلب فرعي مع المخزون: الإلغاء يُرجع الكميات، والتراجع عن الإلغاء يخصمها من جديد.
 * الطلب الفرعي الذي تمت تسويته لا تتغير حالته.
 */
export async function setVendorOrderStatus(tx: Prisma.TransactionClient, vo: VendorOrderWithItems, next: RequestStatus) {
  if (vo.status === next) return vo;
  if (vo.payoutId) throw conflict(`الطلب الفرعي #${vo.number} تمت تسويته مع المورد ولا يمكن تغيير حالته`);
  if (next === 'CANCELLED') {
    for (const it of vo.items) {
      // بنود طلبات التوصيل التي كتبها المورد ليست من مخزون المتجر
      if (!it.productId) continue;
      await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.quantity } } });
    }
  } else if (vo.status === 'CANCELLED') {
    for (const it of vo.items) {
      if (!it.productId) continue;
      const r = await tx.product.updateMany({ where: { id: it.productId, stock: { gte: it.quantity } }, data: { stock: { decrement: it.quantity } } });
      if (r.count === 0) throw badRequest(`لا يكفي المخزون لإعادة تفعيل "${it.name}"`);
    }
  }
  return tx.vendorOrder.update({ where: { id: vo.id }, data: { status: next }, include: { items: true } });
}

/** يحدّث حالة الطلب الرئيسي حسب طلباته الفرعية ويعيدها مع الحالة السابقة */
export async function syncOrderStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { vendorOrders: { select: { status: true } } } });
  const status = deriveOrderStatus(order.vendorOrders.map((v) => v.status));
  if (status === order.status) return { order, previous: order.status };
  const updated = await tx.order.update({ where: { id: orderId }, data: { status } });
  return { order: updated, previous: order.status };
}

export type VendorTotals = {
  salesTotal: number;
  commissionTotal: number;
  vendorNetTotal: number;
  ordersCount: number;
  /** صافي طلبات مكتملة لم تُسوَّ بعد */
  due: number;
  dueOrders: number;
  /** صافي طلبات قيد التنفيذ (غير مكتملة وغير ملغاة) */
  pending: number;
  paid: number;
};

/** ملخص مالي لكل مورد (أو مورد واحد) — المبالغ من القيم المحفوظة وقت البيع */
export async function vendorTotals(opts: { vendorId?: string; from?: Date; to?: Date } = {}): Promise<Map<string, VendorTotals>> {
  const base: Prisma.VendorOrderWhereInput = {
    ...(opts.vendorId ? { vendorId: opts.vendorId } : {}),
    order: { deletedAt: null },
  };
  const period: Prisma.VendorOrderWhereInput =
    opts.from || opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {};
  const sum = { total: true, commissionTotal: true, vendorNet: true } as const;
  const [sales, due, pending, paid] = await Promise.all([
    prisma.vendorOrder.groupBy({ by: ['vendorId'], where: { ...base, ...period, status: { not: 'CANCELLED' } }, _sum: sum, _count: { _all: true } }),
    prisma.vendorOrder.groupBy({ by: ['vendorId'], where: { ...base, status: 'COMPLETED', payoutId: null }, _sum: { vendorNet: true }, _count: { _all: true } }),
    prisma.vendorOrder.groupBy({ by: ['vendorId'], where: { ...base, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, _sum: { vendorNet: true } }),
    prisma.vendorPayout.groupBy({ by: ['vendorId'], where: opts.vendorId ? { vendorId: opts.vendorId } : {}, _sum: { amount: true } }),
  ]);
  const map = new Map<string, VendorTotals>();
  const get = (id: string) => {
    if (!map.has(id)) {
      map.set(id, { salesTotal: 0, commissionTotal: 0, vendorNetTotal: 0, ordersCount: 0, due: 0, dueOrders: 0, pending: 0, paid: 0 });
    }
    return map.get(id)!;
  };
  for (const r of sales) {
    const t = get(r.vendorId);
    t.salesTotal = round3(toNum(r._sum.total));
    t.commissionTotal = round3(toNum(r._sum.commissionTotal));
    t.vendorNetTotal = round3(toNum(r._sum.vendorNet));
    t.ordersCount = r._count._all;
  }
  for (const r of due) {
    const t = get(r.vendorId);
    t.due = round3(toNum(r._sum.vendorNet));
    t.dueOrders = r._count._all;
  }
  for (const r of pending) get(r.vendorId).pending = round3(toNum(r._sum.vendorNet));
  for (const r of paid) get(r.vendorId).paid = round3(toNum(r._sum.amount));
  return map;
}

export const emptyTotals = (): VendorTotals => ({
  salesTotal: 0, commissionTotal: 0, vendorNetTotal: 0, ordersCount: 0, due: 0, dueOrders: 0, pending: 0, paid: 0,
});
