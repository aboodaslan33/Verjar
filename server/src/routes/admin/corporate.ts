import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { statusMessage } from '../../services/messages';
import { getSettings } from '../../services/settings.service';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
import { moneyInput, statusEnum } from './shared';

export const corporateAdminRouter = Router();

corporateAdminRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ status: statusEnum.optional(), type: z.enum(['ANNUAL', 'URGENT']).optional(), q: z.string().trim().optional() })
      .parse(req.query);
    const where: Prisma.CorporateRequestWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.q
        ? {
            OR: [
              { companyName: { contains: q.q, mode: 'insensitive' } },
              { contactName: { contains: q.q, mode: 'insensitive' } },
              { ref: { equals: q.q.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.corporateRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { services: { select: { name: true } }, _count: { select: { contracts: true } } },
        ...pageArgs(q),
      }),
      prisma.corporateRequest.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

corporateAdminRouter.get(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.corporateRequest.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        services: true,
        customer: { select: { id: true, name: true, phone: true, companyName: true } },
        contracts: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        quoteFiles: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!r) throw notFound('الطلب غير موجود');
    ok(res, r);
  }),
);

corporateAdminRouter.patch(
  '/requests/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        status: statusEnum.optional(),
        adminNotes: z.string().max(3000).nullable().optional(),
        quotedAmount: moneyInput.nullable().optional(),
        notify: z.boolean().default(true),
      })
      .parse(req.body);
    const current = await prisma.corporateRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('الطلب غير موجود');
    const r = await prisma.corporateRequest.update({
      where: { id: current.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
        ...(input.quotedAmount !== undefined
          ? { quotedAmount: input.quotedAmount === null ? null : new Prisma.Decimal(input.quotedAmount) }
          : {}),
      },
    });
    let whatsapp = null;
    if (input.status && input.status !== current.status) {
      emitAdmin({ type: 'status.changed', id: r.id, title: `طلب شركة #${r.number}` });
      if (input.notify) {
        const wa = await notifyCustomer(r.managerPhone, statusMessage('طلب شركتكم', r.number, input.status, r.contactName), {
          entityType: 'corporate',
          entityId: r.id,
        });
        whatsapp = { link: wa.link, sent: wa.sent };
      }
    }
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'corporate', entityId: r.id });
    ok(res, { request: r, whatsapp });
  }),
);

corporateAdminRouter.post(
  '/requests/:id/whatsapp',
  asyncHandler(async (req, res) => {
    const r = await prisma.corporateRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!r) throw notFound('الطلب غير موجود');
    const wa = await notifyAdmin(r.whatsappText, { entityType: 'corporate', entityId: r.id });
    ok(res, { link: wa.link, sent: wa.sent });
  }),
);

/** تحويل طلب الشركة إلى عقد نشط */
corporateAdminRouter.post(
  '/requests/:id/contract',
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const input = z
      .object({
        title: z.string().trim().min(2, 'عنوان العقد مطلوب').max(150),
        startDate: z.coerce.date({ invalid_type_error: 'تاريخ البداية غير صحيح' }),
        endDate: z.coerce.date({ invalid_type_error: 'تاريخ النهاية غير صحيح' }),
        value: moneyInput,
        reminderDays: z.coerce.number().int().min(1).max(180).default(s.contractReminderDays),
        notes: z.string().max(3000).optional().nullable(),
      })
      .parse(req.body);
    if (input.endDate <= input.startDate) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const r = await prisma.corporateRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!r) throw notFound('الطلب غير موجود');
    const contract = await prisma.$transaction(async (tx) => {
      const c = await tx.contract.create({
        data: {
          corporateRequestId: r.id,
          customerId: r.customerId,
          title: input.title,
          startDate: input.startDate,
          endDate: input.endDate,
          value: new Prisma.Decimal(input.value),
          reminderDays: input.reminderDays,
          notes: input.notes ?? null,
          status: input.endDate < new Date() ? 'EXPIRED' : 'ACTIVE',
        },
      });
      await tx.corporateRequest.update({ where: { id: r.id }, data: { status: 'CONFIRMED' } });
      return c;
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'contract', entityId: contract.id });
    ok(res, contract, 201);
  }),
);

// ───────────── العقود ─────────────

corporateAdminRouter.get(
  '/contracts',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(), expiring: z.enum(['true']).optional() })
      .parse(req.query);
    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.expiring ? { status: 'ACTIVE', endDate: { gte: new Date(), lte: new Date(Date.now() + 60 * 86400_000) } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        orderBy: { endDate: 'asc' },
        include: {
          customer: { select: { id: true, name: true, phone: true, companyName: true } },
          corporateRequest: { select: { id: true, number: true, companyName: true } },
        },
        ...pageArgs(q),
      }),
      prisma.contract.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

corporateAdminRouter.patch(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(2).max(150).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        value: moneyInput.optional(),
        status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
        reminderDays: z.coerce.number().int().min(1).max(180).optional(),
        notes: z.string().max(3000).nullable().optional(),
      })
      .parse(req.body);
    const current = await prisma.contract.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('العقد غير موجود');
    const start = input.startDate ?? current.startDate;
    const end = input.endDate ?? current.endDate;
    if (end <= start) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const c = await prisma.contract.update({
      where: { id: current.id },
      data: {
        ...input,
        ...(input.value !== undefined ? { value: new Prisma.Decimal(input.value) } : {}),
        // تغيير تاريخ النهاية يعيد تفعيل التذكير
        ...(input.endDate || input.reminderDays ? { reminderSentAt: null } : {}),
      },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'contract', entityId: c.id });
    ok(res, c);
  }),
);

corporateAdminRouter.delete(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    await prisma.contract.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'contract', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

corporateAdminRouter.get(
  '/services',
  asyncHandler(async (_req, res) => {
    ok(res, await prisma.corporateService.findMany({ orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }));
  }),
);
