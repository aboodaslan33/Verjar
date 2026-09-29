import { Router } from 'express';
import { adminBus, type AdminEvent } from '../../lib/events';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { contractDisplayStatus, expiringWhere } from '../../services/contracts.service';
import { ammanParts, ammanToUtc } from '../../lib/time';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const today = ammanParts(new Date()).date;
    const [y, m, d] = today.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const dayStart = ammanToUtc(today, '00:00');
    const dayEnd = ammanToUtc(tomorrow, '00:00');
    const monthStart = ammanToUtc(`${today.slice(0, 7)}-01`, '00:00');
    const soon = new Date(Date.now() + 30 * 86400_000);

    const [
      bookingsToday,
      newBookings,
      newOrders,
      pendingCorporate,
      salesMonth,
      ordersMonth,
      expiringContracts,
      upcoming,
      recentBookings,
      recentOrders,
      recentCorporate,
      pendingProducts,
    ] = await Promise.all([
      prisma.booking.count({
        where: { deletedAt: null, status: { not: 'CANCELLED' }, scheduledAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.booking.count({ where: { deletedAt: null, status: 'NEW' } }),
      prisma.order.count({ where: { deletedAt: null, status: 'NEW' } }),
      prisma.corporateRequest.count({
        where: { deletedAt: null, status: { in: ['NEW', 'UNDER_REVIEW', 'PRICED'] } },
      }),
      prisma.order.aggregate({
        where: { deletedAt: null, status: { not: 'CANCELLED' }, createdAt: { gte: monthStart } },
        _sum: { total: true },
      }),
      prisma.order.count({ where: { deletedAt: null, status: { not: 'CANCELLED' }, createdAt: { gte: monthStart } } }),
      prisma.contract.count({
        where: { deletedAt: null, status: 'ACTIVE', endDate: { gte: new Date(), lte: soon } },
      }),
      prisma.booking.findMany({
        where: { deletedAt: null, status: { notIn: ['CANCELLED', 'COMPLETED'] }, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 6,
        select: { id: true, number: true, type: true, name: true, scheduledAt: true, status: true, locationText: true, urgency: true },
      }),
      prisma.booking.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, number: true, type: true, name: true, status: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, number: true, customerName: true, total: true, status: true, createdAt: true },
      }),
      prisma.corporateRequest.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, number: true, type: true, companyName: true, status: true, createdAt: true },
      }),
      prisma.product.count({ where: { deletedAt: null, approvalStatus: 'PENDING', vendor: { active: true } } }),
    ]);

    const ops = await operationsStats(dayStart, dayEnd, monthStart);

    const activity = [
      ...recentBookings.map((b) => ({ kind: 'booking' as const, id: b.id, number: b.number, title: b.name, sub: b.type, status: b.status, at: b.createdAt })),
      ...recentOrders.map((o) => ({ kind: 'order' as const, id: o.id, number: o.number, title: o.customerName, sub: o.total, status: o.status, at: o.createdAt })),
      ...recentCorporate.map((c) => ({ kind: 'corporate' as const, id: c.id, number: c.number, title: c.companyName, sub: c.type, status: c.status, at: c.createdAt })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 12);

    ok(res, {
      bookingsToday,
      newBookings,
      newOrders,
      pendingCorporate,
      salesMonth: Number(salesMonth._sum.total ?? 0),
      ordersMonth,
      expiringContracts,
      pendingProducts,
      /** إثباتات دفع الموردين بانتظار المراجعة + موردون بانتظار الاعتماد (شارات السوق الصناعي) */
      paymentProofs: await prisma.marketInvoice.count({ where: { status: 'PENDING', proofStatus: 'SUBMITTED' } }),
      pendingSuppliers: await prisma.vendor.count({ where: { status: 'PENDING' } }),
      upcoming,
      activity,
      ops,
    });
  }),
);

/** بث لحظي (Server-Sent Events) للطلبات الجديدة */
dashboardRouter.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const onEvent = (ev: AdminEvent) => res.write(`event: activity\ndata: ${JSON.stringify(ev)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  adminBus.on('event', onEvent);
  req.on('close', () => {
    clearInterval(ping);
    adminBus.off('event', onEvent);
  });
});

/** مؤشرات التوصيل والتحصيل والعقود والعطاءات (اليوم والشهر) */
async function operationsStats(dayStart: Date, dayEnd: Date, monthStart: Date) {
  const period = async (from: Date, to?: Date) => {
    const created = { deletedAt: null, createdAt: { gte: from, ...(to ? { lt: to } : {}) } } as const;
    const [orders, delivered, failed, cancelled, sales, codCollected, codPending, online, fees] = await Promise.all([
      prisma.order.count({ where: created }),
      prisma.order.count({ where: { deletedAt: null, deliveryStatus: { in: ['DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'] }, deliveredAt: { gte: from, ...(to ? { lt: to } : {}) } } }),
      prisma.order.count({ where: { ...created, deliveryStatus: { in: ['DELIVERY_FAILED', 'CUSTOMER_NOT_AVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS'] } } }),
      prisma.order.count({ where: { ...created, status: 'CANCELLED' } }),
      prisma.order.aggregate({ where: { ...created, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { deletedAt: null, codStatus: { in: ['COLLECTED', 'SETTLED'] }, codCollectedAt: { gte: from, ...(to ? { lt: to } : {}) } }, _sum: { codCollected: true } }),
      prisma.order.aggregate({ where: { ...created, paymentMethod: 'COD', status: { not: 'CANCELLED' }, codStatus: 'PENDING' }, _sum: { codAmount: true } }),
      prisma.payment.aggregate({ where: { deletedAt: null, method: { in: ['BANK_TRANSFER', 'CLIQ', 'CARD'] }, paidAt: { gte: from, ...(to ? { lt: to } : {}) } }, _sum: { amount: true } }),
      prisma.order.aggregate({ where: { ...created, status: { not: 'CANCELLED' } }, _sum: { deliveryFee: true } }),
    ]);
    return {
      orders,
      delivered,
      failed,
      cancelled,
      sales: Number(sales._sum.total ?? 0),
      codCollected: Number(codCollected._sum.codCollected ?? 0),
      codPending: Number(codPending._sum.codAmount ?? 0),
      onlinePayments: Number(online._sum.amount ?? 0),
      deliveryFees: Number(fees._sum.deliveryFee ?? 0),
    };
  };
  const [today, month, commissions, activeContracts, expiring, cashPending] = await Promise.all([
    period(dayStart, dayEnd),
    period(monthStart),
    prisma.tender.aggregate({ where: { deletedAt: null, status: 'AWARDED', awardedAt: { gte: monthStart } }, _sum: { commissionAmount: true } }),
    prisma.contract.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.contract.findMany({ where: { deletedAt: null, ...expiringWhere() }, select: { status: true, endDate: true, reminderDays: true } }),
    prisma.order.aggregate({ where: { deletedAt: null, codStatus: 'COLLECTED' }, _sum: { codCollected: true } }),
  ]);
  return {
    today,
    month: { ...month, tenderCommissions: Number(commissions._sum.commissionAmount ?? 0) },
    activeContracts,
    expiringContracts: expiring.filter((c) => contractDisplayStatus(c) === 'EXPIRING_SOON').length,
    /** نقد محصّل لدى السائقين/الشركات لم يُسلَّم بعد */
    cashWithCarriers: Number(cashPending._sum.codCollected ?? 0),
  };
}
