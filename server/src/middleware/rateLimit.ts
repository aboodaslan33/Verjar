import type { Request } from 'express';
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

/** تسجيل الدخول والتسجيل واستعادة كلمة المرور: 10 محاولات كل 15 دقيقة لكل IP */
export const authLimiter = limiter(15 * 60_000, 10, 'محاولات كثيرة، حاول بعد 15 دقيقة');

/** حد عام للـ API */
export const apiLimiter = limiter(60_000, 300, 'طلبات كثيرة، حاول بعد دقيقة');

/**
 * حد لكل حساب (وليس لكل IP): 10 محاولات فاشلة كل 15 دقيقة على نفس الهاتف/البريد.
 * يحمي من تخمين كلمة مرور حساب معيّن من عناوين IP متعددة. المحاولات الناجحة لا تُحسب.
 */
export function accountLimiter(field: string) {
  const keyOf = (req: Request) => {
    const v = (req.body as Record<string, unknown> | undefined)?.[field];
    if (typeof v !== 'string' || !v.trim()) return null;
    // توحيد بسيط: أحرف صغيرة، بدون مسافات، الأرقام العربية → لاتينية، آخر 9 أرقام للهاتف
    const s = v.trim().toLowerCase().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s\-()+]/g, '');
    return s.includes('@') ? s : s.replace(/\D/g, '').slice(-9) || s;
  };
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: env.isTest ? 100_000 : 10,
    skipSuccessfulRequests: true,
    skip: (req) => keyOf(req) === null,
    keyGenerator: (req) => `${req.path}:${keyOf(req)}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      ok: false,
      data: null,
      error: { code: 'RATE_LIMIT', message: 'محاولات كثيرة على هذا الحساب، حاول بعد 15 دقيقة' },
    },
  });
}
