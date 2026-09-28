import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { ammanParts, ammanToUtc } from '../../lib/time';
import { contractDisplayStatus, contractTotals } from '../../services/contracts.service';
import { optionalDate, toCsv } from './shared';

/**
 * التقارير: كل تقرير يعيد أعمدة (بالعربية والإنجليزية) وصفوفًا وإجماليات،
 * ويقبل مدى تاريخ وحالة، ويُصدَّر CSV بنفس أداة التصدير الحالية (format=csv).
 */
export const reportsRouter = Router();

type Col = { key: string; ar: string; en: string; money?: boolean };
type Report = { columns: Col[]; rows: Record<string, unknown>[]; totals: Record<string, number> };

const KINDS = ['sales', 'orders', 'delivery', 'cod', 'settlements', 'contracts', 'annual', 'pest', 'tenders', 'commissions'] as const;
type Kind = (typeof KINDS)[number];

const c = (key: string, ar: string, en: string, money = false): Col => ({ key, ar, en, money });
const day = (d: Date) => ammanParts(d).date;
const sum = (rows: Record<string, unknown>[], k: string) => round3(rows.reduce((n, r) => n + toNum(r[k] as number), 0));

function range(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: ammanToUtc(from, '00:00') } : {}), ...(to ? { lte: ammanToUtc(to, '23:59') } : {}) };
}

async function build(kind: Kind, q: { from?: string; to?: string; status?: string }): Promise<Report> {
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
        if (o.deliveryStatus === 'DELIVERED') (row.delivered as number)++;
        else if (o.deliveryStatus === 'FAILED') (row.failed as number)++;
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
}

reportsRouter.get(
  '/:kind',
  asyncHandler(async (req, res) => {
    const kind = z.enum(KINDS).parse(req.params.kind);
    const q = z
      .object({ from: optionalDate, to: optionalDate, status: z.string().max(30).optional(), format: z.enum(['json', 'csv']).default('json'), lang: z.enum(['ar', 'en']).default('ar') })
      .parse(req.query);
    const report = await build(kind, q);
    if (q.format === 'csv') {
      const csv = toCsv(report.columns.map((col) => col[q.lang]), report.rows.map((row) => report.columns.map((col) => row[col.key])));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="farja-group-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
      return;
    }
    ok(res, report);
  }),
);
