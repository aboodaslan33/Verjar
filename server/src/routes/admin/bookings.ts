import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { BOOKING_TYPE_AR } from '../../lib/labels';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { ammanParts, ammanToUtc } from '../../lib/time';
import { statusMessage } from '../../services/messages';
import { assertSlotAvailable, bookingFee, getDaySlots } from '../../services/schedule.service';
import { getSettings } from '../../services/settings.service';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
import { dateField, timeField } from '../../validators/common';
import { moneyInput, optionalDate, statusEnum } from './shared';

export const bookingsAdminRouter = Router();

const typeEnum = z.enum(['INSPECTION', 'PAINTING', 'CONSTRUCTION', 'METALWORK', 'GENERAL']);

bookingsAdminRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        status: statusEnum.optional(),
        type: typeEnum.optional(),
        q: z.string().trim().optional(),
        from: optionalDate,
        to: optionalDate,
        technicianId: z.string().optional(),
        urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).optional(),
      })
      .parse(req.query);
    const phone = q.q ? normalizePhone(q.q) : null;
    const num = q.q && /^#?\d{1,7}$/.test(q.q) ? Number(q.q.replace('#', '')) : null;
    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.urgency ? { urgency: q.urgency } : {}),
      ...(q.technicianId ? { technicianId: q.technicianId } : {}),
      ...(q.from || q.to
        ? {
            scheduledAt: {
              ...(q.from ? { gte: ammanToUtc(q.from, '00:00') } : {}),
              ...(q.to ? { lte: ammanToUtc(q.to, '23:59') } : {}),
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { locationText: { contains: q.q, mode: 'insensitive' } },
              { ref: { equals: q.q.toUpperCase() } },
              ...(phone ? [{ phone }] : []),
              ...(num ? [{ number: num }] : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        include: { technician: { select: { id: true, name: true } }, _count: { select: { media: true } } },
        ...pageArgs(q),
      }),
      prisma.booking.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/** حجوزات شهر كامل للتقويم */
bookingsAdminRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة الشهر YYYY-MM') }).parse(req.query);
    const [y, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const items = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: ammanToUtc(`${month}-01`, '00:00'), lt: ammanToUtc(`${next}-01`, '00:00') },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        name: true,
        scheduledAt: true,
        urgency: true,
        locationText: true,
        technician: { select: { name: true } },
      },
    });
    ok(res, items.map((b) => ({ ...b, localDate: ammanParts(b.scheduledAt).date, localTime: ammanParts(b.scheduledAt).time })));
  }),
);

bookingsAdminRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { date, exclude } = z.object({ date: dateField, exclude: z.string().optional() }).parse(req.query);
    ok(res, await getDaySlots(date, exclude));
  }),
);

bookingsAdminRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = await prisma.booking.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        media: { orderBy: { createdAt: 'asc' } },
        technician: true,
        customer: { select: { id: true, name: true, phone: true } },
        quoteFiles: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
      },
    });
    if (!b) throw notFound('الحجز غير موجود');
    const whatsappLogs = await prisma.whatsAppLog.findMany({
      where: { entityType: 'booking', entityId: b.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    ok(res, { ...b, localDate: ammanParts(b.scheduledAt).date, localTime: ammanParts(b.scheduledAt).time, whatsappLogs });
  }),
);

bookingsAdminRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        status: statusEnum.optional(),
        technicianId: z.string().nullable().optional(),
        date: dateField.optional(),
        time: timeField.optional(),
        /** تجاوز ساعات العمل عند إعادة الجدولة من الأدمن (يبقى شرط الفارق بين المواعيد) */
        overrideHours: z.boolean().default(false),
        quotedAmount: moneyInput.nullable().optional(),
        adminNotes: z.string().max(3000).nullable().optional(),
        urgency: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).optional(),
        notify: z.boolean().default(true),
      })
      .parse(req.body);
    if ((input.date && !input.time) || (!input.date && input.time)) throw badRequest('حدد التاريخ والوقت معًا');

    const current = await prisma.booking.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('الحجز غير موجود');
    if (input.technicianId) {
      const t = await prisma.technician.findFirst({ where: { id: input.technicianId, active: true } });
      if (!t) throw badRequest('الفني غير موجود');
    }

    const booking = await prisma.$transaction(async (tx) => {
      let scheduledAt: Date | undefined;
      if (input.date && input.time) {
        scheduledAt = await assertSlotAvailable(tx, input.date, input.time, {
          excludeBookingId: current.id,
          skipHoursCheck: input.overrideHours,
        });
      }
      return tx.booking.update({
        where: { id: current.id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.technicianId !== undefined ? { technicianId: input.technicianId } : {}),
          ...(scheduledAt ? { scheduledAt } : {}),
          ...(input.quotedAmount !== undefined
            ? { quotedAmount: input.quotedAmount === null ? null : new Prisma.Decimal(input.quotedAmount) }
            : {}),
          ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
          ...(input.urgency ? { urgency: input.urgency } : {}),
          // تغيير أولوية الكشف الفني يعيد حساب رسومه (تدخل في المالية وصفحة العميل)
          ...(input.urgency && input.urgency !== current.urgency && current.type === 'INSPECTION'
            ? { inspectionFee: new Prisma.Decimal(bookingFee(await getSettings(), { type: 'INSPECTION', urgency: input.urgency }) ?? 0) }
            : {}),
        },
        include: { technician: true },
      });
    });

    let whatsapp = null;
    const statusChanged = input.status && input.status !== current.status;
    const rescheduled = booking.scheduledAt.getTime() !== current.scheduledAt.getTime();
    if (statusChanged || rescheduled) {
      emitAdmin({ type: 'status.changed', id: booking.id, title: `حجز #${booking.number}` });
      if (input.notify) {
        let text = statusChanged
          ? statusMessage('حجزك', booking.number, booking.status, booking.name)
          : `مرحبًا ${booking.name}،\nتم تعديل موعد حجزك رقم #${booking.number}.`;
        if (rescheduled) {
          const p = ammanParts(booking.scheduledAt);
          text += `\nالموعد الجديد: ${p.date} الساعة ${p.time}`;
        }
        const wa = await notifyCustomer(booking.phone, text, { entityType: 'booking', entityId: booking.id });
        whatsapp = { link: wa.link, sent: wa.sent };
      }
    }
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'update',
      entity: 'booking',
      entityId: booking.id,
      meta: JSON.parse(JSON.stringify({ ...input, notify: undefined })),
    });
    ok(res, { booking, whatsapp });
  }),
);

bookingsAdminRouter.post(
  '/:id/whatsapp',
  asyncHandler(async (req, res) => {
    const { to } = z.object({ to: z.enum(['admin', 'customer']).default('admin') }).parse(req.body ?? {});
    const b = await prisma.booking.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!b) throw notFound('الحجز غير موجود');
    const opts = { entityType: 'booking', entityId: b.id };
    const wa = to === 'admin' ? await notifyAdmin(b.whatsappText, opts) : await notifyCustomer(b.phone, b.whatsappText, opts);
    ok(res, { link: wa.link, sent: wa.sent });
  }),
);

bookingsAdminRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = await prisma.booking.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'booking', entityId: b.id, meta: { type: BOOKING_TYPE_AR[b.type] } });
    ok(res, { deleted: true });
  }),
);

// ───────────── الفنيون ─────────────

const techInput = z.object({
  name: z.string().trim().min(2, 'اسم الفني مطلوب').max(100),
  phone: z.string().trim().min(7, 'رقم الهاتف مطلوب').max(20),
  specialty: z.string().trim().max(100).optional().nullable(),
  active: z.boolean().default(true),
});

export const techniciansRouter = Router();

techniciansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const techs = await prisma.technician.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { bookings: { where: { deletedAt: null, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } } } },
      },
    });
    ok(res, techs.map(({ _count, ...t }) => ({ ...t, activeBookings: _count.bookings })));
  }),
);

techniciansRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = techInput.parse(req.body);
    const t = await prisma.technician.create({ data: input });
    ok(res, t, 201);
  }),
);

techniciansRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = techInput.partial().parse(req.body);
    ok(res, await prisma.technician.update({ where: { id: req.params.id }, data: input }));
  }),
);
