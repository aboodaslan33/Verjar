import { Router } from 'express';
import { adminBus, type AdminEvent } from '../../lib/events';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
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
    ]);

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
      upcoming,
      activity,
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
