import { Router } from 'express';
import { Prisma, type DeliveryStatus } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { nextRef } from '../../lib/refs';
import { ammanToUtc } from '../../lib/time';
import { requirePermission } from '../../middleware/auth';
import {
  ALL_STATUSES,
  BUCKETS,
  DELIVERED_SET,
  DRIVER_ACTIVE,
  FAILURES,
  assignDriver,
  collectPayment,
  createDeliveryOrder,
  liveUpdate,
  refreshFinance,
  transition,
  type Actor,
} from '../../services/delivery.service';
import { notify } from '../../services/notifications.service';
import { deliveryOrderInput, orderDetailInclude } from '../../validators/delivery';
import { optionalDate } from './shared';

/**
 * إدارة التوصيل (Super Admin / Delivery Manager): الطلبات وتوزيعها ومتابعتها،
 * موظفو التوصيل وشركات التوصيل، التحصيل والتسويات، ولوحة الإحصائيات.
 * كل مسار محمي بصلاحيته، وكل تغيير حالة يمر من خدمة التوصيل (سجل + إشعارات).
 */
export const deliveryRouter = Router();

const money = z.coerce.number().min(0, 'المبلغ لا يمكن أن يكون سالبًا').max(1_000_000);
const optStr = (max: number) => z.string().trim().max(max).nullable().optional();
const can = requirePermission;

export const userActor = (req: { auth?: { sub: string; name: string; perms: string[] } }): Extract<Actor, { kind: 'user' }> => ({
  kind: 'user',
  id: req.auth!.sub,
  name: req.auth!.name,
  perms: req.auth!.perms,
});

// ───────────── شركات التوصيل ─────────────

const companyInput = z.object({
  name: z.string().trim().min(2, 'اسم الشركة مطلوب').max(100),
  contactName: optStr(100),
  phone: optStr(30),
  email: z.string().trim().email('بريد غير صالح').max(150).nullable().optional().or(z.literal('')),
  defaultFee: money.default(0),
  active: z.boolean().default(true),
  notes: optStr(2000),
});

deliveryRouter.get(
  '/companies',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.deliveryCompany.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    const cash = await cashSummary('company');
    ok(res, rows.map((r) => ({ ...r, cash: cash.get(r.id) ?? emptyCash() })));
  }),
);

deliveryRouter.post(
  '/companies',
  can('delivery.manage'),
  asyncHandler(async (req, res) => {
    const { defaultFee, email, ...input } = companyInput.parse(req.body);
    const c = await prisma.deliveryCompany.create({ data: { ...input, email: email || null, defaultFee: new Prisma.Decimal(defaultFee) } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'deliveryCompany', entityId: c.id });
    ok(res, c, 201);
  }),
);

deliveryRouter.patch(
  '/companies/:id',
  can('delivery.manage'),
  asyncHandler(async (req, res) => {
    const { defaultFee, email, ...input } = companyInput.partial().parse(req.body);
    const c = await prisma.deliveryCompany.update({
      where: { id: req.params.id },
      data: { ...input, ...(email !== undefined ? { email: email || null } : {}), ...(defaultFee !== undefined ? { defaultFee: new Prisma.Decimal(defaultFee) } : {}) },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'deliveryCompany', entityId: c.id });
    ok(res, c);
  }),
);

// ───────────── موظفو التوصيل ─────────────

const driverInput = z.object({
  name: z.string().trim().min(2, 'اسم السائق مطلوب').max(100),
  phone: z.string().trim().min(5, 'رقم الهاتف مطلوب').max(30),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  areas: optStr(300),
  notes: optStr(2000),
});

deliveryRouter.get(
  '/drivers',
  asyncHandler(async (_req, res) => {
    const [rows, cash, active] = await Promise.all([
      prisma.driver.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }], include: { user: { select: { id: true, username: true, active: true } } } }),
      cashSummary('driver'),
      prisma.order.groupBy({
        by: ['driverId'],
        where: { deletedAt: null, driverId: { not: null }, deliveryStatus: { in: DRIVER_ACTIVE.filter((s) => s !== 'DELIVERED') } },
        _count: { _all: true },
      }),
    ]);
    const act = new Map(active.map((a) => [a.driverId, (a._count as { _all: number })._all]));
    ok(res, rows.map((d) => ({ ...d, activeOrders: act.get(d.id) ?? 0, cash: cash.get(d.id) ?? emptyCash() })));
  }),
);

/** سائق بدون حساب دخول (مثل سائق خارجي) — حسابات موظفي التوصيل تُنشأ من إدارة المستخدمين */
deliveryRouter.post(
  '/drivers',
  can('delivery.manage'),
  asyncHandler(async (req, res) => {
    const input = driverInput.parse(req.body);
    const d = await prisma.driver.create({ data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'driver', entityId: d.id });
    ok(res, d, 201);
  }),
);

deliveryRouter.patch(
  '/drivers/:id',
  can('delivery.manage'),
  asyncHandler(async (req, res) => {
    const input = driverInput.partial().parse(req.body);
    const d = await prisma.driver.update({ where: { id: req.params.id }, data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'driver', entityId: d.id });
    ok(res, d);
  }),
);

deliveryRouter.get(
  '/drivers/:id',
  asyncHandler(async (req, res) => {
    const d = await prisma.driver.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true, username: true, active: true, lastLoginAt: true } } } });
    if (!d) throw notFound('السائق غير موجود');
    const [orders, settlements, cash] = await Promise.all([
      prisma.order.findMany({ where: { driverId: d.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: listSelect }),
      prisma.deliverySettlement.findMany({ where: { driverId: d.id }, orderBy: { receivedAt: 'desc' }, include: { receivedBy: { select: { name: true } } } }),
      cashSummary('driver', d.id),
    ]);
    ok(res, { driver: d, orders, settlements, cash: cash.get(d.id) ?? emptyCash() });
  }),
);

// ───────────── الطلبات ─────────────

export const listSelect = {
  id: true,
  number: true,
  code: true,
  ref: true,
  source: true,
  customerName: true,
  phone: true,
  address: true,
  area: true,
  status: true,
  subtotal: true,
  discountTotal: true,
  total: true,
  paymentMethod: true,
  deliveryStatus: true,
  financialStatus: true,
  deliveryFee: true,
  customerPaysFee: true,
  deliveredAt: true,
  pickedUpAt: true,
  deliveryNote: true,
  notes: true,
  codAmount: true,
  codStatus: true,
  codCollected: true,
  codCollectedAt: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  vendorOrders: { select: { vendor: { select: { id: true, name: true } } } },
  driver: { select: { id: true, name: true, phone: true } },
  deliveryCompany: { select: { id: true, name: true } },
  settlement: { select: { id: true, ref: true, status: true } },
} satisfies Prisma.OrderSelect;

const statusEnum = z.enum(ALL_STATUSES as [DeliveryStatus, ...DeliveryStatus[]]);
const bucketEnum = z.enum(Object.keys(BUCKETS) as [keyof typeof BUCKETS, ...(keyof typeof BUCKETS)[]]);

export const orderFilters = paginationSchema.extend({
  deliveryStatus: statusEnum.optional(),
  bucket: bucketEnum.optional(),
  driverId: z.string().optional(),
  deliveryCompanyId: z.string().optional(),
  supplierId: z.string().optional(),
  area: z.string().trim().max(100).optional(),
  paymentMethod: z.enum(['COD', 'CASH', 'CLIQ', 'BANK_TRANSFER', 'CARD', 'OTHER']).optional(),
  financialStatus: z.enum(['PAID', 'COD', 'PARTIAL_PAYMENT', 'PAYMENT_PENDING', 'COLLECTED', 'NOT_COLLECTED']).optional(),
  codStatus: z.enum(['PENDING', 'COLLECTED', 'SETTLED']).optional(),
  source: z.enum(['STORE', 'SUPPLIER', 'ADMIN']).optional(),
  cod: z.enum(['true']).optional(),
  q: z.string().trim().max(100).optional(),
  from: optionalDate,
  to: optionalDate,
});

/** شروط التصفية المشتركة (القائمة، الإحصائيات، التقارير) */
export function orderWhere(q: z.infer<typeof orderFilters>): Prisma.OrderWhereInput {
  const num = q.q && /^#?\d{1,7}$/.test(q.q) ? Number(q.q.replace('#', '')) : null;
  const phone = q.q ? normalizePhone(q.q) : null;
  const code = q.q && /^fg-ord-\d+$/i.test(q.q) ? q.q.toUpperCase() : null;
  return {
    deletedAt: null,
    ...(q.deliveryStatus ? { deliveryStatus: q.deliveryStatus } : q.bucket ? { deliveryStatus: { in: BUCKETS[q.bucket] } } : {}),
    ...(q.driverId ? { driverId: q.driverId } : {}),
    ...(q.deliveryCompanyId ? { deliveryCompanyId: q.deliveryCompanyId } : {}),
    ...(q.supplierId ? { OR: [{ supplierId: q.supplierId }, { vendorOrders: { some: { vendorId: q.supplierId } } }] } : {}),
    ...(q.area ? { area: { contains: q.area, mode: 'insensitive' } } : {}),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
    ...(q.financialStatus ? { financialStatus: q.financialStatus } : {}),
    ...(q.codStatus ? { codStatus: q.codStatus } : {}),
    ...(q.cod ? { codAmount: { gt: 0 } } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...dateRange(q.from, q.to),
    ...(q.q
      ? {
          AND: [
            {
              OR: [
                { customerName: { contains: q.q, mode: 'insensitive' } },
                ...(num ? [{ number: num }] : []),
                ...(phone ? [{ phone }] : []),
                ...(code ? [{ code }] : []),
              ],
            },
          ],
        }
      : {}),
  };
}

deliveryRouter.get(
  '/orders',
  can('orders.view', 'collections.view'),
  asyncHandler(async (req, res) => {
    const q = orderFilters.parse(req.query);
    const where = orderWhere(q);
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, select: listSelect, ...pageArgs(q) }),
      prisma.order.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/** الموردون للتصفية ونموذج إنشاء الطلب (اسم ومعرّف فقط) */
deliveryRouter.get(
  '/suppliers',
  can('orders.view'),
  asyncHandler(async (_req, res) => {
    ok(res, await prisma.vendor.findMany({ where: { active: true }, orderBy: [{ isHouse: 'desc' }, { name: 'asc' }], select: { id: true, name: true, isHouse: true, pickupAddress: true, phone: true } }));
  }),
);

deliveryRouter.get(
  '/orders/:id',
  can('orders.view', 'collections.view'),
  asyncHandler(async (req, res) => {
    const o = await prisma.order.findFirst({ where: { id: req.params.id, deletedAt: null }, include: orderDetailInclude });
    if (!o) throw notFound('الطلب غير موجود');
    ok(res, o);
  }),
);

/** إنشاء طلب توصيل من الإدارة (باسم مورد) */
deliveryRouter.post(
  '/orders',
  can('orders.manage'),
  asyncHandler(async (req, res) => {
    const input = deliveryOrderInput.extend({ supplierId: z.string().min(1, 'اختر المورد'), driverId: z.string().min(1).nullable().optional() }).parse(req.body);
    const canAmounts = req.auth!.perms.includes('orders.editAmounts');
    const actor = userActor(req);
    const order = await prisma.$transaction(async (tx) => {
      const o = await createDeliveryOrder(tx, input.supplierId, { ...input, deliveryFee: canAmounts ? input.deliveryFee ?? 0 : 0 }, 'ADMIN', actor);
      if (input.driverId && req.auth!.perms.includes('orders.assign')) await assignDriver(tx, o.id, input.driverId, actor);
      return o;
    });
    liveUpdate(order.id, `طلب توصيل جديد ${order.code}`);
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'order', entityId: order.id, meta: { code: order.code, source: 'ADMIN' } });
    ok(res, order, 201);
  }),
);

/** تعديل بيانات التوصيل. المبالغ (أجرة التوصيل، الخصم، من يدفع الأجرة) تتطلب orders.editAmounts */
deliveryRouter.patch(
  '/orders/:id',
  can('orders.manage', 'orders.assign'),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        address: z.string().trim().min(5).max(300).optional(),
        area: optStr(100),
        deliveryLat: z.number().min(-90).max(90).nullable().optional(),
        deliveryLng: z.number().min(-180).max(180).nullable().optional(),
        pickupAddress: optStr(300),
        pickupPhone: optStr(30),
        pickupLat: z.number().min(-90).max(90).nullable().optional(),
        pickupLng: z.number().min(-180).max(180).nullable().optional(),
        deliveryNote: optStr(1000),
        deliveryCompanyId: z.string().min(1).nullable().optional(),
        deliveryFee: money.optional(),
        customerPaysFee: z.boolean().optional(),
      })
      .parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!order) throw notFound('الطلب غير موجود');
    const amounts = input.deliveryFee !== undefined || input.customerPaysFee !== undefined;
    if (amounts && !req.auth!.perms.includes('orders.editAmounts')) throw badRequest('تعديل المبالغ يتطلب صلاحية تعديل المبالغ');
    if (amounts && (order.codStatus === 'COLLECTED' || order.codStatus === 'SETTLED')) throw conflict('تم تحصيل المبلغ، لا يمكن تعديل أجرة التوصيل');
    const details = ['address', 'area', 'deliveryLat', 'deliveryLng', 'pickupAddress', 'pickupPhone', 'pickupLat', 'pickupLng', 'deliveryNote'].some((k) => k in input);
    if (details && !req.auth!.perms.includes('orders.manage')) throw badRequest('تعديل بيانات الطلب يتطلب صلاحية إدارة الطلبات');
    let company = null;
    if (input.deliveryCompanyId) {
      company = await prisma.deliveryCompany.findFirst({ where: { id: input.deliveryCompanyId, active: true } });
      if (!company) throw badRequest('شركة التوصيل غير موجودة أو غير فعّالة');
    }
    const { deliveryFee, ...rest } = input;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...rest,
          ...(deliveryFee !== undefined ? { deliveryFee: new Prisma.Decimal(deliveryFee) } : company && toNum(order.deliveryFee) === 0 ? { deliveryFee: company.defaultFee } : {}),
          ...(input.deliveryCompanyId ? { driverId: null, deliveryStatus: ['NEW', 'ACCEPTED'].includes(order.deliveryStatus) ? 'PICKUP_ASSIGNED' : order.deliveryStatus } : {}),
        },
      });
      const o = await refreshFinance(tx, order.id);
      // موظف التوصيل المسند يُبلَّغ بأي تعديل على الطلب
      if (order.driverId) {
        const d = await tx.driver.findUnique({ where: { id: order.driverId }, select: { userId: true } });
        if (d?.userId) await notify(tx, [{ type: 'USER', userId: d.userId }], { title: `تعديل على الطلب ${order.code}`, body: 'راجع تفاصيل الطلب (العنوان أو المبالغ أو الملاحظات).', orderId: order.id });
      }
      return o;
    });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'update',
      entity: 'order',
      entityId: order.id,
      meta: JSON.parse(JSON.stringify({ ...input, ...(deliveryFee !== undefined ? { deliveryFee: [order.deliveryFee.toString(), deliveryFee] } : {}) })),
    });
    liveUpdate(order.id, `تعديل ${order.code}`);
    ok(res, updated);
  }),
);

deliveryRouter.post(
  '/orders/:id/assign',
  can('orders.assign'),
  asyncHandler(async (req, res) => {
    const { driverId, note } = z.object({ driverId: z.string().min(1).nullable(), note: optStr(300) }).parse(req.body);
    const o = await prisma.$transaction((tx) => assignDriver(tx, req.params.id, driverId, userActor(req), note));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'assign', entity: 'order', entityId: o.id, meta: { driverId } });
    liveUpdate(o.id, `إسناد ${o.code}`);
    ok(res, o);
  }),
);

/** إسناد عدة طلبات دفعة واحدة */
deliveryRouter.post(
  '/orders/assign-bulk',
  can('orders.assign'),
  asyncHandler(async (req, res) => {
    const { orderIds, driverId } = z.object({ orderIds: z.array(z.string().min(1)).min(1).max(100), driverId: z.string().min(1) }).parse(req.body);
    const actor = userActor(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of orderIds) {
      try {
        await prisma.$transaction((tx) => assignDriver(tx, id, driverId, actor));
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : 'خطأ' });
      }
    }
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'assign_bulk', entity: 'order', meta: { driverId, count: results.filter((r) => r.ok).length } });
    liveUpdate(driverId, 'إسناد طلبات');
    ok(res, results);
  }),
);

deliveryRouter.post(
  '/orders/:id/status',
  can('orders.manage'),
  asyncHandler(async (req, res) => {
    const { status, note } = z.object({ status: statusEnum, note: optStr(500) }).parse(req.body);
    const o = await prisma.$transaction((tx) => transition(tx, req.params.id, status, userActor(req), { note }));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'status', entity: 'order', entityId: o.id, meta: { status } });
    liveUpdate(o.id, `${o.code}: ${status}`);
    ok(res, o);
  }),
);

/** تسجيل أو تصحيح التحصيل من الإدارة (قبل التسوية) */
deliveryRouter.post(
  '/orders/:id/collect',
  can('orders.manage'),
  asyncHandler(async (req, res) => {
    const { amount, method } = z.object({ amount: money, method: z.enum(['CASH', 'CLIQ', 'CARD', 'BANK_TRANSFER', 'OTHER']).default('CASH') }).parse(req.body);
    const before = await prisma.order.findUnique({ where: { id: req.params.id }, select: { codCollected: true } });
    const o = await prisma.$transaction((tx) => collectPayment(tx, req.params.id, userActor(req), amount, method));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'collect', entity: 'order', entityId: o.id, meta: { codCollected: [before?.codCollected?.toString() ?? null, amount], method } });
    ok(res, o);
  }),
);

/** تعديل إثبات التسليم — بصلاحية proofs.edit فقط، ويُسجَّل التعديل */
deliveryRouter.patch(
  '/orders/:id/proof',
  can('proofs.edit'),
  asyncHandler(async (req, res) => {
    const input = z.object({ recipientName: z.string().trim().min(2).max(100).optional(), note: optStr(500) }).parse(req.body);
    const proof = await prisma.deliveryProof.findUnique({ where: { orderId: req.params.id } });
    if (!proof) throw notFound('لا يوجد إثبات تسليم لهذا الطلب');
    const updated = await prisma.deliveryProof.update({ where: { id: proof.id }, data: { ...input, editedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'proof_edit', entity: 'order', entityId: req.params.id, meta: { before: { recipientName: proof.recipientName, note: proof.note }, after: input } });
    ok(res, updated);
  }),
);

// ───────────── لوحة الإحصائيات ─────────────

deliveryRouter.get(
  '/stats',
  can('dashboard.view', 'orders.view'),
  asyncHandler(async (req, res) => {
    const q = orderFilters.omit({ deliveryStatus: true, bucket: true }).parse(req.query);
    const where = orderWhere(q);
    const [byStatus, money, drivers] = await Promise.all([
      prisma.order.groupBy({ by: ['deliveryStatus'], where, _count: { _all: true } }),
      prisma.order.aggregate({ where: { ...where, deliveryStatus: { not: 'CANCELLED' }, codAmount: { gt: 0 } }, _sum: { codAmount: true, codCollected: true } }),
      driverPerformance(where),
    ]);
    const count = (list: DeliveryStatus[]) => byStatus.filter((r) => list.includes(r.deliveryStatus)).reduce((n, r) => n + (r._count as { _all: number })._all, 0);
    const collected = round3(toNum(money._sum.codCollected));
    ok(res, {
      total: byStatus.reduce((n, r) => n + (r._count as { _all: number })._all, 0),
      buckets: Object.fromEntries(Object.entries(BUCKETS).map(([k, list]) => [k, count(list)])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.deliveryStatus, (r._count as { _all: number })._all])),
      collected,
      uncollected: round3(Math.max(0, toNum(money._sum.codAmount) - collected)),
      drivers,
    });
  }),
);

/** أداء موظفي التوصيل ضمن نفس التصفية */
export async function driverPerformance(where: Prisma.OrderWhereInput) {
  const scoped = { ...where, driverId: where.driverId ?? { not: null } } as Prisma.OrderWhereInput;
  const [list, rows] = await Promise.all([
    prisma.driver.findMany({ select: { id: true, name: true, status: true, userId: true } }),
    prisma.order.findMany({ where: scoped, select: { driverId: true, deliveryStatus: true, pickedUpAt: true, deliveredAt: true, codCollected: true, deliveryFee: true } }),
  ]);
  const stats = new Map<string, { assigned: number; delivered: number; failed: number; active: number; cancelled: number; collected: number; fees: number; minutes: number[] }>();
  for (const r of rows) {
    if (!r.driverId) continue;
    const s = stats.get(r.driverId) ?? { assigned: 0, delivered: 0, failed: 0, active: 0, cancelled: 0, collected: 0, fees: 0, minutes: [] };
    s.assigned++;
    if (DELIVERED_SET.includes(r.deliveryStatus)) {
      s.delivered++;
      s.fees += toNum(r.deliveryFee);
      if (r.pickedUpAt && r.deliveredAt) s.minutes.push((r.deliveredAt.getTime() - r.pickedUpAt.getTime()) / 60000);
    } else if (FAILURES.includes(r.deliveryStatus) || r.deliveryStatus === 'RESCHEDULED') s.failed++;
    else if (r.deliveryStatus === 'CANCELLED') s.cancelled++;
    else s.active++;
    s.collected += toNum(r.codCollected);
    stats.set(r.driverId, s);
  }
  return list
    .filter((d) => stats.has(d.id) || d.status === 'ACTIVE')
    .map((d) => {
      const s = stats.get(d.id) ?? { assigned: 0, delivered: 0, failed: 0, active: 0, cancelled: 0, collected: 0, fees: 0, minutes: [] };
      const done = s.delivered + s.failed;
      return {
        driverId: d.id,
        name: d.name,
        status: d.status,
        hasAccount: Boolean(d.userId),
        assigned: s.assigned,
        delivered: s.delivered,
        failed: s.failed,
        active: s.active,
        cancelled: s.cancelled,
        successRate: done ? Math.round((s.delivered / done) * 100) : null,
        avgMinutes: s.minutes.length ? Math.round(s.minutes.reduce((a, b) => a + b, 0) / s.minutes.length) : null,
        collected: round3(s.collected),
        fees: round3(s.fees),
      };
    })
    .sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name));
}

// ───────────── النقد والتسويات ─────────────

type Cash = { collected: number; settled: number; pending: number; pendingOrders: number };
const emptyCash = (): Cash => ({ collected: 0, settled: 0, pending: 0, pendingOrders: 0 });

/** المحصّل = طلبات مُسلّمة (محصّلة أو مُسوّاة)، المُسلَّم للشركة = التسويات المؤكدة، المعلّق = محصّل لم يُسوَّ */
export async function cashSummary(kind: 'driver' | 'company', id?: string) {
  const field = kind === 'driver' ? 'driverId' : 'deliveryCompanyId';
  const base = { deletedAt: null, [field]: id ?? { not: null } } as Prisma.OrderWhereInput;
  const [collected, pending, settled] = await Promise.all([
    prisma.order.groupBy({ by: [field], where: { ...base, codStatus: { in: ['COLLECTED', 'SETTLED'] } }, _sum: { codCollected: true } }),
    prisma.order.groupBy({ by: [field], where: { ...base, codStatus: 'COLLECTED' }, _sum: { codCollected: true }, _count: { _all: true } }),
    prisma.deliverySettlement.groupBy({ by: [field], where: { status: 'CONFIRMED', [field]: id ?? { not: null } }, _sum: { amount: true } }),
  ]);
  const map = new Map<string, Cash>();
  const get = (k: string | null) => {
    if (!k) return emptyCash();
    if (!map.has(k)) map.set(k, emptyCash());
    return map.get(k)!;
  };
  for (const r of collected) get(r[field] as string).collected = round3(toNum(r._sum.codCollected));
  for (const r of pending) {
    const c = get(r[field] as string);
    c.pending = round3(toNum(r._sum.codCollected));
    c.pendingOrders = r._count._all;
  }
  for (const r of settled) get(r[field] as string).settled = round3(toNum(r._sum.amount));
  return map;
}

deliveryRouter.get(
  '/settlements',
  can('collections.view'),
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ driverId: z.string().optional(), deliveryCompanyId: z.string().optional(), status: z.enum(['CONFIRMED', 'VOIDED']).optional(), from: optionalDate, to: optionalDate })
      .parse(req.query);
    const where: Prisma.DeliverySettlementWhereInput = {
      ...(q.driverId ? { driverId: q.driverId } : {}),
      ...(q.deliveryCompanyId ? { deliveryCompanyId: q.deliveryCompanyId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { receivedAt: { ...(q.from ? { gte: ammanToUtc(q.from, '00:00') } : {}), ...(q.to ? { lte: ammanToUtc(q.to, '23:59') } : {}) } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.deliverySettlement.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        include: {
          driver: { select: { id: true, name: true } },
          deliveryCompany: { select: { id: true, name: true } },
          receivedBy: { select: { name: true } },
          orders: { select: { id: true, number: true, codCollected: true } },
        },
        ...pageArgs(q),
      }),
      prisma.deliverySettlement.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/**
 * استلام نقد من سائق (أو شركة توصيل): يغطي كل الطلبات المحصّلة غير المُسوّاة، أو المحددة منها.
 * المبلغ يُحسب من المحصّل فعلًا ولا يُكتب يدويًا.
 */
deliveryRouter.post(
  '/settlements',
  can('collections.settle'),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        driverId: z.string().min(1).optional(),
        deliveryCompanyId: z.string().min(1).optional(),
        orderIds: z.array(z.string().min(1)).max(500).optional(),
        expectedAmount: z.coerce.number().min(0).optional(),
        notes: optStr(1000),
      })
      .refine((v) => Boolean(v.driverId) !== Boolean(v.deliveryCompanyId), 'اختر السائق أو شركة التوصيل')
      .parse(req.body);
    const owner = input.driverId ? { driverId: input.driverId } : { deliveryCompanyId: input.deliveryCompanyId! };
    const settlement = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { ...owner, deletedAt: null, codStatus: 'COLLECTED', settlementId: null, ...(input.orderIds ? { id: { in: input.orderIds } } : {}) },
        select: { id: true, codCollected: true },
      });
      if (input.orderIds && orders.length !== new Set(input.orderIds).size) throw conflict('بعض الطلبات المختارة غير محصّلة أو تمت تسويتها');
      const amount = round3(orders.reduce((n, o) => n + toNum(o.codCollected), 0));
      if (!orders.length || amount <= 0) throw badRequest('لا يوجد نقد معلّق للتسوية');
      if (input.expectedAmount !== undefined && Math.abs(input.expectedAmount - amount) > 0.0005) {
        throw conflict('تغيّر المبلغ المعلّق. حدّث الصفحة وراجع المبلغ قبل التسوية.');
      }
      const s = await tx.deliverySettlement.create({
        data: { ref: await nextRef(tx, 'SET'), ...owner, amount: new Prisma.Decimal(amount), ordersCount: orders.length, notes: input.notes ?? null, receivedById: req.auth!.sub },
      });
      const linked = await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, codStatus: 'COLLECTED', settlementId: null },
        data: { settlementId: s.id, codStatus: 'SETTLED' },
      });
      if (linked.count !== orders.length) throw conflict('تغيّرت الطلبات أثناء التسوية، حاول مرة أخرى');
      return s;
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'settle', entity: 'settlement', entityId: settlement.id, meta: { ref: settlement.ref, amount: toNum(settlement.amount), ...owner } });
    ok(res, settlement, 201);
  }),
);

/** إلغاء تسوية (لا حذف): تبقى في السجل، وتعود طلباتها "محصّلة" بانتظار تسوية جديدة */
deliveryRouter.post(
  '/settlements/:id/void',
  can('collections.settle'),
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'اكتب سبب الإلغاء').max(500) }).parse(req.body);
    const s = await prisma.$transaction(async (tx) => {
      const current = await tx.deliverySettlement.findUnique({ where: { id: req.params.id } });
      if (!current) throw notFound('التسوية غير موجودة');
      if (current.status === 'VOIDED') throw conflict('التسوية ملغاة مسبقًا');
      await tx.order.updateMany({ where: { settlementId: current.id }, data: { settlementId: null, codStatus: 'COLLECTED' } });
      return tx.deliverySettlement.update({ where: { id: current.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason } });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'void', entity: 'settlement', entityId: s.id, meta: { reason } });
    ok(res, s);
  }),
);

export function dateRange(from?: string, to?: string, field: 'createdAt' = 'createdAt'): Prisma.OrderWhereInput {
  if (!from && !to) return {};
  return { [field]: { ...(from ? { gte: ammanToUtc(from, '00:00') } : {}), ...(to ? { lte: ammanToUtc(to, '23:59') } : {}) } };
}
