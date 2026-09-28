import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import type { OtpPurpose } from '@prisma/client';
import { env } from '../config/env';
import { badRequest, tooMany } from '../lib/http';
import { prisma } from '../lib/prisma';
import { emailReady, sendTransactional } from './email.service';
import { renderOtpEmail } from './emailTemplates';

/**
 * رموز التحقق بالبريد (OTP) — جاهزة للتحقق الثنائي وتأكيد البريد وإعادة التعيين والعمليات الحساسة.
 *
 * الاستخدام:
 *   await issueEmailOtp({ purpose: 'LOGIN_2FA', subject: { type: 'customer', id }, to: { email, name }, ip })
 *   await verifyEmailOtp({ purpose: 'LOGIN_2FA', subject: { type: 'customer', id }, code })
 *
 * الأمان: 6 أرقام عشوائية آمنة، يُخزن HMAC للرمز فقط، صلاحية 10 دقائق، استخدام واحد،
 * 5 محاولات خاطئة كحد أقصى، رمز جديد يُبطل ما قبله، ومهلة 60 ثانية بين الإرسال وحد 5 رسائل بالساعة.
 */

export const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_PER_HOUR = 5;

export type OtpSubject = { type: 'customer' | 'user'; id: string };

const hashCode = (otpId: string, code: string) => createHmac('sha256', env.JWT_SECRET).update(`email-otp:${otpId}:${code}`).digest('hex');

/** يخفي البريد للعرض: sa****@gmail.com */
export function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const keep = user.length <= 2 ? 1 : 2;
  return `${user.slice(0, keep)}${'*'.repeat(Math.max(2, user.length - keep))}@${domain}`;
}

export async function issueEmailOtp(input: { purpose: OtpPurpose; subject: OtpSubject; to: { email: string; name: string }; ip?: string | null }) {
  const { purpose, subject, to } = input;
  if (!emailReady()) throw badRequest('خدمة البريد غير مفعّلة على الخادم');
  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.emailOtp.findMany({
    where: { subjectType: subject.type, subjectId: subject.id, purpose, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - recent[0].createdAt.getTime())) / 1000);
    throw tooMany(`انتظر ${wait} ثانية قبل طلب رمز جديد`);
  }
  if (recent.length >= MAX_PER_HOUR) throw tooMany('طلبت رموزًا كثيرة، حاول بعد ساعة');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  const otp = await prisma.$transaction(async (tx) => {
    // رمز جديد يُبطل كل الرموز السابقة لنفس الغرض
    await tx.emailOtp.updateMany({ where: { subjectType: subject.type, subjectId: subject.id, purpose, consumedAt: null }, data: { consumedAt: now } });
    const row = await tx.emailOtp.create({
      data: { purpose, subjectType: subject.type, subjectId: subject.id, email: to.email, codeHash: 'pending', expiresAt: new Date(now.getTime() + OTP_MINUTES * 60_000), ip: input.ip ?? null },
    });
    return tx.emailOtp.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });
  });

  const mail = await renderOtpEmail({ name: to.name, code, purpose, minutes: OTP_MINUTES, requestedAt: now, ip: input.ip });
  try {
    await sendTransactional(to.email, mail);
  } catch (e) {
    // فشل الإرسال: لا نترك رمزًا صالحًا لم يصل
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    console.error('email otp send failed', e);
    throw badRequest('تعذر إرسال الرمز إلى بريدك، حاول لاحقًا');
  }
  return { sentTo: maskEmail(to.email), expiresAt: otp.expiresAt, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function verifyEmailOtp(input: { purpose: OtpPurpose; subject: OtpSubject; code: string }) {
  const code = input.code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw badRequest('الرمز 6 أرقام', { field: 'code' });
  const otp = await prisma.emailOtp.findFirst({
    where: { subjectType: input.subject.type, subjectId: input.subject.id, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.expiresAt < new Date()) throw badRequest('انتهت صلاحية الرمز، اطلب رمزًا جديدًا', { field: 'code' });
  if (otp.attempts >= MAX_ATTEMPTS) throw badRequest('محاولات كثيرة، اطلب رمزًا جديدًا', { field: 'code' });
  const a = Buffer.from(hashCode(otp.id, code));
  const b = Buffer.from(otp.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const r = await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - r.attempts;
    throw badRequest(left > 0 ? `رمز التحقق غير صحيح (متبقي ${left} محاولات)` : 'محاولات كثيرة، اطلب رمزًا جديدًا', { field: 'code' });
  }
  // استهلاك ذري: لا يُقبل نفس الرمز مرتين حتى مع طلبين متزامنين
  const used = await prisma.emailOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (used.count !== 1) throw badRequest('انتهت صلاحية الرمز، اطلب رمزًا جديدًا', { field: 'code' });
  return { email: otp.email };
}

/** تنظيف الرموز القديمة (أكثر من يوم) */
export async function purgeOldEmailOtps() {
  await prisma.emailOtp.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } });
}
