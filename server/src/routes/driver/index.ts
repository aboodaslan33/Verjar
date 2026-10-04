import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { round3, toNum } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { requireDriver } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import {
  DELIVERED_SET,
  DRIVER_ACTIVE,
  FAILURES,
  acceptAssignment,
  collectPayment,
  liveUpdate,
  sendDeliveryOtp,
  transition,
  verifyDeliveryOtp,
  type Actor,
} from '../../services/delivery.service';
import { getSettings } from '../../services/settings.service';
import { POLICIES, storeFile, validateAndStore, type DetectedType } from '../../services/upload.service';

/**
 * واجهة موظف التوصيل (Delivery Admin) — نفس الـ API يخدم صفحة /driver في الموقع
 * وتطبيق جوال مستقبلًا (Authorization: Bearer). كل الطلبات مقيّدة بالطلبات المسندة للموظف،
 * ولا يرى إلا بيانات الاستلام والتسليم اللازمة، ولا يستطيع تعديل أي مبلغ في الطلب.
 */
export const driverRouter = Router();
driverRouter.use(requireDriver);

const actorOf = (req: { auth?: { sub: string; name: string; perms: string[] }; driver?: { id: string } }): Extract<Actor, { kind: 'user' }> => ({
  kind: 'user',
  id: req.auth!.sub,
  name: req.auth!.name,
  perms: req.auth!.perms,
  driverId: req.driver!.id,
});

/** ما يحتاجه الموظف فقط — بدون العمولات أو بيانات العميل الأخرى */
const driverSelect = {
  id: true,
  code: true,
  number: true,
  deliveryStatus: true,
  customerName: true,
  phone: true,
  address: true,
  area: true,
  deliveryLat: true,
  deliveryLng: true,
  pickupAddress: true,
  pickupPhone: true,
  pickupLat: true,
  pickupLng: true,
  notes: true,
  deliveryNote: true,
  subtotal: true,
  discountTotal: true,
  total: true,
  deliveryFee: true,
  customerPaysFee: true,
  paymentMethod: true,
  financialStatus: true,
  codAmount: true,
  codCollected: true,
  codStatus: true,
  createdAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  updatedAt: true,
  supplier: { select: { name: true, phone: true } },
  vendorOrders: { select: { vendor: { select: { name: true, phone: true, pickupAddress: true } } } },
  items: { select: { name: true, variant: true, quantity: true } },
  assignments: { where: { status: { not: 'UNASSIGNED' } }, select: { status: true, assignedAt: true, acceptedAt: true } },
  proof: { select: { recipientName: true, deliveredAt: true, signatureUrl: true, photoUrl: true, otpVerified: true, amountCollected: true } },
} satisfies Prisma.OrderSelect;

type DriverOrder = Prisma.OrderGetPayload<{ select: typeof driverSelect }>;

/** بعد إغلاق الطلب بيوم تُخفى بيانات العميل الشخصية من سجل الموظف */
function present(o: DriverOrder) {
  const closedLongAgo = ['COMPLETED', 'CANCELLED'].includes(o.deliveryStatus) && Date.now() - o.updatedAt.getTime() > 24 * 3600_000;
  const supplier = o.supplier ?? o.vendorOrders[0]?.vendor ?? null;
  return {
    ...o,
    supplierName: supplier?.name ?? null,
    pickupPhone: o.pickupPhone ?? supplier?.phone ?? null,
    pickupAddress: o.pickupAddress ?? (supplier && 'pickupAddress' in supplier ? supplier.pickupAddress : null) ?? null,
    accepted: o.assignments.some((a) => a.status === 'ACCEPTED'),
    amountToCollect: toNum(o.codAmount),
    ...(closedLongAgo ? { phone: null, address: null, deliveryLat: null, deliveryLng: null } : {}),
  };
}

async function ownOrder(driverId: string, id: string) {
  const o = await prisma.order.findFirst({ where: { id, driverId, deletedAt: null }, select: driverSelect });
  if (!o) throw notFound('الطلب غير موجود أو غير مسند إليك');
  return o;
}

/** الموظف: ملخص اليوم والنقد الذي بحوزته */
driverRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const id = req.driver!.id;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [active, deliveredToday, cash] = await Promise.all([
      prisma.order.count({ where: { driverId: id, deletedAt: null, deliveryStatus: { in: DRIVER_ACTIVE } } }),
      prisma.order.count({ where: { driverId: id, deletedAt: null, deliveredAt: { gte: startOfDay } } }),
      prisma.order.aggregate({ where: { driverId: id, deletedAt: null, codStatus: 'COLLECTED' }, _sum: { codCollected: true }, _count: { _all: true } }),
    ]);
    const settings = await getSettings();
    ok(res, {
      driver: req.driver,
      active,
      deliveredToday,
      cashInHand: round3(toNum(cash._sum.codCollected)),
      cashOrders: cash._count._all,
      rules: { otpRequired: settings.deliveryOtpRequired, photoRequired: settings.deliveryPhotoRequired },
    });
  }),
);

driverRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { scope } = z.object({ scope: z.enum(['active', 'history']).default('active') }).parse(req.query);
    const rows = await prisma.order.findMany({
      where: {
        driverId: req.driver!.id,
        deletedAt: null,
        ...(scope === 'active'
          ? // النشطة + المسلّمة التي لم يُسجَّل تحصيلها بعد
            { OR: [{ deliveryStatus: { in: DRIVER_ACTIVE.filter((s) => s !== 'DELIVERED') } }, { deliveryStatus: 'DELIVERED', codStatus: 'PENDING' }] }
          : { deliveryStatus: { notIn: DRIVER_ACTIVE.filter((s) => s !== 'DELIVERED') } }),
      },
      orderBy: scope === 'active' ? [{ deliveryStatus: 'asc' }, { createdAt: 'asc' }] : { updatedAt: 'desc' },
      take: scope === 'active' ? 200 : 100,
      select: driverSelect,
    });
    ok(res, rows.map(present));
  }),
);

driverRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    ok(res, present(await ownOrder(req.driver!.id, req.params.id)));
  }),
);

driverRouter.post(
  '/orders/:id/accept',
  asyncHandler(async (req, res) => {
    await ownOrder(req.driver!.id, req.params.id);
    await prisma.$transaction((tx) => acceptAssignment(tx, req.params.id, actorOf(req)));
    liveUpdate(req.params.id, `${req.driver!.name} قبل الطلب`);
    ok(res, present(await ownOrder(req.driver!.id, req.params.id)));
  }),
);

const geo = { lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() };

/** استلمت الطلب، بدأت التوصيل، وصلت للعميل، أو تعذر التسليم (مع السبب) */
driverRouter.post(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const input = z
      .object({ status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'ARRIVED', ...(FAILURES as ['DELIVERY_FAILED'])]), note: z.string().trim().max(500).nullable().optional(), ...geo })
      .parse(req.body);
    await ownOrder(req.driver!.id, req.params.id);
    const actor = actorOf(req);
    await prisma.$transaction(async (tx) => {
      // استلام الطلب يعني قبوله ضمنيًا
      if (input.status === 'PICKED_UP') await acceptAssignment(tx, req.params.id, actor);
      await transition(tx, req.params.id, input.status, actor, { note: input.note, lat: input.lat, lng: input.lng });
    });
    liveUpdate(req.params.id, `${req.driver!.name}: ${input.status}`);
    ok(res, present(await ownOrder(req.driver!.id, req.params.id)));
  }),
);

driverRouter.post(
  '/orders/:id/otp',
  formLimiter,
  asyncHandler(async (req, res) => {
    await ownOrder(req.driver!.id, req.params.id);
    ok(res, await prisma.$transaction((tx) => sendDeliveryOtp(tx, req.params.id, actorOf(req))));
  }),
);

/** توقيع العميل (PNG من شاشة اللمس) كـ data URL — يُتحقق من أنه صورة PNG فعلًا */
function signatureFile(dataUrl: string): { file: Express.Multer.File; detected: DetectedType } {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest('صيغة التوقيع غير صحيحة', { field: 'signature' });
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length < 60 || buffer.length > 600 * 1024 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw badRequest('صيغة التوقيع غير صحيحة', { field: 'signature' });
  }
  const file = { buffer, size: buffer.length, originalname: 'signature.png', mimetype: 'image/png' } as Express.Multer.File;
  return { file, detected: { mime: 'image/png', ext: 'png', kind: 'IMAGE' } };
}

/**
 * تم التسليم: إثبات التسليم (الوقت، GPS، التوقيع، OTP، الصورة، اسم المستلم، المبلغ المحصّل).
 * multipart: data = JSON، photo = صورة اختيارية. بعد الحفظ لا يعدّله إلا صاحب صلاحية proofs.edit.
 */
driverRouter.post(
  '/orders/:id/deliver',
  formLimiter,
  uploadGuard(12),
  memoryUpload(8, 1).single('photo'),
  asyncHandler(async (req, res) => {
    const raw = typeof req.body?.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const input = z
      .object({
        recipientName: z.string().trim().min(2, 'اكتب اسم مستلم الطلب').max(100),
        signature: z.string().max(900_000).nullable().optional(),
        otp: z.string().trim().regex(/^\d{4}$/, 'الرمز 4 أرقام').nullable().optional(),
        amountCollected: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
        method: z.enum(['CASH', 'CLIQ', 'CARD', 'BANK_TRANSFER', 'OTHER']).default('CASH'),
        note: z.string().trim().max(500).nullable().optional(),
        accuracy: z.number().min(0).max(100_000).nullable().optional(),
        ...geo,
      })
      .parse(raw);
    const order = await ownOrder(req.driver!.id, req.params.id);
    if (!['IN_TRANSIT', 'ARRIVED'].includes(order.deliveryStatus)) throw badRequest('سجّل "بدأت التوصيل" قبل التسليم');
    const settings = await getSettings();
    if (settings.deliveryOtpRequired && !input.otp) throw badRequest('أدخل رمز التحقق من العميل', { field: 'otp' });
    if (settings.deliveryPhotoRequired && !req.file) throw badRequest('أرفق صورة إثبات التسليم', { field: 'photo' });
    if (!input.signature && !input.otp && !req.file) throw badRequest('أضف توقيع العميل أو رمز التحقق أو صورة كإثبات', { field: 'signature' });
    const due = toNum(order.codAmount);
    if (due > 0 && input.amountCollected == null) throw badRequest('أدخل المبلغ المحصّل (0 إن لم يُحصَّل شيء)', { field: 'amountCollected' });
    if (input.amountCollected != null && input.amountCollected - due > 0.0005) throw badRequest(`المبلغ المحصّل لا يتجاوز المطلوب (${due})`, { field: 'amountCollected' });

    // التحقق من كل شيء أولًا ثم رفع الملفات
    const sig = input.signature ? signatureFile(input.signature) : null;
    const actor = actorOf(req);
    if (input.otp) await prisma.$transaction((tx) => verifyDeliveryOtp(tx, order.id, input.otp!));
    const [signatureUrl, photo] = await Promise.all([
      sig ? storeFile(sig.file, 'delivery-proofs', sig.detected).then((f) => f.url) : null,
      req.file ? validateAndStore([req.file], POLICIES.photos, 'delivery-proofs').then((f) => f[0]?.url ?? null) : null,
    ]);

    await prisma.$transaction(async (tx) => {
      await tx.deliveryProof.create({
        data: {
          orderId: order.id,
          recipientName: input.recipientName,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          accuracy: input.accuracy ?? null,
          signatureUrl,
          photoUrl: photo,
          otpVerified: Boolean(input.otp),
          amountCollected: input.amountCollected != null ? new Prisma.Decimal(round3(input.amountCollected)) : null,
          note: input.note ?? null,
          createdById: actor.id,
        },
      });
      await transition(tx, order.id, 'DELIVERED', actor, { viaProof: true, note: `المستلم: ${input.recipientName}${input.note ? ` — ${input.note}` : ''}`, lat: input.lat, lng: input.lng });
      if (due > 0 && input.amountCollected != null) await collectPayment(tx, order.id, actor, input.amountCollected, input.method);
    });
    await audit({ actorId: actor.id, actorType: 'admin', action: 'deliver', entity: 'order', entityId: order.id, meta: { amountCollected: input.amountCollected ?? null, otp: Boolean(input.otp), photo: Boolean(photo), signature: Boolean(signatureUrl) } });
    liveUpdate(order.id, `تم تسليم ${order.code}`);
    ok(res, present(await ownOrder(req.driver!.id, order.id)));
  }),
);

/** تم تحصيل المبلغ (لطلب سُلِّم دون تسجيل التحصيل) — مرة واحدة، والتصحيح من الإدارة */
driverRouter.post(
  '/orders/:id/collect',
  asyncHandler(async (req, res) => {
    const { amount, method } = z.object({ amount: z.coerce.number().min(0).max(1_000_000), method: z.enum(['CASH', 'CLIQ', 'CARD', 'BANK_TRANSFER', 'OTHER']).default('CASH') }).parse(req.body);
    const order = await ownOrder(req.driver!.id, req.params.id);
    if (!DELIVERED_SET.includes(order.deliveryStatus)) throw badRequest('يُسجَّل التحصيل بعد التسليم');
    await prisma.$transaction((tx) => collectPayment(tx, order.id, actorOf(req), amount, method));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'collect', entity: 'order', entityId: order.id, meta: { amount, method } });
    liveUpdate(order.id, `تحصيل ${order.code}`);
    ok(res, present(await ownOrder(req.driver!.id, order.id)));
  }),
);
