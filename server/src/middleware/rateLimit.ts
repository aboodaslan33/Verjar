import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

function limiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    // في الاختبارات نرفع الحد حتى لا تتأثر الاختبارات المتتالية
    limit: env.isTest ? 100_000 : limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { ok: false, data: null, error: { code: 'RATE_LIMIT', message } },
  });
}

/** نماذج الحجز والطلب: 20 طلبًا كل 15 دقيقة لكل IP */
export const formLimiter = limiter(15 * 60_000, 20, 'طلبات كثيرة خلال وقت قصير، حاول بعد قليل');

/** تسجيل الدخول و OTP: 10 محاولات كل 15 دقيقة */
export const authLimiter = limiter(15 * 60_000, 10, 'محاولات كثيرة، حاول بعد 15 دقيقة');

/** حد عام للـ API */
export const apiLimiter = limiter(60_000, 300, 'طلبات كثيرة، حاول بعد دقيقة');
