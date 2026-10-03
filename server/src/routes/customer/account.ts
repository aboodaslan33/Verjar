import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/http';
import { nextRef } from '../../lib/refs';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { formLimiter } from '../../middleware/rateLimit';
import { clientIp } from '../../lib/clientIp';
import { issueEmailOtp, verifyEmailOtp } from '../../services/emailOtp.service';
import { customerFinance } from '../../services/customer.service';
import { type Attachment, checkService, storeAttachments, tenderData, tenderInput } from '../../services/tenders.service';

export const accountRouter = Router();
accountRouter.use(requireCustomer);

/** كل ما يخص العميل: الحجوزات والطلبات وطلبات الشركات والعقود والملفات والدفعات */
accountRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const customerId = req.auth!.sub;
    const notDeleted = { customerId, deletedAt: null };
    const [bookings, orders, corporate, contracts, files, payments, finance] = await Promise.all([
      prisma.booking.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          ref: true,
          type: true,
          status: true,
          scheduledAt: true,
          locationText: true,
          urgency: true,
          inspectionFee: true,
          quotedAmount: true,
          details: true,
          createdAt: true,
          media: { select: { id: true, url: true, kind: true } },
        },
      }),
      prisma.order.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          code: true,
          ref: true,
          status: true,
          deliveryStatus: true,
          financialStatus: true,
          total: true,
          subtotal: true,
          discountTotal: true,
          deliveryFee: true,
          codAmount: true,
          paymentMethod: true,
          address: true,
          createdAt: true,
          deliveredAt: true,
          items: { select: { id: true, name: true, quantity: true, lineTotal: true, vendorOrderId: true } },
          vendorOrders: {
            orderBy: { number: 'asc' },
            select: { id: true, number: true, status: true, total: true, vendor: { select: { name: true, slug: true, isHouse: true } } },
          },
        },
      }),
      prisma.corporateRequest.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          ref: true,
          type: true,
          status: true,
          companyName: true,
          quotedAmount: true,
          createdAt: true,
          services: { select: { name: true } },
        },
      }),
      prisma.contract.findMany({
        where: notDeleted,
        orderBy: { startDate: 'desc' },
        select: { id: true, number: true, title: true, startDate: true, endDate: true, value: true, status: true, fileUrl: true },
      }),
      prisma.quoteFile.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          title: true,
          url: true,
          amount: true,
          createdAt: true,
          booking: { select: { number: true } },
          order: { select: { number: true } },
          corporateRequest: { select: { number: true } },
          contract: { select: { number: true } },
        },
      }),
      prisma.payment.findMany({
        where: notDeleted,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          reference: true,
          note: true,
          booking: { select: { number: true } },
          order: { select: { number: true } },
          contract: { select: { number: true } },
        },
      }),
      customerFinance(customerId),
    ]);
    ok(res, { bookings, orders, corporate, contracts, files, payments, finance });
  }),
);

// ───────────── عطاءات الشركة ─────────────

const ownTender = async (customerId: string, id: string) => {
  const t = await prisma.tender.findFirst({ where: { id, customerId, deletedAt: null } });
  if (!t) throw notFound('العطاء غير موجود');
  return t;
};

/** عطاءات العميل مع العروض المقدّمة عليها */
accountRouter.get(
  '/tenders',
  asyncHandler(async (req, res) => {
    const items = await prisma.tender.findMany({
      where: { customerId: req.auth!.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        service: { select: { id: true, name: true } },
        offers: { where: { status: { not: 'WITHDRAWN' } }, orderBy: { price: 'asc' }, select: { id: true, providerName: true, price: true, proposal: true, status: true, submittedAt: true, attachments: true } },
      },
    });
    ok(res, items);
  }),
);

accountRouter.post(
  '/tenders',
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = tenderInput.extend({ status: z.enum(['DRAFT', 'OPEN']).default('OPEN') }).parse(req.body);
    await checkService(input.serviceId);
    const t = await prisma.$transaction(async (tx) =>
      tx.tender.create({ data: { ...(tenderData(input) as Prisma.TenderUncheckedCreateInput), status: input.status, customerId: req.auth!.sub, ref: await nextRef(tx, 'TEN') } }),
    );
    await audit({ actorType: 'customer', action: 'create', entity: 'tender', entityId: t.id, meta: { ref: t.ref } });
    ok(res, t, 201);
  }),
);

/** تعديل العطاء قبل الترسية؛ العميل يفتحه أو يغلقه أو يلغيه */
accountRouter.patch(
  '/tenders/:id',
  asyncHandler(async (req, res) => {
    const input = tenderInput.partial().extend({ status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']).optional() }).parse(req.body);
    const current = await ownTender(req.auth!.sub, req.params.id);
    if (['AWARDED', 'CANCELLED'].includes(current.status)) throw conflict('لا يمكن تعديل عطاء مُرسّى أو ملغي');
    await checkService(input.serviceId);
    const t = await prisma.tender.update({ where: { id: current.id }, data: tenderData(input) });
    await audit({ actorType: 'customer', action: 'update', entity: 'tender', entityId: t.id, meta: JSON.parse(JSON.stringify({ status: input.status })) });
    ok(res, t);
  }),
);

accountRouter.post(
  '/tenders/:id/attachments',
  formLimiter,
  uploadGuard(40),
  memoryUpload(15, 5).array('files', 5),
  asyncHandler(async (req, res) => {
    const t = await ownTender(req.auth!.sub, req.params.id);
    const added = await storeAttachments(req.files as Express.Multer.File[], 'tenders');
    ok(res, await prisma.tender.update({ where: { id: t.id }, data: { attachments: [...((t.attachments as Attachment[]) ?? []), ...added] } }));
  }),
);

/** تتبّع طلب العميل: الحالة وسجلها (بدون أسماء الموظفين)، وموظف التوصيل أثناء التوصيل فقط */
accountRouter.get(
  '/orders/:id/tracking',
  asyncHandler(async (req, res) => {
    const o = await prisma.order.findFirst({
      where: { id: req.params.id, customerId: req.auth!.sub, deletedAt: null },
      select: {
        id: true,
        code: true,
        number: true,
        deliveryStatus: true,
        financialStatus: true,
        codAmount: true,
        deliveredAt: true,
        driver: { select: { name: true, phone: true } },
        statusEvents: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, fromStatus: true, createdAt: true } },
      },
    });
    if (!o) throw notFound('الطلب غير موجود');
    const onTheWay = ['PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(o.deliveryStatus);
    ok(res, {
      ...o,
      driver: onTheWay ? o.driver : null,
      // التغييرات الفعلية فقط (بدون أحداث القبول/الإرسال الداخلية)
      timeline: o.statusEvents.filter((e) => e.fromStatus !== e.toStatus).map((e) => ({ status: e.toStatus, at: e.createdAt })),
      statusEvents: undefined,
    });
  }),
);

// ───────────── رمز التحقق بالبريد (OTP) ─────────────

const otpPurpose = z.enum(['VERIFY_EMAIL', 'SENSITIVE_ACTION']);

/** يرسل رمز تحقق إلى بريد العميل (تأكيد البريد أو تأكيد عملية حساسة) */
accountRouter.post(
  '/email-otp/send',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { purpose } = z.object({ purpose: otpPurpose.default('VERIFY_EMAIL') }).parse(req.body ?? {});
    const c = await prisma.customer.findUnique({ where: { id: req.auth!.sub }, select: { id: true, name: true, email: true, emailVerifiedAt: true } });
    if (!c) throw notFound('الحساب غير موجود');
    if (!c.email) throw conflict('أضف بريدًا إلكترونيًا لحسابك أولًا');
    if (purpose === 'VERIFY_EMAIL' && c.emailVerifiedAt) throw conflict('بريدك مؤكَّد مسبقًا');
    const r = await issueEmailOtp({ purpose, subject: { type: 'customer', id: c.id }, to: { email: c.email, name: c.name }, ip: clientIp(req) });
    ok(res, r);
  }),
);

/** يتحقق من الرمز. عند تأكيد البريد يُسجَّل وقت التأكيد على الحساب */
accountRouter.post(
  '/email-otp/verify',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { purpose, code } = z.object({ purpose: otpPurpose.default('VERIFY_EMAIL'), code: z.string().trim().max(12) }).parse(req.body ?? {});
    const id = req.auth!.sub;
    const r = await verifyEmailOtp({ purpose, subject: { type: 'customer', id }, code });
    if (purpose === 'VERIFY_EMAIL') {
      // يُؤكَّد البريد الذي أُرسل إليه الرمز فقط (لو تغيّر بريد الحساب بعد الإرسال لا يُعتبر مؤكَّدًا)
      await prisma.customer.updateMany({ where: { id, email: r.email }, data: { emailVerifiedAt: new Date() } });
      await audit({ actorType: 'customer', action: 'email_verified', entity: 'customer', entityId: id });
    }
    ok(res, { verified: true, purpose });
  }),
);

/** مكافآت العميل: تميزه الشهري وكوبوناته الخاصة الصالحة (بياناته فقط) */
accountRouter.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const customerId = req.auth!.sub;
    const now = new Date();
    const [recognitions, coupons, rewards] = await Promise.all([
      prisma.recognition.findMany({ where: { customerId, revokedAt: null }, orderBy: { period: 'desc' }, take: 12, select: { id: true, period: true, title: true, createdAt: true } }),
      prisma.coupon.findMany({
        where: { customerId, active: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        orderBy: { createdAt: 'desc' },
        select: { id: true, code: true, name: true, type: true, value: true, maxDiscount: true, minOrder: true, startsAt: true, endsAt: true, usageLimit: true, usedCount: true, perCustomerLimit: true, categoryIds: true, productIds: true },
      }),
      prisma.reward.findMany({ where: { customerId, status: { not: 'REVOKED' } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, type: true, title: true, status: true, endsAt: true, createdAt: true } }),
    ]);
    const used = coupons.length
      ? await prisma.couponRedemption.groupBy({ by: ['couponId'], where: { customerId, couponId: { in: coupons.map((c) => c.id) } }, _count: { _all: true } })
      : [];
    ok(res, {
      recognitions,
      rewards,
      coupons: coupons
        .map((c) => ({ ...c, usedByMe: used.find((u) => u.couponId === c.id)?._count._all ?? 0 }))
        .filter((c) => c.usedByMe < c.perCustomerLimit && (c.usageLimit == null || c.usedCount < c.usageLimit)),
    });
  }),
);
