import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok } from '../lib/http';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { recipientsOf } from '../services/notifications.service';

/** إشعارات صاحب الجلسة (إدارة، توصيل، عميل، مورد) */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const who = await recipientsOf(req.auth!);
    const where = { OR: who.map((w) => ({ recipientType: w.recipientType, recipientId: w.recipientId })) };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, body: true, orderId: true, link: true, readAt: true, createdAt: true, recipientType: true } }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    ok(res, { items, unread });
  }),
);

notificationsRouter.post(
  '/read',
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).parse(req.body ?? {});
    const who = await recipientsOf(req.auth!);
    const r = await prisma.notification.updateMany({
      where: { OR: who.map((w) => ({ recipientType: w.recipientType, recipientId: w.recipientId })), readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    ok(res, { updated: r.count });
  }),
);
