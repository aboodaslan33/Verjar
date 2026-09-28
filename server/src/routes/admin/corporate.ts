import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { nextRef } from '../../lib/refs';
import { checkContractRefs, contractFieldsSchema, contractTotals, expiringWhere, withContractSummary } from '../../services/contracts.service';
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
        /** ربط الطلب بعقد الشركة (طلب صيانة ضمن العقد) */
        contractId: z.string().min(1).nullable().optional(),
        notify: z.boolean().default(true),
      })
      .parse(req.body);
    const current = await prisma.corporateRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('الطلب غير موجود');
    if (input.contractId) {
      const k = await prisma.contract.findFirst({ where: { id: input.contractId, deletedAt: null, customerId: current.customerId } });
      if (!k) throw badRequest('العقد غير موجود أو لا يخص هذه الشركة');
    }
    const r = await prisma.corporateRequest.update({
      where: { id: current.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
        ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
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
      .merge(contractFieldsSchema.pick({ paymentMethod: true, visitsIncluded: true, responseHours: true, technicianId: true, terms: true }).partial())
      .parse(req.body);
    if (input.endDate <= input.startDate) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    await checkContractRefs(input);
    const r = await prisma.corporateRequest.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { services: { select: { id: true } } } });
    if (!r) throw notFound('الطلب غير موجود');
    const contract = await prisma.$transaction(async (tx) => {
      const c = await tx.contract.create({
        data: {
          ref: await nextRef(tx, 'MC'),
          type: r.type === 'ANNUAL' ? 'ANNUAL_CORPORATE' : 'MAINTENANCE',
          paymentMethod: input.paymentMethod ?? null,
          visitsIncluded: input.visitsIncluded ?? null,
          responseHours: input.responseHours ?? null,
          technicianId: input.technicianId ?? null,
          terms: input.terms ?? null,
          services: { connect: r.services.map((x) => ({ id: x.id })) },
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

const contractListInclude = {
  customer: { select: { id: true, name: true, phone: true, companyName: true } },
  corporateRequest: { select: { id: true, number: true, companyName: true } },
  services: { select: { id: true, key: true, name: true } },
  technician: { select: { id: true, name: true } },
} satisfies Prisma.ContractInclude;

corporateAdminRouter.get(
  '/contracts',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'EXPIRING_SOON']).optional(),
        expiring: z.enum(['true']).optional(),
        type: z.enum(['MAINTENANCE', 'ANNUAL_CORPORATE']).optional(),
        serviceKey: z.string().max(60).optional(),
        customerId: z.string().optional(),
        q: z.string().trim().max(100).optional(),
      })
      .parse(req.query);
    const expiring = q.status === 'EXPIRING_SOON';
    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
      ...(q.status && q.status !== 'EXPIRING_SOON' ? { status: q.status } : {}),
      ...(expiring ? expiringWhere() : {}),
      // السلوك الحالي لفلتر expiring=true (60 يومًا) يبقى كما هو
      ...(q.expiring ? { status: 'ACTIVE', endDate: { gte: new Date(), lte: new Date(Date.now() + 60 * 86400_000) } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.serviceKey ? { services: { some: { key: { startsWith: q.serviceKey } } } } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { ref: { contains: q.q.toUpperCase() } },
              { customer: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { companyName: { contains: q.q, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.contract.findMany({ where, orderBy: { endDate: 'asc' }, include: contractListInclude, ...(expiring ? {} : pageArgs(q)) }),
      prisma.contract.count({ where }),
    ]);
    const totals = await contractTotals(rows.map((c) => c.id));
    let items = rows.map((c) => withContractSummary(c, totals.get(c.id)));
    // "قارب على الانتهاء" يُحسب بأيام التذكير الخاصة بكل عقد
    if (expiring) items = items.filter((c) => c.displayStatus === 'EXPIRING_SOON');
    ok(res, expiring ? paged(items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), items.length, q) : paged(items, total, q));
  }),
);

/** عقد صيانة جديد مباشرة (بدون طلب شركة) */
corporateAdminRouter.post(
  '/contracts',
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const input = contractFieldsSchema
      .partial({ paymentMethod: true, serviceIds: true, visitsIncluded: true, responseHours: true, technicianId: true, terms: true, renewalStatus: true, notes: true, status: true })
      .extend({ customerId: z.string().min(1, 'اختر العميل'), reminderDays: z.coerce.number().int().min(1).max(180).default(s.contractReminderDays) })
      .parse(req.body);
    if (input.endDate <= input.startDate) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    await checkContractRefs(input);
    if (!(await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } }))) throw notFound('العميل غير موجود');
    const { serviceIds, value, status, ...rest } = input;
    const contract = await prisma.$transaction(async (tx) =>
      tx.contract.create({
        data: {
          ...rest,
          ref: await nextRef(tx, 'MC'),
          value: new Prisma.Decimal(value),
          status: status ?? (input.endDate < new Date() ? 'EXPIRED' : 'ACTIVE'),
          ...(serviceIds?.length ? { services: { connect: serviceIds.map((id) => ({ id })) } } : {}),
        },
        include: contractListInclude,
      }),
    );
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'contract', entityId: contract.id, meta: { ref: contract.ref } });
    ok(res, withContractSummary(contract, undefined), 201);
  }),
);

/** العقد مع كل ما يرتبط به: الطلبات، الزيارات، الفواتير، الدفعات، الملفات، والسجل */
corporateAdminRouter.get(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.contract.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...contractListInclude,
        requests: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, type: true, status: true, createdAt: true } },
        visits: { orderBy: { scheduledAt: 'desc' }, include: { technician: { select: { id: true, name: true } } } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
        quoteFiles: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        tender: { select: { id: true, ref: true, title: true } },
      },
    });
    if (!c) throw notFound('العقد غير موجود');
    const [totals, history] = await Promise.all([
      contractTotals([c.id]),
      prisma.auditLog.findMany({
        where: { entity: { in: ['contract', 'contractVisit'] }, OR: [{ entityId: c.id }, { entityId: { in: c.visits.map((v) => v.id) } }] },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { name: true } } },
      }),
    ]);
    ok(res, {
      ...withContractSummary(c, totals.get(c.id)),
      invoices: c.quoteFiles.filter((f) => f.kind === 'INVOICE'),
      history,
    });
  }),
);

corporateAdminRouter.patch(
  '/contracts/:id',
  asyncHandler(async (req, res) => {
    const input = contractFieldsSchema.partial().parse(req.body);
    const current = await prisma.contract.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('العقد غير موجود');
    const start = input.startDate ?? current.startDate;
    const end = input.endDate ?? current.endDate;
    if (end <= start) throw badRequest('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    await checkContractRefs(input);
    const { serviceIds, value, ...rest } = input;
    const c = await prisma.contract.update({
      where: { id: current.id },
      data: {
        ...rest,
        ...(value !== undefined ? { value: new Prisma.Decimal(value) } : {}),
        ...(serviceIds ? { services: { set: serviceIds.map((id) => ({ id })) } } : {}),
        // تغيير تاريخ النهاية يعيد تفعيل التذكير
        ...(input.endDate || input.reminderDays ? { reminderSentAt: null } : {}),
      },
    });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'update',
      entity: 'contract',
      entityId: c.id,
      meta: JSON.parse(JSON.stringify({ changes: Object.keys(input), ...(input.status && input.status !== current.status ? { status: [current.status, input.status] } : {}) })),
    });
    ok(res, c);
  }),
);

// ───────────── زيارات العقد ─────────────

const visitInput = z.object({
  scheduledAt: z.coerce.date({ invalid_type_error: 'موعد الزيارة غير صحيح' }),
  technicianId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

corporateAdminRouter.post(
  '/contracts/:id/visits',
  asyncHandler(async (req, res) => {
    const input = visitInput.parse(req.body);
    const c = await prisma.contract.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!c) throw notFound('العقد غير موجود');
    await checkContractRefs(input);
    const v = await prisma.contractVisit.create({ data: { contractId: c.id, scheduledAt: input.scheduledAt, technicianId: input.technicianId ?? c.technicianId, notes: input.notes ?? null } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'contractVisit', entityId: v.id, meta: { contractId: c.id } });
    ok(res, v, 201);
  }),
);

corporateAdminRouter.patch(
  '/contracts/visits/:visitId',
  asyncHandler(async (req, res) => {
    const input = visitInput.partial().extend({ status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED']).optional() }).parse(req.body);
    const current = await prisma.contractVisit.findUnique({ where: { id: req.params.visitId } });
    if (!current) throw notFound('الزيارة غير موجودة');
    await checkContractRefs(input);
    const v = await prisma.contractVisit.update({
      where: { id: current.id },
      data: {
        ...input,
        ...(input.status === 'COMPLETED' && current.status !== 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(input.status && input.status !== 'COMPLETED' ? { completedAt: null } : {}),
      },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'contractVisit', entityId: v.id, meta: { status: input.status ?? null } });
    ok(res, v);
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
