import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { ammanParts, ammanToUtc } from '../../lib/time';
import { contractDisplayStatus, contractTotals } from '../../services/contracts.service';
import { optionalDate, toCsv } from './shared';
import ExcelJS from 'exceljs';
import type { DeliveryStatus } from '@prisma/client';
import { DELIVERED_SET, FAILURES, STATUS_AR } from '../../services/delivery.service';
import { driverPerformance, orderFilters, orderWhere } from './delivery';
import { type FeeFilters, feeReport } from '../../market/feeReport';

/**
 * التقارير: كل تقرير يعيد أعمدة (بالعربية والإنجليزية) وصفوفًا وإجماليات،
 * ويقبل مدى تاريخ وحالة، ويُصدَّر CSV بنفس أداة التصدير الحالية (format=csv).
 */
export const reportsRouter = Router();

type Col = { key: string; ar: string; en: string; money?: boolean };
type Report = { columns: Col[]; rows: Record<string, unknown>[]; totals: Record<string, number> };

const KINDS = [
  'sales', 'orders', 'delivery', 'cod', 'settlements', 'contracts', 'annual', 'pest', 'tenders', 'commissions', 'platform_fees',
  // نظام إدارة التوصيل
  'dm_orders', 'dm_delivered', 'dm_failed', 'dm_collections', 'dm_drivers', 'dm_suppliers', 'dm_customers', 'dm_fees',
] as const;
type Kind = (typeof KINDS)[number];

const c = (key: string, ar: string, en: string, money = false): Col => ({ key, ar, en, money });
const day = (d: Date) => ammanParts(d).date;
const sum = (rows: Record<string, unknown>[], k: string) => round3(rows.reduce((n, r) => n + toNum(r[k] as number), 0));

function range(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: ammanToUtc(from, '00:00') } : {}), ...(to ? { lte: ammanToUtc(to, '23:59') } : {}) };
}

type Query = {
  from?: string;
  to?: string;
  status?: string;
  supplierId?: string;
  driverId?: string;
  area?: string;
  paymentMethod?: string;
  customer?: string;
  productId?: string;
  categoryId?: string;
  feeMin?: number;
  feeMax?: number;
  financialStatus?: string;
  settled?: 'true' | 'false';
};

const STATUSES = ['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const FIN = ['PAID', 'COD', 'PARTIAL_PAYMENT', 'PAYMENT_PENDING', 'COLLECTED', 'NOT_COLLECTED'] as const;

/** فلاتر تقرير نسبة فرجار من الاستعلام (قيم غير معروفة تُتجاهل) */
function feeFilters(q: Query): FeeFilters {
  const r = range(q.from, q.to);
  return {
    vendorId: q.supplierId || undefined,
    productId: q.productId || undefined,
    categoryId: q.categoryId || undefined,
    feeMin: q.feeMin,
    feeMax: q.feeMax,
    status: (STATUSES as readonly string[]).includes(q.status ?? '') ? (q.status as FeeFilters['status']) : undefined,
    financialStatus: (FIN as readonly string[]).includes(q.financialStatus ?? '') ? (q.financialStatus as FeeFilters['financialStatus']) : undefined,
    settled: q.settled === undefined ? undefined : q.settled === 'true',
    from: r?.gte,
    to: r?.lte,
  };
}

async function build(kind: Kind, q: Query): Promise<Report> {
  if (kind.startsWith('dm_')) return buildDelivery(kind, q);
  const r = range(q.from, q.to);
  const orderWhere: Prisma.OrderWhereInput = { deletedAt: null, ...(r ? { createdAt: r } : {}) };

  switch (kind) {
    case 'sales': {
      const orders = await prisma.order.findMany({
        where: { ...orderWhere, status: { not: 'CANCELLED' } },
        select: { createdAt: true, total: true, deliveryFee: true, paymentMethod: true, codCollected: true },
      });
      const byDay = new Map<string, { date: string; orders: number; sales: number; cod: number; online: number; deliveryFees: number }>();
      for (const o of orders) {
        const k = day(o.createdAt);
        const row = byDay.get(k) ?? { date: k, orders: 0, sales: 0, cod: 0, online: 0, deliveryFees: 0 };
        row.orders++;
        row.sales = round3(row.sales + toNum(o.total));
        row.deliveryFees = round3(row.deliveryFees + toNum(o.deliveryFee));
        if (o.paymentMethod === 'COD') row.cod = round3(row.cod + toNum(o.total));
        else if (o.paymentMethod) row.online = round3(row.online + toNum(o.total));
        byDay.set(k, row);
      }
      const rows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
      return {
        columns: [c('date', 'اليوم', 'Date'), c('orders', 'الطلبات', 'Orders'), c('sales', 'المبيعات', 'Sales', true), c('cod', 'عند الاستلام', 'COD', true), c('online', 'دفع مسبق', 'Prepaid', true), c('deliveryFees', 'رسوم التوصيل', 'Delivery fees', true)],
        rows,
        totals: { orders: sum(rows, 'orders'), sales: sum(rows, 'sales'), cod: sum(rows, 'cod'), online: sum(rows, 'online'), deliveryFees: sum(rows, 'deliveryFees') },
      };
    }
    case 'orders': {
      const orders = await prisma.order.findMany({
        where: { ...orderWhere, ...(q.status ? { status: q.status as never } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { number: true, createdAt: true, customerName: true, status: true, deliveryStatus: true, paymentMethod: true, total: true },
      });
      const rows = orders.map((o) => ({ ...o, createdAt: day(o.createdAt), total: toNum(o.total), paymentMethod: o.paymentMethod ?? '' }));
      return {
        columns: [c('number', 'الطلب', 'Order'), c('createdAt', 'التاريخ', 'Date'), c('customerName', 'العميل', 'Customer'), c('status', 'الحالة', 'Status'), c('deliveryStatus', 'التوصيل', 'Delivery'), c('paymentMethod', 'الدفع', 'Payment'), c('total', 'الإجمالي', 'Total', true)],
        rows,
        totals: { count: rows.length, total: sum(rows, 'total') },
      };
    }
    case 'delivery': {
      const orders = await prisma.order.findMany({
        where: { ...orderWhere, ...(q.status ? { deliveryStatus: q.status as never } : {}) },
        select: { deliveryStatus: true, deliveryFee: true, driver: { select: { name: true } }, deliveryCompany: { select: { name: true } } },
      });
      const map = new Map<string, Record<string, number | string>>();
      for (const o of orders) {
        const carrier = o.driver?.name ?? o.deliveryCompany?.name ?? '—';
        const row = map.get(carrier) ?? { carrier, total: 0, delivered: 0, failed: 0, cancelled: 0, open: 0, fees: 0 };
        (row.total as number)++;
        if (DELIVERED_SET.includes(o.deliveryStatus)) (row.delivered as number)++;
        else if (['DELIVERY_FAILED', 'CUSTOMER_NOT_AVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS', 'RESCHEDULED'].includes(o.deliveryStatus)) (row.failed as number)++;
        else if (o.deliveryStatus === 'CANCELLED') (row.cancelled as number)++;
        else (row.open as number)++;
        row.fees = round3((row.fees as number) + toNum(o.deliveryFee));
        map.set(carrier, row);
      }
      const rows = [...map.values()];
      return {
        columns: [c('carrier', 'السائق / الشركة', 'Driver / company'), c('total', 'الطلبات', 'Orders'), c('delivered', 'تم التسليم', 'Delivered'), c('failed', 'فشل', 'Failed'), c('cancelled', 'ملغي', 'Cancelled'), c('open', 'قيد التوصيل', 'Open'), c('fees', 'رسوم التوصيل', 'Fees', true)],
        rows,
        totals: { total: sum(rows, 'total'), delivered: sum(rows, 'delivered'), failed: sum(rows, 'failed'), cancelled: sum(rows, 'cancelled'), open: sum(rows, 'open'), fees: sum(rows, 'fees') },
      };
    }
    case 'cod': {
      const orders = await prisma.order.findMany({
        where: { ...orderWhere, paymentMethod: 'COD', ...(q.status ? { codStatus: q.status as never } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { number: true, createdAt: true, codAmount: true, codStatus: true, codCollected: true, deliveryStatus: true, driver: { select: { name: true } }, deliveryCompany: { select: { name: true } }, settlement: { select: { ref: true, status: true } } },
      });
      const rows = orders.map((o) => ({
        number: o.number,
        createdAt: day(o.createdAt),
        carrier: o.driver?.name ?? o.deliveryCompany?.name ?? '',
        deliveryStatus: o.deliveryStatus,
        codAmount: toNum(o.codAmount),
        codStatus: o.codStatus ?? '',
        codCollected: toNum(o.codCollected),
        settled: o.codStatus === 'SETTLED' ? toNum(o.codCollected) : 0,
        pending: o.codStatus === 'COLLECTED' ? toNum(o.codCollected) : 0,
        settlement: o.settlement?.ref ?? '',
      }));
      return {
        columns: [c('number', 'الطلب', 'Order'), c('createdAt', 'التاريخ', 'Date'), c('carrier', 'السائق / الشركة', 'Driver / company'), c('deliveryStatus', 'التوصيل', 'Delivery'), c('codAmount', 'المطلوب', 'COD amount', true), c('codStatus', 'التحصيل', 'Collection'), c('codCollected', 'المحصّل', 'Collected', true), c('pending', 'معلّق', 'Pending', true), c('settlement', 'التسوية', 'Settlement')],
        rows,
        totals: { codAmount: sum(rows, 'codAmount'), codCollected: sum(rows, 'codCollected'), settled: sum(rows, 'settled'), pending: sum(rows, 'pending') },
      };
    }
    case 'settlements': {
      const items = await prisma.deliverySettlement.findMany({
        where: { ...(r ? { receivedAt: r } : {}), ...(q.status ? { status: q.status as never } : {}) },
        orderBy: { receivedAt: 'desc' },
        include: { driver: { select: { name: true } }, deliveryCompany: { select: { name: true } }, receivedBy: { select: { name: true } } },
      });
      const rows = items.map((s) => ({
        ref: s.ref,
        receivedAt: day(s.receivedAt),
        carrier: s.driver?.name ?? s.deliveryCompany?.name ?? '',
        ordersCount: s.ordersCount,
        amount: toNum(s.amount),
        status: s.status,
        receivedBy: s.receivedBy?.name ?? '',
        notes: s.notes ?? s.voidReason ?? '',
      }));
      return {
        columns: [c('ref', 'المرجع', 'Reference'), c('receivedAt', 'التاريخ', 'Date'), c('carrier', 'السائق / الشركة', 'Driver / company'), c('ordersCount', 'الطلبات', 'Orders'), c('amount', 'المبلغ', 'Amount', true), c('status', 'الحالة', 'Status'), c('receivedBy', 'استلمها', 'Received by'), c('notes', 'ملاحظات', 'Notes')],
        rows,
        totals: { count: rows.length, confirmed: round3(rows.filter((x) => x.status === 'CONFIRMED').reduce((n, x) => n + x.amount, 0)) },
      };
    }
    case 'contracts':
    case 'annual':
    case 'pest': {
      const where: Prisma.ContractWhereInput = {
        deletedAt: null,
        ...(kind === 'contracts' ? { type: 'MAINTENANCE' } : kind === 'annual' ? { type: 'ANNUAL_CORPORATE' } : { services: { some: { key: { startsWith: 'pest-control' } } } }),
        ...(r ? { startDate: r } : {}),
        ...(q.status && q.status !== 'EXPIRING_SOON' ? { status: q.status as never } : {}),
      };
      const list = await prisma.contract.findMany({ where, orderBy: { endDate: 'asc' }, include: { customer: { select: { name: true, companyName: true } } } });
      const t = await contractTotals(list.map((x) => x.id));
      let rows = list.map((k) => {
        const s = t.get(k.id)!;
        return {
          ref: k.ref ?? `#${k.number}`,
          customer: k.customer.companyName ?? k.customer.name,
          type: k.type,
          startDate: day(k.startDate),
          endDate: day(k.endDate),
          status: contractDisplayStatus(k),
          value: toNum(k.value),
          paid: s.paid,
          remaining: round3(toNum(k.value) - s.paid),
          visitsIncluded: k.visitsIncluded ?? '',
          visitsUsed: s.visitsUsed,
          requests: s.requests,
        };
      });
      if (q.status === 'EXPIRING_SOON') rows = rows.filter((x) => x.status === 'EXPIRING_SOON');
      const extra: Record<string, number> = {};
      if (kind === 'pest') {
        // طلبات الشركات التي تشمل مكافحة الآفات ضمن المدة
        extra.pestRequests = await prisma.corporateRequest.count({ where: { deletedAt: null, services: { some: { key: { startsWith: 'pest-control' } } }, ...(r ? { createdAt: r } : {}) } });
      }
      return {
        columns: [c('ref', 'المرجع', 'Reference'), c('customer', 'العميل', 'Customer'), c('type', 'النوع', 'Type'), c('startDate', 'البداية', 'Start'), c('endDate', 'النهاية', 'End'), c('status', 'الحالة', 'Status'), c('value', 'القيمة', 'Value', true), c('paid', 'المدفوع', 'Paid', true), c('remaining', 'المتبقي', 'Remaining', true), c('visitsIncluded', 'الزيارات المشمولة', 'Included visits'), c('visitsUsed', 'المنفّذة', 'Completed visits'), c('requests', 'الطلبات', 'Requests')],
        rows,
        totals: {
          count: rows.length,
          active: rows.filter((x) => x.status === 'ACTIVE' || x.status === 'EXPIRING_SOON').length,
          expiring: rows.filter((x) => x.status === 'EXPIRING_SOON').length,
          value: sum(rows, 'value'),
          paid: sum(rows, 'paid'),
          remaining: sum(rows, 'remaining'),
          ...extra,
        },
      };
    }
    case 'tenders': {
      const list = await prisma.tender.findMany({
        where: { deletedAt: null, ...(r ? { createdAt: r } : {}), ...(q.status ? { status: q.status as never } : {}) },
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { name: true, companyName: true } }, _count: { select: { offers: true } } },
      });
      const rows = list.map((t) => ({
        ref: t.ref,
        company: t.customer.companyName ?? t.customer.name,
        title: t.title,
        deadline: day(t.deadline),
        status: t.status,
        offers: t._count.offers,
        awardedAmount: toNum(t.awardedAmount),
        commissionAmount: toNum(t.commissionAmount),
      }));
      return {
        columns: [c('ref', 'المرجع', 'Reference'), c('company', 'الشركة', 'Company'), c('title', 'العنوان', 'Title'), c('deadline', 'آخر موعد', 'Deadline'), c('status', 'الحالة', 'Status'), c('offers', 'العروض', 'Offers'), c('awardedAmount', 'قيمة الترسية', 'Awarded', true), c('commissionAmount', 'العمولة', 'Commission', true)],
        rows,
        totals: { count: rows.length, awarded: rows.filter((x) => x.status === 'AWARDED').length, awardedAmount: sum(rows, 'awardedAmount'), commissionAmount: sum(rows, 'commissionAmount') },
      };
    }
    case 'platform_fees': {
      const rep = await feeReport(feeFilters(q), { lines: 0 });
      const rows = rep.byProduct.map((p) => ({
        product: p.name,
        supplier: p.vendor?.name ?? '',
        category: p.category ?? '',
        percent: p.currentFeePercent ?? '',
        units: p.units,
        remaining: p.remaining,
        sales: p.sales,
        supplierNet: p.supplierNet,
        fees: p.fees,
      }));
      return {
        columns: [
          c('product', 'المنتج', 'Product'),
          c('supplier', 'المورد', 'Supplier'),
          c('category', 'القسم', 'Category'),
          c('percent', 'نسبة فرجار الحالية %', 'Current Farjar %'),
          c('units', 'المباع', 'Units sold'),
          c('remaining', 'المتبقي', 'Remaining'),
          c('sales', 'المبيعات', 'Sales', true),
          c('supplierNet', 'مستحق المورد', 'Supplier net', true),
          c('fees', 'إيراد فرجار', 'Farjar revenue', true),
        ],
        rows,
        totals: { sales: rep.totals.sales, fees: rep.totals.fees, feesSettled: rep.totals.feesSettled, feesOutstanding: rep.totals.feesOutstanding, units: rep.totals.units },
      };
    }
    case 'commissions': {
      const [tenders, vendorOrders] = await Promise.all([
        prisma.tender.findMany({ where: { deletedAt: null, status: 'AWARDED', ...(r ? { awardedAt: r } : {}) }, select: { ref: true, title: true, awardedAt: true, awardedAmount: true, commissionPercent: true, commissionAmount: true, providerAmount: true } }),
        prisma.vendorOrder.findMany({
          where: { status: { not: 'CANCELLED' }, order: { deletedAt: null }, vendor: { isHouse: false }, ...(r ? { createdAt: r } : {}) },
          select: { number: true, createdAt: true, total: true, commissionTotal: true, vendorNet: true, vendor: { select: { name: true } } },
        }),
      ]);
      const rows = [
        ...tenders.map((t) => ({ source: 'TENDER', ref: t.ref, party: t.title, date: t.awardedAt ? day(t.awardedAt) : '', gross: toNum(t.awardedAmount), percent: toNum(t.commissionPercent), commission: toNum(t.commissionAmount), net: toNum(t.providerAmount) })),
        ...vendorOrders.map((v) => ({ source: 'MARKETPLACE', ref: `#${v.number}`, party: v.vendor.name, date: day(v.createdAt), gross: toNum(v.total), percent: '', commission: toNum(v.commissionTotal), net: toNum(v.vendorNet) })),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const bySource = (s: string) => round3(rows.filter((x) => x.source === s).reduce((n, x) => n + x.commission, 0));
      return {
        columns: [c('source', 'المصدر', 'Source'), c('ref', 'المرجع', 'Reference'), c('party', 'الجهة', 'Party'), c('date', 'التاريخ', 'Date'), c('gross', 'القيمة', 'Gross', true), c('percent', 'النسبة %', 'Rate %'), c('commission', 'العمولة', 'Commission', true), c('net', 'صافي المزوّد', 'Provider net', true)],
        rows,
        totals: { commission: sum(rows, 'commission'), tenders: bySource('TENDER'), marketplace: bySource('MARKETPLACE'), gross: sum(rows, 'gross') },
      };
    }
  }
  throw new Error(`unknown report ${kind}`);
}

const feeQuery = {
  productId: z.string().max(40).optional(),
  categoryId: z.string().max(40).optional(),
  feeMin: z.coerce.number().min(0).max(100).optional(),
  feeMax: z.coerce.number().min(0).max(100).optional(),
  financialStatus: z.string().max(30).optional(),
  settled: z.enum(['true', 'false']).optional(),
};

/** نسبة فرجار: الإجماليات، حسب المنتج، حسب المورد، وآخر البنود — مع الفلاتر */
reportsRouter.get(
  '/fees/overview',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ from: optionalDate, to: optionalDate, status: z.string().max(30).optional(), supplierId: z.string().max(40).optional(), ...feeQuery })
      .parse(req.query);
    ok(res, await feeReport(feeFilters(q), { lines: 100 }));
  }),
);

reportsRouter.get(
  '/:kind',
  asyncHandler(async (req, res) => {
    const kind = z.enum(KINDS).parse(req.params.kind);
    const q = z
      .object({
        from: optionalDate,
        to: optionalDate,
        status: z.string().max(30).optional(),
        supplierId: z.string().max(40).optional(),
        driverId: z.string().max(40).optional(),
        area: z.string().trim().max(100).optional(),
        paymentMethod: z.string().max(20).optional(),
        customer: z.string().trim().max(100).optional(),
        ...feeQuery,
        format: z.enum(['json', 'csv', 'xlsx']).default('json'),
        lang: z.enum(['ar', 'en']).default('ar'),
      })
      .parse(req.query);
    const report = await build(kind, q);
    if (q.format === 'xlsx') {
      const buf = await toXlsx(report, q.lang, kind);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="farja-group-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.send(buf);
      return;
    }
    if (q.format === 'csv') {
      const csv = toCsv(report.columns.map((col) => col[q.lang]), report.rows.map((row) => report.columns.map((col) => cellLabel(col.key, row[col.key], q.lang))));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="farja-group-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
      return;
    }
    ok(res, report);
  }),
);

// ───────────── تقارير نظام التوصيل ─────────────

const FAILED_SET: DeliveryStatus[] = [...FAILURES, 'RESCHEDULED'];
const PAY_AR: Record<string, string> = { COD: 'عند الاستلام', CASH: 'نقدًا', CLIQ: 'CliQ', BANK_TRANSFER: 'تحويل بنكي', CARD: 'بطاقة', OTHER: 'أخرى' };
const SOURCE_AR: Record<string, string> = { STORE: 'المتجر', SUPPLIER: 'المورد', ADMIN: 'الإدارة' };
const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : '');
const dt = (d: Date | null) => (d ? `${day(d)} ${ammanParts(d).time}` : '');

async function buildDelivery(kind: Kind, q: Query): Promise<Report> {
  const filters = orderFilters.parse({
    from: q.from,
    to: q.to,
    supplierId: q.supplierId,
    driverId: q.driverId,
    area: q.area,
    paymentMethod: q.paymentMethod || undefined,
    q: q.customer,
    ...(q.status ? { deliveryStatus: q.status } : {}),
  });
  const where = orderWhere(filters);
  const base = {
    code: true,
    number: true,
    createdAt: true,
    source: true,
    customerName: true,
    customerId: true,
    phone: true,
    area: true,
    deliveryStatus: true,
    paymentMethod: true,
    financialStatus: true,
    total: true,
    subtotal: true,
    discountTotal: true,
    deliveryFee: true,
    codAmount: true,
    codCollected: true,
    codCollectedAt: true,
    collectedMethod: true,
    codStatus: true,
    pickedUpAt: true,
    deliveredAt: true,
    supplier: { select: { id: true, name: true } },
    vendorOrders: { select: { vendor: { select: { id: true, name: true } } } },
    driver: { select: { name: true } },
    settlement: { select: { ref: true } },
    proof: { select: { recipientName: true } },
  } as const;
  const supplierOf = (o: { supplier: { id: string; name: string } | null; vendorOrders: { vendor: { id: string; name: string } }[] }) =>
    o.supplier ?? o.vendorOrders[0]?.vendor ?? null;
  const code = (o: { code: string | null; number: number }) => o.code ?? `#${o.number}`;

  switch (kind) {
    case 'dm_orders': {
      const orders = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, select: base, take: 5000 });
      const rows = orders.map((o) => ({
        code: code(o),
        createdAt: dt(o.createdAt),
        source: SOURCE_AR[o.source] ?? o.source,
        supplier: supplierOf(o)?.name ?? '',
        customer: o.customerName,
        phone: o.phone,
        area: o.area ?? '',
        driver: o.driver?.name ?? '',
        status: o.deliveryStatus,
        payment: o.paymentMethod ? PAY_AR[o.paymentMethod] ?? o.paymentMethod : '',
        products: toNum(o.total),
        fee: toNum(o.deliveryFee),
        discount: toNum(o.discountTotal),
        due: toNum(o.codAmount),
        collected: toNum(o.codCollected),
        financial: o.financialStatus ?? '',
      }));
      return {
        columns: [c('code', 'رقم الطلب', 'Order ID'), c('createdAt', 'التاريخ', 'Created'), c('source', 'المصدر', 'Source'), c('supplier', 'المورد', 'Supplier'), c('customer', 'العميل', 'Customer'), c('phone', 'الهاتف', 'Phone'), c('area', 'المنطقة', 'Area'), c('driver', 'موظف التوصيل', 'Driver'), c('status', 'الحالة', 'Status'), c('payment', 'الدفع', 'Payment'), c('products', 'قيمة المنتجات', 'Products', true), c('fee', 'أجرة التوصيل', 'Delivery fee', true), c('discount', 'الخصم', 'Discount', true), c('due', 'المطلوب تحصيله', 'To collect', true), c('collected', 'المحصّل', 'Collected', true), c('financial', 'الحالة المالية', 'Financial status')],
        rows,
        totals: { count: rows.length, products: sum(rows, 'products'), fee: sum(rows, 'fee'), due: sum(rows, 'due'), collected: sum(rows, 'collected') },
      };
    }
    case 'dm_delivered': {
      const orders = await prisma.order.findMany({ where: { ...where, deliveryStatus: { in: DELIVERED_SET } }, orderBy: { deliveredAt: 'desc' }, select: base, take: 5000 });
      const rows = orders.map((o) => ({
        code: code(o),
        supplier: supplierOf(o)?.name ?? '',
        customer: o.customerName,
        area: o.area ?? '',
        driver: o.driver?.name ?? '',
        pickedUpAt: dt(o.pickedUpAt),
        deliveredAt: dt(o.deliveredAt),
        minutes: minutesBetween(o.pickedUpAt, o.deliveredAt),
        recipient: o.proof?.recipientName ?? '',
        collected: toNum(o.codCollected),
        status: o.deliveryStatus,
      }));
      return {
        columns: [c('code', 'رقم الطلب', 'Order ID'), c('supplier', 'المورد', 'Supplier'), c('customer', 'العميل', 'Customer'), c('area', 'المنطقة', 'Area'), c('driver', 'موظف التوصيل', 'Driver'), c('pickedUpAt', 'وقت الاستلام', 'Picked up'), c('deliveredAt', 'وقت التسليم', 'Delivered'), c('minutes', 'المدة (دقيقة)', 'Minutes'), c('recipient', 'المستلم', 'Recipient'), c('collected', 'المحصّل', 'Collected', true), c('status', 'الحالة', 'Status')],
        rows,
        totals: { count: rows.length, collected: sum(rows, 'collected') },
      };
    }
    case 'dm_failed': {
      const orders = await prisma.order.findMany({
        where: { ...where, deliveryStatus: q.status ? where.deliveryStatus : { in: FAILED_SET } },
        orderBy: { updatedAt: 'desc' },
        select: { ...base, updatedAt: true, statusEvents: { where: { toStatus: { in: FAILED_SET } }, orderBy: { createdAt: 'desc' }, take: 1, select: { note: true, actorName: true, createdAt: true } } },
        take: 5000,
      });
      const rows = orders.map((o) => ({
        code: code(o),
        supplier: supplierOf(o)?.name ?? '',
        customer: o.customerName,
        phone: o.phone,
        area: o.area ?? '',
        driver: o.driver?.name ?? '',
        status: o.deliveryStatus,
        reason: o.statusEvents[0]?.note ?? '',
        at: dt(o.statusEvents[0]?.createdAt ?? o.updatedAt),
      }));
      return {
        columns: [c('code', 'رقم الطلب', 'Order ID'), c('supplier', 'المورد', 'Supplier'), c('customer', 'العميل', 'Customer'), c('phone', 'الهاتف', 'Phone'), c('area', 'المنطقة', 'Area'), c('driver', 'موظف التوصيل', 'Driver'), c('status', 'الحالة', 'Status'), c('reason', 'السبب', 'Reason'), c('at', 'التاريخ', 'Date')],
        rows,
        totals: { count: rows.length },
      };
    }
    case 'dm_collections': {
      const orders = await prisma.order.findMany({ where: { ...where, codAmount: { gt: 0 }, deliveryStatus: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: base, take: 5000 });
      const rows = orders.map((o) => ({
        code: code(o),
        customer: o.customerName,
        driver: o.driver?.name ?? '',
        status: o.deliveryStatus,
        due: toNum(o.codAmount),
        collected: toNum(o.codCollected),
        remaining: round3(Math.max(0, toNum(o.codAmount) - toNum(o.codCollected))),
        method: o.collectedMethod ? PAY_AR[o.collectedMethod] ?? o.collectedMethod : '',
        collectedAt: dt(o.codCollectedAt),
        codStatus: o.codStatus ?? '',
        settlement: o.settlement?.ref ?? '',
      }));
      return {
        columns: [c('code', 'رقم الطلب', 'Order ID'), c('customer', 'العميل', 'Customer'), c('driver', 'موظف التوصيل', 'Driver'), c('status', 'الحالة', 'Status'), c('due', 'المطلوب', 'Due', true), c('collected', 'المحصّل', 'Collected', true), c('remaining', 'غير المحصّل', 'Uncollected', true), c('method', 'طريقة التحصيل', 'Method'), c('collectedAt', 'وقت التحصيل', 'Collected at'), c('codStatus', 'التحصيل', 'Collection'), c('settlement', 'التسوية', 'Settlement')],
        rows,
        totals: { count: rows.length, due: sum(rows, 'due'), collected: sum(rows, 'collected'), remaining: sum(rows, 'remaining') },
      };
    }
    case 'dm_drivers': {
      const rows = await driverPerformance(where);
      return {
        columns: [c('name', 'موظف التوصيل', 'Driver'), c('assigned', 'المسندة', 'Assigned'), c('delivered', 'المسلّمة', 'Delivered'), c('failed', 'المتعثرة', 'Failed'), c('active', 'الجارية', 'Active'), c('cancelled', 'الملغاة', 'Cancelled'), c('successRate', 'نسبة النجاح %', 'Success %'), c('avgMinutes', 'متوسط مدة التوصيل (دقيقة)', 'Avg minutes'), c('collected', 'المحصّل', 'Collected', true), c('fees', 'أجور التوصيل', 'Delivery fees', true)],
        rows: rows as unknown as Record<string, unknown>[],
        totals: { assigned: rows.reduce((n, r) => n + r.assigned, 0), delivered: rows.reduce((n, r) => n + r.delivered, 0), failed: rows.reduce((n, r) => n + r.failed, 0), collected: round3(rows.reduce((n, r) => n + r.collected, 0)), fees: round3(rows.reduce((n, r) => n + r.fees, 0)) },
      };
    }
    case 'dm_suppliers':
    case 'dm_customers': {
      const orders = await prisma.order.findMany({ where, select: base, take: 20000 });
      const map = new Map<string, { name: string; orders: number; delivered: number; failed: number; cancelled: number; value: number; fees: number; collected: number; last: Date | null }>();
      for (const o of orders) {
        const key = kind === 'dm_suppliers' ? supplierOf(o)?.id ?? '—' : o.customerId;
        const name = kind === 'dm_suppliers' ? supplierOf(o)?.name ?? '—' : `${o.customerName} (${o.phone})`;
        const r = map.get(key) ?? { name, orders: 0, delivered: 0, failed: 0, cancelled: 0, value: 0, fees: 0, collected: 0, last: null };
        r.orders++;
        if (DELIVERED_SET.includes(o.deliveryStatus)) r.delivered++;
        else if (FAILED_SET.includes(o.deliveryStatus)) r.failed++;
        else if (o.deliveryStatus === 'CANCELLED') r.cancelled++;
        if (o.deliveryStatus !== 'CANCELLED') {
          r.value = round3(r.value + toNum(o.total));
          r.fees = round3(r.fees + toNum(o.deliveryFee));
        }
        r.collected = round3(r.collected + toNum(o.codCollected));
        if (!r.last || o.createdAt > r.last) r.last = o.createdAt;
        map.set(key, r);
      }
      const rows = [...map.values()].sort((a, b) => b.orders - a.orders).map((r) => ({ ...r, last: r.last ? day(r.last) : '' }));
      return {
        columns: [c('name', kind === 'dm_suppliers' ? 'المورد' : 'العميل', kind === 'dm_suppliers' ? 'Supplier' : 'Customer'), c('orders', 'الطلبات', 'Orders'), c('delivered', 'المسلّمة', 'Delivered'), c('failed', 'المتعثرة', 'Failed'), c('cancelled', 'الملغاة', 'Cancelled'), c('value', 'قيمة المنتجات', 'Products value', true), c('fees', 'أجور التوصيل', 'Delivery fees', true), c('collected', 'المحصّل', 'Collected', true), c('last', 'آخر طلب', 'Last order')],
        rows,
        totals: { count: rows.length, orders: sum(rows, 'orders'), value: sum(rows, 'value'), fees: sum(rows, 'fees'), collected: sum(rows, 'collected') },
      };
    }
    case 'dm_fees': {
      // إيراد أجور التوصيل: الطلبات المسلّمة حسب يوم التسليم
      const orders = await prisma.order.findMany({
        where: { ...where, ...(q.from || q.to ? { createdAt: undefined, deliveredAt: range(q.from, q.to) } : {}), deliveryStatus: { in: DELIVERED_SET } },
        select: { deliveredAt: true, deliveryFee: true, customerPaysFee: true },
      });
      const byDay = new Map<string, { date: string; orders: number; fees: number; byCustomer: number; bySupplier: number }>();
      for (const o of orders) {
        if (!o.deliveredAt) continue;
        const k = day(o.deliveredAt);
        const r = byDay.get(k) ?? { date: k, orders: 0, fees: 0, byCustomer: 0, bySupplier: 0 };
        r.orders++;
        r.fees = round3(r.fees + toNum(o.deliveryFee));
        if (o.customerPaysFee) r.byCustomer = round3(r.byCustomer + toNum(o.deliveryFee));
        else r.bySupplier = round3(r.bySupplier + toNum(o.deliveryFee));
        byDay.set(k, r);
      }
      const rows = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
      return {
        columns: [c('date', 'اليوم', 'Date'), c('orders', 'الطلبات المسلّمة', 'Delivered orders'), c('fees', 'أجور التوصيل', 'Delivery fees', true), c('byCustomer', 'يدفعها العميل', 'Paid by customer', true), c('bySupplier', 'يدفعها المورد', 'Paid by supplier', true)],
        rows,
        totals: { orders: sum(rows, 'orders'), fees: sum(rows, 'fees'), byCustomer: sum(rows, 'byCustomer'), bySupplier: sum(rows, 'bySupplier') },
      };
    }
    default:
      throw new Error(`unknown report ${kind}`);
  }
}

/** ملف Excel حقيقي (.xlsx): اتجاه الورقة حسب اللغة، عناوين عريضة، أعمدة المبالغ بصيغة 0.000، وصف الإجماليات */
const FIN_AR: Record<string, string> = { PAID: 'مدفوع', COD: 'الدفع عند الاستلام', PARTIAL_PAYMENT: 'دفع جزئي', PAYMENT_PENDING: 'بانتظار الدفع', COLLECTED: 'تم التحصيل', NOT_COLLECTED: 'لم يُحصَّل' };
const enumEn = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
/** قيم الحالات في ملفات التصدير: عربية أو إنجليزية مقروءة بدل أسماء الـ enum */
function cellLabel(key: string, v: unknown, lang: 'ar' | 'en') {
  if (typeof v !== 'string' || !v) return v;
  if (key === 'status' && v in STATUS_AR) return lang === 'ar' ? STATUS_AR[v as DeliveryStatus] : enumEn(v);
  if (key === 'financial' && v in FIN_AR) return lang === 'ar' ? FIN_AR[v] : enumEn(v);
  return v;
}

async function toXlsx(report: Report, lang: 'ar' | 'en', kind: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Farjar Group';
  const ws = wb.addWorksheet(kind.slice(0, 31), { views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 1 }] });
  ws.columns = report.columns.map((col) => ({ header: col[lang], key: col.key, width: Math.max(12, col[lang].length + 4), style: col.money ? { numFmt: '0.000' } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  for (const row of report.rows) ws.addRow(Object.fromEntries(report.columns.map((col) => [col.key, cellLabel(col.key, row[col.key], lang)])));
  ws.addRow([]);
  const totals = ws.addRow([lang === 'ar' ? 'الإجماليات' : 'Totals']);
  totals.font = { bold: true };
  for (const [k, v] of Object.entries(report.totals)) {
    const col = report.columns.findIndex((x) => x.key === k);
    const r = ws.addRow([]);
    r.getCell(1).value = col >= 0 ? report.columns[col][lang] : k;
    r.getCell(2).value = v;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
