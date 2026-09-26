import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { verifyUnsubscribeToken } from '../../services/email.service';

export const emailRouter = Router();

const unsubInput = z.object({ c: z.string().min(1).max(64), t: z.string().min(1).max(64) });

/**
 * إلغاء الاشتراك في النشرة — من صفحة /unsubscribe في الموقع أو زر "إلغاء الاشتراك" في Gmail (One-Click).
 * الرابط موقّع (HMAC) فلا يمكن إلغاء اشتراك عميل آخر.
 */
emailRouter.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    const { c, t } = unsubInput.parse({ ...req.query, ...(typeof req.body === 'object' ? req.body : {}) });
    if (!verifyUnsubscribeToken(c, t)) throw badRequest('رابط إلغاء الاشتراك غير صالح');
    await prisma.customer.updateMany({ where: { id: c }, data: { emailOptIn: false } });
    ok(res, { unsubscribed: true });
  }),
);
