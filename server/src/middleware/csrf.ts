import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { forbidden } from '../lib/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const trusted = new Set([...env.clientOrigins, originOf(env.PUBLIC_API_URL)].filter((o): o is string => Boolean(o)));

/**
 * حماية CSRF بفحص المصدر: أي طلب يغيّر البيانات (POST/PUT/PATCH/DELETE) من متصفح
 * يجب أن يأتي من الواجهة (CLIENT_URL) أو من نفس دومين الـ API.
 * الطلبات بدون Origin و Referer (أدوات مثل curl أو خوادم) مسموحة لأنها لا تحمل كوكيز المتصفح تلقائيًا.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.get('origin');
  const source = header && header !== 'null' ? originOf(header) : header === 'null' ? 'null' : originOf(req.get('referer'));
  if (!source) return next();
  const self = new Set([`${req.protocol}://${req.get('host')}`]);
  const fwdHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (fwdHost) self.add(`${req.protocol}://${fwdHost}`);
  if (self.has(source) || trusted.has(source)) return next();
  if (!env.isTest) console.warn(`[csrf] رُفض طلب ${req.method} ${req.originalUrl} من مصدر غير موثوق: ${source}`);
  next(forbidden('تم رفض الطلب لأسباب أمنية (مصدر غير موثوق). حدّث الصفحة وحاول مرة أخرى.'));
}
