import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, notFound, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { statusMessage } from '../../services/messages';
import { setVendorOrderStatus, syncOrderStatus } from '../../services/vendor.service';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
import { optionalDate, statusEnum } from './shared';

export const ordersRouter = Router();

ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ status: statusEnum.optional(), q: z.string().trim().optional(), from: optionalDate, to: optionalDate })
      .parse(req.query);
    const phone = q.q ? normalizePhone(q.q) : null;
    const num = q.q && /^\d{1,7}$/.test(q.q.replace('#', '')) ? Number(q.q.replace('#', '')) : null;
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: ammanToUtc(q.from, '00:00') } : {}),
              ...(q.to ? { lte: ammanToUtc(q.to, '23:59') } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { customerName: { contains: q.q, mode: 'insensitive' } },
              { ref: { equals: q.q.toUpperCase() } },
              ...(phone ? [{ phone }] : []),
              ...(num ? [{ number: num }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { items: true } },
          vendorOrders: { select: { id: true, number: true, status: true, vendor: { select: { id: true, name: true } } } },
        },
        ...pageArgs(q),
      }),
      prisma.order.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        items: { include: { product: { select: { slug: true, media: { take: 1, orderBy: { sortOrder: 'asc' } } } } } },
        vendorOrders: {
          orderBy: { number: 'asc' },
          include: {
            vendor: { select: { id: true, name: true, slug: true, isHouse: true } },
            payout: { select: { id: true, paidAt: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
        driver: { select: { id: true, name: true, phone: true } },
        deliveryCompany: { select: { id: true, name: true } },
        settlement: { select: { id: true, ref: true, status: true } },
      },
    });
    if (!order) throw notFound('الطلب غير موجود');
    const whatsappLogs = await prisma.whatsAppLog.findMany({
      where: { entityType: 'order', entityId: order.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    ok(res, { ...order, whatsappLogs });
  }),
);

ordersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({ status: statusEnum.optional(), notify: z.boolean().default(true) })
      .parse(req.body);
    const current = await prisma.order.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { vendorOrders: { include: { items: true } } },
    });
    if (!current) throw notFound('الطلب غير موجود');

    // حالة الطلب تُطبَّق على كل طلباته الفرعية (المخزون يرجع عند الإلغاء ويُخصم عند التراجع عنه)
    const order = await prisma.$transaction(async (tx) => {
      if (input.status && input.status !== current.status) {
        for (const vo of current.vendorOrders) await setVendorOrderStatus(tx, vo, input.status);
      }
      return tx.order.update({ where: { id: current.id }, data: { ...(input.status ? { status: input.status } : {}) } });
    });

    let whatsapp = null;
    if (input.status && input.status !== current.status) {
      emitAdmin({ type: 'status.changed', id: order.id, title: `طلب #${order.number}` });
      if (input.notify) {
        const wa = await notifyCustomer(order.phone, statusMessage('طلبك', order.number, input.status, order.customerName), {
          entityType: 'order',
          entityId: order.id,
        });
        whatsapp = { link: wa.link, sent: wa.sent };
      }
    }
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'order', entityId: order.id, meta: { status: input.status ?? null } });
    ok(res, { order, whatsapp });
  }),
);

/** تغيير حالة طلب فرعي واحد (مورد واحد) — حالة الطلب الرئيسي تُشتق من طلباته الفرعية */
ordersRouter.patch(
  '/:id/vendor-orders/:voId',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: statusEnum }).parse(req.body);
    const vo = await prisma.vendorOrder.findFirst({
      where: { id: req.params.voId, orderId: req.params.id, order: { deletedAt: null } },
      include: { items: true },
    });
    if (!vo) throw notFound('الطلب الفرعي غير موجود');
    const result = await prisma.$transaction(async (tx) => {
      const updated = await setVendorOrderStatus(tx, vo, status);
      const synced = await syncOrderStatus(tx, vo.orderId);
      return { vendorOrder: updated, order: synced.order };
    });
    emitAdmin({ type: 'status.changed', id: vo.orderId, title: `طلب فرعي #${vo.number}` });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'vendorOrder', entityId: vo.id, meta: { status } });
    ok(res, result);
  }),
);

/** إعادة إرسال رسالة الطلب عبر واتساب للإدارة أو العميل */
ordersRouter.post(
  '/:id/whatsapp',
  asyncHandler(async (req, res) => {
    const { to } = z.object({ to: z.enum(['admin', 'customer']).default('admin') }).parse(req.body ?? {});
    const order = await prisma.order.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!order) throw notFound('الطلب غير موجود');
    const opts = { entityType: 'order', entityId: order.id };
    const wa = to === 'admin' ? await notifyAdmin(order.whatsappText, opts) : await notifyCustomer(order.phone, order.whatsappText, opts);
    ok(res, { link: wa.link, sent: wa.sent });
  }),
);

ordersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.order.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'order', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);
