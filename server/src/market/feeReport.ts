import { Prisma, type FinancialStatus, type RequestStatus } from '@prisma/client';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';

/**
 * تقرير نسبة فرجار على مبيعات المنتجات — من لقطة كل بند وقت البيع (لا يُعاد حسابها من نسب المنتجات الحالية).
 * "مسددة" = مخصومة في تسوية دُفعت للمورد، "مستحقة" = لم تدخل تسوية بعد.
 */
export type FeeFilters = {
  vendorId?: string;
  productId?: string;
  categoryId?: string;
  feeMin?: number;
  feeMax?: number;
  status?: RequestStatus;
  financialStatus?: FinancialStatus;
  settled?: boolean;
  from?: Date;
  to?: Date;
};

function where(f: FeeFilters): Prisma.OrderItemWhereInput {
  return {
    productId: f.productId ?? { not: null },
    // منتجات فرجار نفسها ليست عمولة
    vendor: { isHouse: false },
    order: { deletedAt: null, ...(f.financialStatus ? { financialStatus: f.financialStatus } : {}) },
    vendorOrder: {
      status: f.status ?? { not: 'CANCELLED' },
      ...(f.settled === undefined ? {} : { payoutId: f.settled ? { not: null } : null }),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    },
    ...(f.vendorId ? { vendorId: f.vendorId } : {}),
    ...(f.categoryId ? { product: { OR: [{ categoryId: f.categoryId }, { category: { parentId: f.categoryId } }] } } : {}),
    ...(f.feeMin !== undefined || f.feeMax !== undefined
      ? { platformFeePercent: { ...(f.feeMin !== undefined ? { gte: f.feeMin } : {}), ...(f.feeMax !== undefined ? { lte: f.feeMax } : {}) } }
      : {}),
  };
}

const n = (v: Prisma.Decimal | number | null | undefined) => round3(toNum(v));

export async function feeReport(f: FeeFilters, opts: { lines?: number } = {}) {
  const base = where(f);
  const sum = { lineTotal: true, platformFeeAmount: true, vendorNet: true, quantity: true } as const;
  const [all, settled, byProduct, byVendor, lines] = await Promise.all([
    prisma.orderItem.aggregate({ where: base, _sum: sum, _count: { _all: true } }),
    prisma.orderItem.aggregate({ where: { AND: [base, { vendorOrder: { payoutId: { not: null } } }] }, _sum: { platformFeeAmount: true } }),
    prisma.orderItem.groupBy({ by: ['productId'], where: base, _sum: sum, orderBy: { _sum: { platformFeeAmount: 'desc' } }, take: 200 }),
    prisma.orderItem.groupBy({ by: ['vendorId'], where: base, _sum: sum, orderBy: { _sum: { platformFeeAmount: 'desc' } }, take: 200 }),
    prisma.orderItem.findMany({
      where: base,
      orderBy: { vendorOrder: { createdAt: 'desc' } },
      take: opts.lines ?? 100,
      select: {
        id: true,
        name: true,
        productId: true,
        quantity: true,
        lineTotal: true,
        supplierUnitPrice: true,
        unitFinalPrice: true,
        platformFeePercent: true,
        platformFeeAmount: true,
        vendorNet: true,
        vendor: { select: { id: true, name: true } },
        order: { select: { id: true, number: true, financialStatus: true } },
        vendorOrder: { select: { id: true, number: true, status: true, payoutId: true, createdAt: true } },
      },
    }),
  ]);

  const productIds = byProduct.map((r) => r.productId!).filter(Boolean);
  const vendorIds = byVendor.map((r) => r.vendorId);
  const [products, vendors] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, platformFeePercent: true, stock: true, vendor: { select: { id: true, name: true } }, category: { select: { name: true } } },
    }),
    prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }),
  ]);
  const pMap = new Map(products.map((p) => [p.id, p]));
  const vMap = new Map(vendors.map((v) => [v.id, v]));

  const totalFees = n(all._sum.platformFeeAmount);
  const paidFees = n(settled._sum.platformFeeAmount);
  return {
    totals: {
      sales: n(all._sum.lineTotal),
      supplierNet: n(all._sum.vendorNet),
      fees: totalFees,
      feesSettled: paidFees,
      feesOutstanding: round3(totalFees - paidFees),
      units: all._sum.quantity ?? 0,
      lines: all._count._all,
    },
    byProduct: byProduct.map((r) => {
      const p = pMap.get(r.productId!);
      const sales = n(r._sum.lineTotal);
      const fees = n(r._sum.platformFeeAmount);
      return {
        productId: r.productId,
        name: p?.name ?? '—',
        vendor: p?.vendor ?? null,
        category: p?.category.name ?? null,
        currentFeePercent: p ? toNum(p.platformFeePercent) : null,
        units: r._sum.quantity ?? 0,
        remaining: p?.stock ?? 0,
        sales,
        supplierNet: n(r._sum.vendorNet),
        fees,
        // النسبة الفعلية من المبيعات (تختلف عن نسبة المنتج إن تغيّرت بين الطلبات)
        effectivePercent: sales > 0 ? round3((fees / (sales - fees)) * 100) : 0,
      };
    }),
    bySupplier: byVendor.map((r) => ({
      vendorId: r.vendorId,
      name: vMap.get(r.vendorId)?.name ?? '—',
      units: r._sum.quantity ?? 0,
      sales: n(r._sum.lineTotal),
      supplierNet: n(r._sum.vendorNet),
      fees: n(r._sum.platformFeeAmount),
    })),
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      productId: l.productId,
      quantity: l.quantity,
      supplierUnitPrice: n(l.supplierUnitPrice),
      customerUnitPrice: n(l.unitFinalPrice),
      feePercent: n(l.platformFeePercent),
      feeAmount: n(l.platformFeeAmount),
      lineTotal: n(l.lineTotal),
      supplierNet: n(l.vendorNet),
      vendor: l.vendor,
      orderId: l.order.id,
      orderNumber: l.order.number,
      financialStatus: l.order.financialStatus,
      vendorOrderNumber: l.vendorOrder.number,
      status: l.vendorOrder.status,
      settled: !!l.vendorOrder.payoutId,
      createdAt: l.vendorOrder.createdAt,
    })),
  };
}
