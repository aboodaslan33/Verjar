import { HttpError } from '../lib/http';
import { normalizePhone } from '../lib/phone';
import { prisma } from '../lib/prisma';

/**
 * قفل تسجيل الدخول بعد المحاولات الخاطئة (محفوظ في قاعدة البيانات):
 * - 5 محاولات خاطئة على نفس الهاتف/البريد ← قفل 10 دقائق
 * - كل قفل تالٍ يضاعف المدة (20، 40، ...) حتى 24 ساعة
 * - الدخول الناجح يصفّر العداد، ويُنسى السجل بعد 24 ساعة بلا محاولات
 * يُطبَّق على أي معرّف حتى لو لم يكن له حساب، فلا يكشف وجود الحسابات.
 */
export const MAX_ATTEMPTS = 5;
const BASE_LOCK_MIN = 10;
const MAX_LOCK_MIN = 24 * 60;
const FORGET_AFTER_MS = 24 * 60 * 60_000;

/** معرّف موحّد: البريد بأحرف صغيرة، والهاتف بالصيغة الدولية */
export function lockKey(identifier: string): string {
  const s = identifier.trim().toLowerCase();
  if (s.includes('@')) return `e:${s}`;
  const phone = normalizePhone(s);
  return `p:${phone ?? s.replace(/\D/g, '').slice(-9)}`;
}

function lockedError(until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new HttpError(
    429,
    `تم إيقاف تسجيل الدخول مؤقتًا بسبب محاولات خاطئة متكررة. حاول مرة أخرى بعد ${minutes} ${minutes === 1 ? 'دقيقة' : minutes <= 10 ? 'دقائق' : 'دقيقة'}.`,
    'LOGIN_LOCKED',
    { retryAfterSeconds: Math.ceil((until.getTime() - Date.now()) / 1000) },
  );
}

async function lockNow(key: string): Promise<Date> {
  const row = await prisma.loginLock.findUnique({ where: { key } });
  const level = (row?.level ?? 0) + 1;
  const minutes = Math.min(BASE_LOCK_MIN * 2 ** (level - 1), MAX_LOCK_MIN);
  const until = new Date(Date.now() + minutes * 60_000);
  await prisma.loginLock.update({ where: { key }, data: { failures: 0, level, lockedUntil: until } });
  return until;
}

/**
 * تُستدعى قبل فحص كلمة المرور: ترفض إن كان المعرّف مقفولًا، وتحجز محاولة
 * (تُعدّ قبل الفحص حتى لا تتجاوز الطلبات المتزامنة الحد). تعيد رقم هذه المحاولة.
 */
export async function beginLoginAttempt(key: string): Promise<number> {
  const now = Date.now();
  const existing = await prisma.loginLock.findUnique({ where: { key } });
  if (existing?.lockedUntil && existing.lockedUntil.getTime() > now) throw lockedError(existing.lockedUntil);
  if (existing && now - existing.updatedAt.getTime() > FORGET_AFTER_MS) {
    await prisma.loginLock.update({ where: { key }, data: { failures: 0, level: 0, lockedUntil: null } });
  }
  const row = await prisma.loginLock.upsert({
    where: { key },
    create: { key, failures: 1 },
    update: { failures: { increment: 1 } },
  });
  if (row.failures > MAX_ATTEMPTS) throw lockedError(await lockNow(key));
  return row.failures;
}

/** محاولة خاطئة: عند بلوغ الحد يُقفل المعرّف. تعيد عدد المحاولات المتبقية */
export async function loginFailed(key: string, attempt: number): Promise<number> {
  if (attempt >= MAX_ATTEMPTS) throw lockedError(await lockNow(key));
  return MAX_ATTEMPTS - attempt;
}

export async function loginSucceeded(key: string) {
  await prisma.loginLock.deleteMany({ where: { key } });
}

/** رسالة الخطأ مع تنبيه عند اقتراب القفل */
export function invalidCredentials(message: string, remaining: number) {
  const warn = remaining <= 2 ? ` بقي لك ${remaining === 1 ? 'محاولة واحدة' : 'محاولتان'} قبل إيقاف الدخول مؤقتًا.` : '';
  return new HttpError(401, `${message}.${warn}`, 'UNAUTHORIZED', { remaining });
}
