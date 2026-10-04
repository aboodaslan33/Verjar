import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { Prisma, type DeliveryStatus, type FinancialStatus, type PaymentMethod } from '@prisma/client';
import { env } from '../config/env';
import { emitAdmin } from '../lib/events';
import { badRequest, conflict, forbidden } from '../lib/http';
import { makeRef } from '../lib/ids';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';
import { notify, type NotifyTarget } from './notifications.service';
import { setVendorOrderStatus, syncOrderStatus } from './vendor.service';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/**
 * نظام إدارة التوصيل — مسار الطلب:
 * NEW → ACCEPTED → PICKUP_ASSIGNED → PICKED_UP → IN_TRANSIT → ARRIVED → DELIVERED → PAYMENT_COLLECTED → COMPLETED
 * مع حالات استثنائية. كل تغيير يمر من transition(): يتحقق من صلاحية المنفّذ والانتقال،
 * يسجّل الحدث في OrderStatusEvent، يحدّث الأوقات والحالة المالية، ويرسل الإشعارات.
 */

export const FLOW: DeliveryStatus[] = ['NEW', 'ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'];
export const FAILURES: DeliveryStatus[] = ['DELIVERY_FAILED', 'CUSTOMER_NOT_AVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS'];
export const EXCEPTIONS: DeliveryStatus[] = [...FAILURES, 'RESCHEDULED', 'CANCELLED'];
export const ALL_STATUSES: DeliveryStatus[] = [...FLOW, ...EXCEPTIONS];
/** طلبات يعمل عليها موظف التوصيل حاليًا */
export const DRIVER_ACTIVE: DeliveryStatus[] = ['PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'RESCHEDULED', 'DELIVERED'];
/** بعد التسليم */
export const DELIVERED_SET: DeliveryStatus[] = ['DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'];
const CLOSED: DeliveryStatus[] = ['COMPLETED', 'CANCELLED'];

/** مجموعات لوحة التحكم */
export const BUCKETS = {
  new: ['NEW'],
  preparing: ['ACCEPTED', 'PICKUP_ASSIGNED'],
  pickedUp: ['PICKED_UP'],
  inTransit: ['IN_TRANSIT', 'ARRIVED'],
  delivered: DELIVERED_SET,
  failed: [...FAILURES, 'RESCHEDULED'],
  cancelled: ['CANCELLED'],
} satisfies Record<string, DeliveryStatus[]>;

export type Actor =
  | { kind: 'user'; id: string; name: string; perms: string[]; driverId?: string }
  | { kind: 'vendor'; vendorId: string; name: string }
  | { kind: 'customer'; id: string; name: string }
  | { kind: 'system'; name?: string };

/** انتقالات موظف التوصيل (على الطلبات المسندة إليه فقط) */
const DRIVER_MOVES: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  PICKUP_ASSIGNED: ['PICKED_UP', ...FAILURES],
  PICKED_UP: ['IN_TRANSIT', ...FAILURES],
  IN_TRANSIT: ['ARRIVED', 'DELIVERED', ...FAILURES],
  ARRIVED: ['DELIVERED', ...FAILURES],
  RESCHEDULED: ['IN_TRANSIT', 'PICKED_UP'],
  DELIVERED: ['PAYMENT_COLLECTED'],
};

/** المورد: إلغاء طلبه قبل خروجه للاستلام فقط */
const VENDOR_MOVES: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  NEW: ['CANCELLED'],
  ACCEPTED: ['CANCELLED'],
};

export function canMove(actor: Actor, from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return false;
  if (actor.kind === 'system') return true;
  if (actor.kind === 'vendor') return Boolean(VENDOR_MOVES[from]?.includes(to));
  if (actor.kind === 'customer') return false;
  if (actor.perms.includes('orders.manage')) {
    // الإدارة: أي انتقال عدا الخروج من الحالات المغلقة، والإغلاق فقط بعد التسليم
    if (from === 'COMPLETED') return false;
    if (from === 'CANCELLED') return to === 'NEW';
    if (to === 'COMPLETED') return from === 'DELIVERED' || from === 'PAYMENT_COLLECTED';
    if (to === 'PICKUP_ASSIGNED') return false; // عبر الإسناد فقط
    return true;
  }
  if (actor.perms.includes('driver.app')) return Boolean(DRIVER_MOVES[from]?.includes(to));
  return false;
}

// ───────────── الأرقام والمبالغ ─────────────

/** رقم الطلب الموحّد FG-ORD-000001 (زيادة ذرّية) */
export async function nextOrderCode(db: Db) {
  const row = await db.refCounter.upsert({ where: { key: 'FG-ORD' }, create: { key: 'FG-ORD', value: 1 }, update: { value: { increment: 1 } } });
  return `FG-ORD-${String(row.value).padStart(6, '0')}`;
}

type Money = { paymentMethod: PaymentMethod | null; total: Prisma.Decimal | number; deliveryFee: Prisma.Decimal | number; customerPaysFee: boolean };

/** المبلغ المطلوب تحصيله: قيمة المنتجات إن كان الدفع عند الاستلام + أجرة التوصيل إن كان العميل يدفعها */
export function amountToCollect(o: Money) {
  return round3((o.paymentMethod === 'COD' ? toNum(o.total) : 0) + (o.customerPaysFee ? toNum(o.deliveryFee) : 0));
}

export function financialStatusOf(o: {
  paymentMethod: PaymentMethod | null;
  source: string;
  total: Prisma.Decimal | number;
  codAmount: Prisma.Decimal | number | null;
  codCollected: Prisma.Decimal | number | null;
  deliveryStatus: DeliveryStatus;
  paidOnline?: number;
}): FinancialStatus {
  const due = toNum(o.codAmount);
  const got = toNum(o.codCollected);
  if (due > 0.0005) {
    if (got + 0.0005 >= due) return 'COLLECTED';
    if (got > 0) return 'PARTIAL_PAYMENT';
    return DELIVERED_SET.includes(o.deliveryStatus) ? 'NOT_COLLECTED' : 'COD';
  }
  // لا شيء يُحصَّل عند الباب: مدفوع مسبقًا للمورد، أو دفع إلكتروني يُطابَق بالدفعات المسجلة
  if (o.source === 'SUPPLIER' && o.paymentMethod !== 'COD') return 'PAID';
  if ((o.paidOnline ?? 0) + 0.0005 >= toNum(o.total)) return 'PAID';
  return o.paymentMethod === 'COD' ? 'COLLECTED' : 'PAYMENT_PENDING';
}

/** يعيد حساب المبلغ المطلوب (ما لم يُحصَّل بعد) والحالة المالية ويحفظهما */
export async function refreshFinance(db: Db, orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const collected = o.codStatus === 'COLLECTED' || o.codStatus === 'SETTLED';
  const due = collected ? toNum(o.codAmount) : amountToCollect(o);
  const paid = await db.payment.aggregate({ where: { orderId, deletedAt: null }, _sum: { amount: true } });
  const financialStatus = financialStatusOf({ ...o, codAmount: due, paidOnline: toNum(paid._sum.amount) });
  return db.order.update({
    where: { id: orderId },
    data: {
      ...(collected ? {} : { codAmount: due > 0 ? new Prisma.Decimal(due) : null, codStatus: due > 0 ? 'PENDING' : null }),
      financialStatus,
    },
  });
}

// ───────────── السجل والإشعارات ─────────────

async function recordEvent(tx: Tx, orderId: string, from: DeliveryStatus | null, to: DeliveryStatus, actor: Actor, extra: { note?: string | null; lat?: number | null; lng?: number | null } = {}) {
  await tx.orderStatusEvent.create({
    data: {
      orderId,
      fromStatus: from,
      toStatus: to,
      actorId: actor.kind === 'user' ? actor.id : null,
      actorType: actor.kind,
      actorName: 'name' in actor ? actor.name ?? null : null,
      note: extra.note ?? null,
      lat: extra.lat ?? null,
      lng: extra.lng ?? null,
    },
  });
}

export const STATUS_AR: Record<DeliveryStatus, string> = {
  NEW: 'جديد',
  ACCEPTED: 'قيد التجهيز',
  PICKUP_ASSIGNED: 'مُسند لموظف التوصيل',
  PICKED_UP: 'تم الاستلام من المورد',
  IN_TRANSIT: 'في الطريق',
  ARRIVED: 'وصل موظف التوصيل',
  DELIVERED: 'تم التسليم',
  PAYMENT_COLLECTED: 'تم تحصيل المبلغ',
  COMPLETED: 'مكتمل',
  DELIVERY_FAILED: 'تعذر التسليم',
  CUSTOMER_NOT_AVAILABLE: 'العميل غير متاح',
  CUSTOMER_REFUSED: 'رفض العميل الاستلام',
  WRONG_ADDRESS: 'عنوان خاطئ',
  RESCHEDULED: 'أُعيدت جدولته',
  CANCELLED: 'ملغي',
};

type OrderForNotify = { id: string; code: string | null; number: number; customerId: string; phone: string; supplierId: string | null; driverId: string | null };

async function suppliersOf(tx: Tx, o: OrderForNotify): Promise<NotifyTarget[]> {
  if (o.supplierId) return [{ type: 'VENDOR', vendorId: o.supplierId }];
  const vos = await tx.vendorOrder.findMany({ where: { orderId: o.id, vendor: { isHouse: false } }, select: { vendorId: true } });
  return vos.map((v) => ({ type: 'VENDOR' as const, vendorId: v.vendorId }));
}

async function driverUser(tx: Tx, driverId: string | null): Promise<NotifyTarget[]> {
  if (!driverId) return [];
  const d = await tx.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
  return d?.userId ? [{ type: 'USER', userId: d.userId }] : [];
}

const label = (o: { code: string | null; number: number }) => o.code ?? `#${o.number}`;

/** إشعارات حسب الحالة: المورد (إنشاء، استلام، تسليم)، العميل (تجهيز، خروج، وصول، تسليم)، الموظف (إلغاء) */
async function notifyStatus(tx: Tx, o: OrderForNotify, to: DeliveryStatus) {
  const code = label(o);
  const customer: NotifyTarget = { type: 'CUSTOMER', customerId: o.customerId, phone: o.phone };
  const customerMsg: Partial<Record<DeliveryStatus, string>> = {
    ACCEPTED: `طلبك ${code} قيد التجهيز.`,
    IN_TRANSIT: `طلبك ${code} خرج للتوصيل وهو في الطريق إليك.`,
    ARRIVED: `موظف التوصيل وصل إلى عنوانك لتسليم الطلب ${code}.`,
    DELIVERED: `تم تسليم طلبك ${code}. شكرًا لك.`,
  };
  if (customerMsg[to]) await notify(tx, [customer], { title: STATUS_AR[to], body: customerMsg[to]!, orderId: o.id, whatsapp: true });
  if (to === 'PICKED_UP' || to === 'DELIVERED' || FAILURES.includes(to)) {
    await notify(tx, await suppliersOf(tx, o), { title: `${code}: ${STATUS_AR[to]}`, body: `تغيّرت حالة الطلب ${code} إلى "${STATUS_AR[to]}".`, orderId: o.id });
  }
  if (to === 'CANCELLED') {
    await notify(tx, [...(await driverUser(tx, o.driverId)), ...(await suppliersOf(tx, o))], { title: `أُلغي الطلب ${code}`, body: `تم إلغاء الطلب ${code}.`, orderId: o.id });
  }
}

// ───────────── الانتقالات ─────────────

export type TransitionOpts = {
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** للاستخدام الداخلي: التسليم عبر إثبات التسليم فقط */
  viaProof?: boolean;
};

/** تغيير حالة الطلب مع كل التبعات. يُستدعى داخل معاملة (transaction) */
export async function transition(tx: Tx, orderId: string, to: DeliveryStatus, actor: Actor, opts: TransitionOpts = {}) {
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null }, include: { vendorOrders: { include: { items: true } } } });
  if (!order) throw badRequest('الطلب غير موجود');
  const from = order.deliveryStatus;
  if (!canMove(actor, from, to)) throw conflict(`لا يمكن تغيير الحالة من "${STATUS_AR[from]}" إلى "${STATUS_AR[to]}"`);
  if (actor.kind === 'user' && !actor.perms.includes('orders.manage')) {
    if (order.driverId !== actor.driverId) throw forbidden('هذا الطلب غير مسند إليك');
    if (to === 'DELIVERED' && !opts.viaProof) throw badRequest('سجّل إثبات التسليم لإتمام التسليم');
  }
  if (FAILURES.includes(to) && !opts.note?.trim()) throw badRequest('اكتب سبب تعذّر التسليم', { field: 'note' });
  if (to === 'CANCELLED' && order.codStatus === 'SETTLED') throw conflict('تمت تسوية نقد هذا الطلب ولا يمكن إلغاؤه');
  if (['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'].includes(to) && !order.driverId && !order.deliveryCompanyId) {
    throw badRequest('أسند الطلب لموظف توصيل أولًا');
  }
  if (to === 'COMPLETED' && toNum(order.codAmount) > 0 && order.codStatus === 'PENDING') {
    throw badRequest('لم يُسجَّل تحصيل المبلغ بعد');
  }
  if (to === 'PAYMENT_COLLECTED' && order.codStatus !== 'COLLECTED' && order.codStatus !== 'SETTLED') {
    throw badRequest('سجّل المبلغ المحصّل أولًا');
  }

  const now = new Date();
  const data: Prisma.OrderUncheckedUpdateInput = { deliveryStatus: to };
  if (to === 'ACCEPTED' && !order.acceptedAt) data.acceptedAt = now;
  if (to === 'PICKED_UP') data.pickedUpAt = order.pickedUpAt ?? now;
  if (to === 'ARRIVED') data.arrivedAt = now;
  if (to === 'DELIVERED' && !order.deliveredAt) data.deliveredAt = now;
  if (to === 'COMPLETED') data.completedAt = now;
  // الرجوع من التسليم (تصحيح إداري) قبل التسوية: يُلغى التسليم والتحصيل
  if (DELIVERED_SET.includes(from) && !DELIVERED_SET.includes(to)) {
    if (order.codStatus === 'SETTLED') throw conflict('تمت تسوية نقد هذا الطلب. ألغِ التسوية أولًا إن لزم التعديل.');
    Object.assign(data, { deliveredAt: null, completedAt: null, codCollected: null, codCollectedAt: null, collectedById: null, collectedMethod: null, codStatus: toNum(order.codAmount) > 0 ? 'PENDING' : null });
    await tx.deliveryProof.deleteMany({ where: { orderId } });
  }
  await tx.order.update({ where: { id: orderId }, data });

  // الطلبات الفرعية (مسار الحالات والمخزون الحالي): التسليم يكملها، والإلغاء يلغيها ويعيد المخزون
  if (to === 'DELIVERED' || to === 'CANCELLED' || (from === 'CANCELLED' && to === 'NEW')) {
    const target = to === 'DELIVERED' ? 'COMPLETED' : to === 'CANCELLED' ? 'CANCELLED' : 'NEW';
    for (const vo of order.vendorOrders) {
      if (vo.payoutId || vo.status === target) continue;
      if (to === 'DELIVERED' && vo.status === 'CANCELLED') continue;
      await setVendorOrderStatus(tx, vo, target);
    }
    await syncOrderStatus(tx, orderId);
  }
  if (to === 'CANCELLED') {
    await tx.deliveryAssignment.updateMany({ where: { orderId, status: { not: 'UNASSIGNED' } }, data: { status: 'UNASSIGNED', endedAt: now } });
  }

  await recordEvent(tx, orderId, from, to, actor, opts);
  await refreshFinance(tx, orderId);
  await notifyStatus(tx, order, to);
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

/** إسناد (أو إعادة إسناد) طلب لموظف توصيل */
export async function assignDriver(tx: Tx, orderId: string, driverId: string | null, actor: Extract<Actor, { kind: 'user' }>, note?: string | null) {
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw badRequest('الطلب غير موجود');
  if (CLOSED.includes(order.deliveryStatus) || DELIVERED_SET.includes(order.deliveryStatus)) throw conflict('لا يمكن إسناد طلب مُسلَّم أو مغلق');
  const now = new Date();
  const previousDriver = order.driverId;
  if (previousDriver === driverId) return order;

  await tx.deliveryAssignment.updateMany({ where: { orderId, status: { not: 'UNASSIGNED' } }, data: { status: 'UNASSIGNED', endedAt: now } });
  let status = order.deliveryStatus;
  if (driverId) {
    const d = await tx.driver.findFirst({ where: { id: driverId, status: 'ACTIVE' } });
    if (!d) throw badRequest('موظف التوصيل غير موجود أو غير فعّال');
    await tx.deliveryAssignment.create({ data: { orderId, driverId, assignedById: actor.id, note: note ?? null } });
    // قبل الاستلام يصبح "مُسندًا"؛ أثناء التوصيل تبقى الحالة كما هي (تسليم الطلب لموظف آخر)
    if (['NEW', 'ACCEPTED', 'RESCHEDULED', ...FAILURES].includes(status)) status = 'PICKUP_ASSIGNED';
  } else if (status === 'PICKUP_ASSIGNED') {
    status = 'ACCEPTED';
  }
  await tx.order.update({ where: { id: orderId }, data: { driverId, deliveryCompanyId: driverId ? null : order.deliveryCompanyId, deliveryStatus: status, ...(status !== order.deliveryStatus && status === 'ACCEPTED' && !order.acceptedAt ? { acceptedAt: now } : {}) } });
  const driverName = driverId ? (await tx.driver.findUnique({ where: { id: driverId }, select: { name: true } }))?.name : null;
  await recordEvent(tx, orderId, order.deliveryStatus, status, actor, { note: driverId ? `أُسند إلى ${driverName}${note ? ` — ${note}` : ''}` : 'أُلغي الإسناد' });

  const code = label(order);
  if (driverId) {
    await notify(tx, await driverUser(tx, driverId), { title: `طلب جديد ${code}`, body: `أُسند إليك الطلب ${code} — ${order.customerName}، ${order.area ?? order.address}.`, orderId });
  }
  if (previousDriver) {
    await notify(tx, await driverUser(tx, previousDriver), { title: `سُحب الطلب ${code}`, body: `لم يعد الطلب ${code} مسندًا إليك.`, orderId });
  }
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

/** قبول موظف التوصيل للطلب المسند إليه (يُسجَّل في سجل الطلب) */
export async function acceptAssignment(tx: Tx, orderId: string, actor: Extract<Actor, { kind: 'user' }>) {
  const a = await tx.deliveryAssignment.findFirst({ where: { orderId, driverId: actor.driverId, status: { not: 'UNASSIGNED' } }, include: { order: true } });
  if (!a) throw forbidden('هذا الطلب غير مسند إليك');
  if (a.status === 'ACCEPTED') return a;
  const updated = await tx.deliveryAssignment.update({ where: { id: a.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
  await recordEvent(tx, orderId, a.order.deliveryStatus, a.order.deliveryStatus, actor, { note: 'قبل موظف التوصيل الطلب' });
  return updated;
}

// ───────────── التحصيل ─────────────

export async function collectPayment(tx: Tx, orderId: string, actor: Extract<Actor, { kind: 'user' }>, amount: number, method: PaymentMethod) {
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw badRequest('الطلب غير موجود');
  if (!actor.perms.includes('orders.manage') && order.driverId !== actor.driverId) throw forbidden('هذا الطلب غير مسند إليك');
  if (!DELIVERED_SET.includes(order.deliveryStatus)) throw badRequest('يُسجَّل التحصيل بعد التسليم');
  if (order.codStatus === 'SETTLED') throw conflict('تمت تسوية نقد هذا الطلب مع الإدارة ولا يمكن تعديله');
  const due = toNum(order.codAmount);
  if (due <= 0) throw badRequest('لا يوجد مبلغ مطلوب تحصيله لهذا الطلب');
  if (amount < 0 || amount - due > 0.0005) throw badRequest(`المبلغ المحصّل لا يتجاوز المطلوب (${due})`, { field: 'amount' });
  // موظف التوصيل يسجّل التحصيل مرة واحدة؛ التصحيح بعدها من الإدارة
  if (order.codStatus === 'COLLECTED' && !actor.perms.includes('orders.manage')) throw conflict('سُجّل التحصيل مسبقًا. التعديل من الإدارة فقط.');

  await tx.order.update({
    where: { id: orderId },
    data: {
      codCollected: new Prisma.Decimal(round3(amount)),
      codCollectedAt: new Date(),
      codStatus: 'COLLECTED',
      collectedById: actor.id,
      collectedMethod: method,
    },
  });
  if (order.deliveryStatus === 'DELIVERED') {
    await transition(tx, orderId, 'PAYMENT_COLLECTED', actor, {
      note: `تحصيل ${round3(amount)} من ${due}${method !== 'CASH' && method !== 'COD' ? ` (${method})` : ''}`,
    });
  } else {
    await recordEvent(tx, orderId, order.deliveryStatus, order.deliveryStatus, actor, { note: `تعديل المبلغ المحصّل: ${toNum(order.codCollected)} → ${round3(amount)}` });
    await refreshFinance(tx, orderId);
  }
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ───────────── رمز التحقق عند التسليم (OTP) ─────────────

const OTP_TTL_MS = 15 * 60_000;
const otpHash = (orderId: string, code: string) => createHash('sha256').update(`${env.JWT_SECRET}:otp:${orderId}:${code}`).digest('hex');

/**
 * يولّد رمزًا من 4 أرقام ويرسله للعميل: إشعار داخل حسابه، وواتساب إن كان Cloud API مفعّلًا.
 * لا يُحفظ الرمز نفسه، فقط بصمته. موظف التوصيل لا يراه أبدًا.
 */
export async function sendDeliveryOtp(tx: Tx, orderId: string, actor: Extract<Actor, { kind: 'user' }>) {
  const order = await tx.order.findFirst({ where: { id: orderId, deletedAt: null } });
  if (!order) throw badRequest('الطلب غير موجود');
  if (order.driverId !== actor.driverId && !actor.perms.includes('orders.manage')) throw forbidden('هذا الطلب غير مسند إليك');
  if (!['IN_TRANSIT', 'ARRIVED'].includes(order.deliveryStatus)) throw badRequest('يُرسل الرمز عند الوصول للعميل');
  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  await tx.order.update({ where: { id: orderId }, data: { otpHash: otpHash(orderId, code), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 } });
  await notify(tx, [{ type: 'CUSTOMER', customerId: order.customerId, phone: order.phone }], {
    title: 'رمز استلام الطلب',
    body: `رمز استلام طلبك ${label(order)}: ${code}. أعطه لموظف التوصيل عند الاستلام فقط.`,
    orderId,
    whatsapp: true,
  });
  const hasAccount = Boolean((await tx.customer.findUnique({ where: { id: order.customerId }, select: { passwordHash: true } }))?.passwordHash);
  await recordEvent(tx, orderId, order.deliveryStatus, order.deliveryStatus, actor, { note: 'أُرسل رمز التحقق للعميل' });
  return { channels: [...(hasAccount ? ['account'] : []), ...(env.waCloudEnabled ? ['whatsapp'] : [])] };
}

export async function verifyDeliveryOtp(tx: Tx, orderId: string, code: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { otpHash: true, otpExpiresAt: true, otpAttempts: true } });
  if (!o.otpHash || !o.otpExpiresAt || o.otpExpiresAt < new Date()) throw badRequest('انتهت صلاحية الرمز، أرسل رمزًا جديدًا', { field: 'otp' });
  if (o.otpAttempts >= 5) throw badRequest('محاولات كثيرة، أرسل رمزًا جديدًا', { field: 'otp' });
  const a = Buffer.from(otpHash(orderId, code.trim()));
  const b = Buffer.from(o.otpHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await tx.order.update({ where: { id: orderId }, data: { otpAttempts: { increment: 1 } } });
    throw badRequest('رمز التحقق غير صحيح', { field: 'otp' });
  }
  await tx.order.update({ where: { id: orderId }, data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } });
}

// ───────────── إنشاء طلب توصيل (مورد أو إدارة) ─────────────

export type DeliveryOrderInput = {
  customerName: string;
  customerPhone: string; // بصيغة دولية بعد التطبيع
  address: string;
  area?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  pickupAddress?: string | null;
  pickupPhone?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  items: { name: string; quantity: number; unitPrice: number }[];
  discount: number;
  deliveryFee: number;
  customerPaysFee: boolean;
  paymentMethod: PaymentMethod;
  notes?: string | null;
};

export async function createDeliveryOrder(tx: Tx, supplierId: string, input: DeliveryOrderInput, source: 'SUPPLIER' | 'ADMIN', actor: Actor) {
  const supplier = await tx.vendor.findUnique({ where: { id: supplierId } });
  if (!supplier) throw badRequest('المورد غير موجود');
  // العميل: حسابه إن وُجد برقم الهاتف، وإلا يُنشأ سجل عميل (يستطيع لاحقًا التسجيل بنفس الرقم ومتابعة طلبه)
  const customer =
    (await tx.customer.findUnique({ where: { phone: input.customerPhone } })) ??
    (await tx.customer.create({ data: { phone: input.customerPhone, name: input.customerName } }));

  const subtotal = round3(input.items.reduce((n, it) => n + it.quantity * it.unitPrice, 0));
  const discount = Math.min(round3(input.discount), subtotal);
  const total = round3(subtotal - discount);
  const code = await nextOrderCode(tx);
  const order = await tx.order.create({
    data: {
      ref: makeRef('O'),
      code,
      source,
      supplierId,
      customerId: customer.id,
      customerName: input.customerName,
      phone: input.customerPhone,
      address: input.address,
      area: input.area ?? null,
      deliveryLat: input.deliveryLat ?? null,
      deliveryLng: input.deliveryLng ?? null,
      pickupAddress: input.pickupAddress ?? supplier.pickupAddress ?? null,
      pickupPhone: input.pickupPhone ?? supplier.phone ?? null,
      pickupLat: input.pickupLat ?? supplier.pickupLat ?? null,
      pickupLng: input.pickupLng ?? supplier.pickupLng ?? null,
      notes: input.notes ?? null,
      subtotal: new Prisma.Decimal(subtotal),
      discountTotal: new Prisma.Decimal(discount),
      total: new Prisma.Decimal(total),
      deliveryFee: new Prisma.Decimal(round3(input.deliveryFee)),
      customerPaysFee: input.customerPaysFee,
      paymentMethod: input.paymentMethod,
      whatsappText: '',
    },
  });
  // طلب فرعي للمورد: بدون عمولة؛ صافيه للمورد قيمة المنتجات إن حصّلناها نحن (الدفع عند الاستلام)
  const vendorNet = input.paymentMethod === 'COD' ? total : 0;
  await tx.vendorOrder.create({
    data: {
      orderId: order.id,
      vendorId: supplierId,
      subtotal: new Prisma.Decimal(subtotal),
      total: new Prisma.Decimal(total),
      commissionTotal: new Prisma.Decimal(0),
      vendorNet: new Prisma.Decimal(vendorNet),
      items: {
        create: input.items.map((it) => {
          const line = round3(it.quantity * it.unitPrice);
          return {
            orderId: order.id,
            vendorId: supplierId,
            productId: null,
            name: it.name,
            unitPrice: new Prisma.Decimal(it.unitPrice),
            unitFinalPrice: new Prisma.Decimal(it.unitPrice),
            quantity: it.quantity,
            lineTotal: new Prisma.Decimal(line),
            commissionPercent: new Prisma.Decimal(0),
            commissionAmount: new Prisma.Decimal(0),
            vendorNet: new Prisma.Decimal(input.paymentMethod === 'COD' ? line : 0),
          };
        }),
      },
    },
  });
  await recordEvent(tx, order.id, null, 'NEW', actor, { note: source === 'SUPPLIER' ? 'أنشأه المورد' : 'أنشأته الإدارة' });
  await refreshFinance(tx, order.id);
  await notify(tx, [{ type: 'VENDOR', vendorId: supplierId }], { title: `طلب جديد ${code}`, body: `تم إنشاء طلب التوصيل ${code} للعميل ${input.customerName}.`, orderId: order.id });
  return tx.order.findUniqueOrThrow({ where: { id: order.id } });
}

/** بعد إنشاء طلب من المتجر: الرقم الموحّد، الحدث الأول، الحالة المالية، وإشعار الموردين */
export async function initStoreOrder(tx: Tx, orderId: string) {
  const code = await nextOrderCode(tx);
  await tx.order.update({ where: { id: orderId }, data: { code, source: 'STORE' } });
  await recordEvent(tx, orderId, null, 'NEW', { kind: 'system', name: 'المتجر' });
  await refreshFinance(tx, orderId);
  // إشعار لكل مورد بما بيع من منتجاته (داخل الموقع؛ البريد يُرسل بعد حفظ الطلب — notifySuppliersOfSale)
  const vos = await tx.vendorOrder.findMany({
    where: { orderId, vendor: { isHouse: false } },
    select: { id: true, vendorId: true, items: { select: { name: true, variant: true, quantity: true } } },
  });
  for (const vo of vos) {
    await notify(tx, [{ type: 'VENDOR', vendorId: vo.vendorId }], {
      title: `تم بيع منتجاتك — طلب ${code}`,
      body: `طلب جديد ${code}: ${vo.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity}`).join('، ')}.`,
      orderId,
      link: `/vendor/orders/${vo.id}`,
    });
  }
  return code;
}

export function liveUpdate(orderId: string, title: string) {
  emitAdmin({ type: 'status.changed', id: orderId, title });
}
