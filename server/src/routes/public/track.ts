import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, notFound, ok } from '../../lib/http';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { formLimiter } from '../../middleware/rateLimit';

/**
 * تتبّع طلب بدون حساب: رقم الطلب (FG-ORD-…) + رقم هاتف العميل معًا.
 * يعيد الحالة وأوقاتها فقط — لا عنوان ولا مبالغ ولا بيانات موظفين، ولا رمز التحقق أبدًا.
 */
export const trackRouter = Router();

trackRouter.get(
  '/',
  formLimiter,
  asyncHandler(async (req, res) => {
    const q = z.object({ code: z.string().trim().max(30), phone: z.string().trim().max(30) }).parse(req.query);
    const phone = normalizePhone(q.phone);
    const code = q.code.toUpperCase().replace(/\s/g, '');
    const o = phone
      ? await prisma.order.findFirst({
          where: { code, phone, deletedAt: null },
          select: { code: true, deliveryStatus: true, createdAt: true, deliveredAt: true, statusEvents: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, fromStatus: true, createdAt: true } } },
        })
      : null;
    // نفس الرسالة لرقم طلب غير موجود أو هاتف لا يطابق (لا نكشف وجود الطلب)
    if (!o) throw notFound('لم نجد طلبًا بهذا الرقم وهذا الهاتف');
    ok(res, {
      code: o.code,
      status: o.deliveryStatus,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      timeline: o.statusEvents.filter((e) => e.fromStatus !== e.toStatus).map((e) => ({ status: e.toStatus, at: e.createdAt })),
    });
  }),
);
