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
import { setVendorOrderStatus, syncOrderStatus } from '../../services/vendor.service';
import { optionalDate } from './shared';

/**
 * التوصيل والتحصيل: شركات التوصيل، السائقون، إسناد الطلبات وحالة التوصيل،
 * النقد المحصّل عند الاستلام، وتسويات النقد مع السائقين وشركات التوصيل.
 * حالة الطلب الموحّدة (RequestStatus) لا تُستبدل؛ التسليم فقط يكمل الطلب عبر المسار الحالي.
 */
export const deliveryRouter = Router();

const money = z.coerce.number().min(0, 'المبلغ لا يمكن أن يكون سالبًا').max(1_000_000);
const optStr = (max: number) => z.string().trim().max(max).nullable().optional();

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
  asyncHandler(async (req, res) => {
    const { defaultFee, email, ...input } = companyInput.parse(req.body);
    const c = await prisma.deliveryCompany.create({ data: { ...input, email: email || null, defaultFee: new Prisma.Decimal(defaultFee) } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'deliveryCompany', entityId: c.id });
    ok(res, c, 201);
  }),
);

deliveryRouter.patch(
  '/companies/:id',
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

// ───────────── السائقون ─────────────

const driverInput = z.object({
  name: z.string().trim().min(2, 'اسم السائق مطلوب').max(100),
  phone: z.string().trim().min(5, 'رقم الهاتف مطلوب').max(30),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  notes: optStr(2000),
});

deliveryRouter.get(
  '/drivers',
  asyncHandler(async (_req, res) => {
    const [rows, cash, active] = await Promise.all([
      prisma.driver.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
      cashSummary('driver'),
      prisma.order.groupBy({
        by: ['driverId'],
        where: { deletedAt: null, driverId: { not: null }, deliveryStatus: { in: ['ASSIGNED', 'PREPARING', 'OUT_FOR_DELIVERY'] } },
        _count: { _all: true },
      }),
    ]);
    const act = new Map(active.map((a) => [a.driverId, a._count._all]));
    ok(res, rows.map((d) => ({ ...d, activeOrders: act.get(d.id) ?? 0, cash: cash.get(d.id) ?? emptyCash() })));
  }),
);

deliveryRouter.post(
  '/drivers',
  asyncHandler(async (req, res) => {
    const input = driverInput.parse(req.body);
    const d = await prisma.driver.create({ data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'driver', entityId: d.id });
    ok(res, d, 201);
  }),
);

deliveryRouter.patch(
  '/drivers/:id',
  asyncHandler(async (req, res) => {
    const input = driverInput.partial().parse(req.body);
    const d = await prisma.driver.update({ where: { id: req.params.id }, data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'driver', entityId: d.id });
    ok(res, d);
  }),
);

/** السائق: الطلبات المسندة، النقد (محصّل، مُسلَّم، معلّق)، والتسويات */
deliveryRouter.get(
  '/drivers/:id',
  asyncHandler(async (req, res) => {
    const d = await prisma.driver.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('السائق غير موجود');
    const [orders, settlements, cash] = await Promise.all([
      prisma.order.findMany({ where: { driverId: d.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: deliveryOrderSelect }),
      prisma.deliverySettlement.findMany({ where: { driverId: d.id }, orderBy: { receivedAt: 'desc' }, include: { receivedBy: { select: { name: true } } } }),
      cashSummary('driver', d.id),
    ]);
    ok(res, { driver: d, orders, settlements, cash: cash.get(d.id) ?? emptyCash() });
  }),
);

// ───────────── إسناد الطلبات وحالة التوصيل ─────────────

const deliveryOrderSelect = {
  id: true,
  number: true,
  ref: true,
  customerName: true,
  phone: true,
  address: true,
  status: true,
  total: true,
  paymentMethod: true,
  deliveryStatus: true,
  deliveryFee: true,
  deliveredAt: true,
  deliveryNote: true,
  codAmount: true,
  codStatus: true,
  codCollected: true,
  codCollectedAt: true,
  createdAt: true,
  driver: { select: { id: true, name: true, phone: true } },
  deliveryCompany: { select: { id: true, name: true } },
  settlement: { select: { id: true, ref: true, status: true } },
} satisfies Prisma.OrderSelect;

const deliveryStatusEnum = z.enum(['PENDING', 'ASSIGNED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED']);

deliveryRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        deliveryStatus: deliveryStatusEnum.optional(),
        driverId: z.string().optional(),
        deliveryCompanyId: z.string().optional(),
        cod: z.enum(['true']).optional(),
        codStatus: z.enum(['PENDING', 'COLLECTED', 'SETTLED']).optional(),
        q: z.string().trim().max(100).optional(),
        from: optionalDate,
        to: optionalDate,
      })
      .parse(req.query);
    const num = q.q && /^#?\d{1,7}$/.test(q.q) ? Number(q.q.replace('#', '')) : null;
    const phone = q.q ? normalizePhone(q.q) : null;
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(q.deliveryStatus ? { deliveryStatus: q.deliveryStatus } : {}),
      ...(q.driverId ? { driverId: q.driverId } : {}),
      ...(q.deliveryCompanyId ? { deliveryCompanyId: q.deliveryCompanyId } : {}),
      ...(q.cod ? { paymentMethod: 'COD' } : {}),
      ...(q.codStatus ? { codStatus: q.codStatus } : {}),
      ...dateRange(q.from, q.to),
      ...(q.q
        ? { OR: [{ customerName: { contains: q.q, mode: 'insensitive' } }, ...(num ? [{ number: num }] : []), ...(phone ? [{ phone }] : [])] }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, select: deliveryOrderSelect, ...pageArgs(q) }),
      prisma.order.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

const OPEN: DeliveryStatus[] = ['PENDING', 'ASSIGNED', 'PREPARING', 'OUT_FOR_DELIVERY'];

/**
 * تحديث التوصيل لطلب:
 * - إسناد سائق أو شركة توصيل (يحوّل "بانتظار الإسناد" إلى "مُسند")
 * - "تم التسليم": يسجّل النقد المحصّل (افتراضيًا مبلغ الدفع عند الاستلام) ويكمل الطلب
 * - بعد تسوية النقد لا يتغير التسليم ولا المبلغ المحصّل
 */
deliveryRouter.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        driverId: z.string().min(1).nullable().optional(),
        deliveryCompanyId: z.string().min(1).nullable().optional(),
        deliveryStatus: deliveryStatusEnum.optional(),
        deliveryFee: money.optional(),
        deliveryNote: optStr(1000),
        codCollected: money.optional(),
      })
      .parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { vendorOrders: { include: { items: true } } } });
    if (!order) throw notFound('الطلب غير موجود');
    if (order.codStatus === 'SETTLED' && (input.codCollected !== undefined || (input.deliveryStatus && input.deliveryStatus !== 'DELIVERED'))) {
      throw conflict('تمت تسوية نقد هذا الطلب. ألغِ التسوية أولًا إن لزم التعديل.');
    }
    if (input.driverId && !(await prisma.driver.findFirst({ where: { id: input.driverId, status: 'ACTIVE' } }))) throw badRequest('السائق غير موجود أو غير فعّال');
    let company = null;
    if (input.deliveryCompanyId) {
      company = await prisma.deliveryCompany.findFirst({ where: { id: input.deliveryCompanyId, active: true } });
      if (!company) throw badRequest('شركة التوصيل غير موجودة أو غير فعّالة');
    }

    const assigning = Boolean(input.driverId || input.deliveryCompanyId);
    let next = input.deliveryStatus ?? (assigning && order.deliveryStatus === 'PENDING' ? 'ASSIGNED' : order.deliveryStatus);
    if (next === 'DELIVERED' && order.status === 'CANCELLED') throw badRequest('الطلب ملغي ولا يمكن تسليمه');
    const willHaveCarrier = (input.driverId !== undefined ? input.driverId : order.driverId) || (input.deliveryCompanyId !== undefined ? input.deliveryCompanyId : order.deliveryCompanyId);
    if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(next) && !willHaveCarrier) throw badRequest('أسند الطلب لسائق أو شركة توصيل أولًا');
    if (input.codCollected !== undefined && order.paymentMethod !== 'COD') throw badRequest('الطلب ليس دفعًا عند الاستلام');
    if (input.codCollected !== undefined && next !== 'DELIVERED') throw badRequest('يُسجَّل المبلغ المحصّل عند التسليم');
    if (!input.deliveryStatus && !assigning && input.driverId === null && input.deliveryCompanyId === null && OPEN.includes(order.deliveryStatus)) next = 'PENDING';

    const isCod = order.paymentMethod === 'COD';
    const becameDelivered = next === 'DELIVERED' && order.deliveryStatus !== 'DELIVERED';
    const leftDelivered = next !== 'DELIVERED' && order.deliveryStatus === 'DELIVERED';

    const data: Prisma.OrderUncheckedUpdateInput = {
      ...(input.driverId !== undefined ? { driverId: input.driverId } : {}),
      ...(input.deliveryCompanyId !== undefined ? { deliveryCompanyId: input.deliveryCompanyId } : {}),
      ...(input.deliveryNote !== undefined ? { deliveryNote: input.deliveryNote } : {}),
      ...(input.deliveryFee !== undefined
        ? { deliveryFee: new Prisma.Decimal(input.deliveryFee) }
        : company && toNum(order.deliveryFee) === 0
          ? { deliveryFee: company.defaultFee }
          : {}),
      deliveryStatus: next,
    };
    if (becameDelivered) {
      data.deliveredAt = new Date();
      if (isCod) {
        data.codCollected = new Prisma.Decimal(input.codCollected ?? toNum(order.codAmount ?? order.total));
        data.codStatus = 'COLLECTED';
        data.codCollectedAt = new Date();
      }
    } else if (next === 'DELIVERED' && isCod && input.codCollected !== undefined) {
      // تصحيح المبلغ المحصّل قبل التسوية — يُسجَّل في السجل بالقيمة القديمة والجديدة
      data.codCollected = new Prisma.Decimal(input.codCollected);
    }
    if (leftDelivered) {
      data.deliveredAt = null;
      if (isCod) Object.assign(data, { codCollected: null, codCollectedAt: null, codStatus: 'PENDING' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.order.update({ where: { id: order.id }, data, select: deliveryOrderSelect });
      // التسليم يكمل الطلب عبر نفس مسار الحالات الحالي (الطلبات الفرعية غير الملغاة فقط)
      if (becameDelivered) {
        for (const vo of order.vendorOrders) {
          if (vo.status !== 'CANCELLED' && vo.status !== 'COMPLETED' && !vo.payoutId) await setVendorOrderStatus(tx, vo, 'COMPLETED');
        }
        await syncOrderStatus(tx, order.id);
      }
      return u;
    });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'delivery',
      entity: 'order',
      entityId: order.id,
      meta: JSON.parse(
        JSON.stringify({
          deliveryStatus: [order.deliveryStatus, next],
          driverId: input.driverId,
          deliveryCompanyId: input.deliveryCompanyId,
          ...(data.codCollected !== undefined ? { codCollected: [order.codCollected?.toString() ?? null, data.codCollected?.toString() ?? null] } : {}),
        }),
      ),
    });
    ok(res, updated);
  }),
);

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
