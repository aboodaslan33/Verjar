import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env';
import { audit } from '../lib/audit';
import { HttpError, asyncHandler, badRequest, ok, unauthorized } from '../lib/http';
import { prisma } from '../lib/prisma';
import { clearAuthCookie, requireAdmin, requireCustomer, setAuthCookie } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { otpMessage } from '../services/messages';
import { sendWhatsApp, whatsappMode } from '../services/whatsapp.service';
import { phoneField } from '../validators/common';

export const authRouter = Router();

// ───────────── الأدمن ─────────────

authRouter.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email('بريد غير صالح'), password: z.string().min(1, 'كلمة المرور مطلوبة') })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('البريد أو كلمة المرور غير صحيحة');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    setAuthCookie(res, { sub: user.id, role: user.role, name: user.name });
    await audit({ actorId: user.id, actorType: 'admin', action: 'login', entity: 'user', entityId: user.id });
    ok(res, { id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

authRouter.post('/admin/logout', (_req, res) => {
  clearAuthCookie(res, 'admin');
  ok(res, { loggedOut: true });
});

authRouter.get(
  '/admin/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.sub },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) throw unauthorized();
    ok(res, user);
  }),
);

authRouter.post(
  '/admin/password',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { current, next } = z
      .object({ current: z.string().min(1), next: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل') })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw badRequest('كلمة المرور الحالية غير صحيحة');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 11) } });
    ok(res, { updated: true });
  }),
);

// ───────────── العملاء ─────────────

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(phone: string, code: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function findCustomer(phone: string) {
  const c = await prisma.customer.findUnique({ where: { phone } });
  if (!c || c.deletedAt) {
    throw new HttpError(404, 'لا يوجد حساب بهذا الرقم. يُنشأ حسابك تلقائيًا عند أول حجز أو طلب.', 'NO_ACCOUNT');
  }
  return c;
}

function customerPublic(c: { id: string; name: string; phone: string; companyName: string | null; passwordHash: string | null }) {
  return { id: c.id, name: c.name, phone: c.phone, companyName: c.companyName, hasPassword: Boolean(c.passwordHash) };
}

/** طرق الدخول المتاحة للعميل */
authRouter.get('/customer/methods', (_req, res) => {
  ok(res, { otp: whatsappMode() === 'CLOUD_API' || !env.isProd, password: true, reference: true });
});

/** طلب رمز OTP — يُرسل عبر واتساب (Cloud API) */
authRouter.post(
  '/customer/otp/request',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone } = z.object({ phone: phoneField }).parse(req.body);
    const customer = await findCustomer(phone);
    const cloud = whatsappMode() === 'CLOUD_API';
    if (!cloud && env.isProd) {
      throw new HttpError(
        503,
        'الدخول برمز واتساب غير متاح حاليًا. ادخل برقم المرجع الموجود في رسالة الحجز أو الطلب.',
        'OTP_UNAVAILABLE',
      );
    }
    const code = String(randomInt(100000, 1000000));
    await prisma.customer.update({
      where: { id: customer.id },
      data: { otpHash: hashOtp(phone, code), otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 },
    });
    if (cloud) {
      const r = await sendWhatsApp(phone, otpMessage(code), { entityType: 'otp', entityId: customer.id });
      if (!r.sent) throw new HttpError(502, 'تعذر إرسال الرمز عبر واتساب، حاول لاحقًا', 'OTP_SEND_FAILED');
    }
    // في التطوير فقط يُعاد الرمز لتسهيل التجربة
    ok(res, { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, ...(!cloud && !env.isProd ? { devCode: code } : {}) });
  }),
);

authRouter.post(
  '/customer/otp/verify',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, code } = z
      .object({ phone: phoneField, code: z.string().trim().regex(/^\d{6}$/, 'الرمز 6 أرقام') })
      .parse(req.body);
    const c = await findCustomer(phone);
    if (!c.otpHash || !c.otpExpiresAt || c.otpExpiresAt < new Date()) throw badRequest('انتهت صلاحية الرمز، اطلب رمزًا جديدًا');
    if (c.otpAttempts >= OTP_MAX_ATTEMPTS) throw badRequest('محاولات كثيرة، اطلب رمزًا جديدًا');
    if (!safeEqual(c.otpHash, hashOtp(phone, code))) {
      await prisma.customer.update({ where: { id: c.id }, data: { otpAttempts: { increment: 1 } } });
      throw badRequest('الرمز غير صحيح');
    }
    const updated = await prisma.customer.update({
      where: { id: c.id },
      data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0, lastLoginAt: new Date() },
    });
    setAuthCookie(res, { sub: c.id, role: 'CUSTOMER', name: c.name });
    ok(res, customerPublic(updated));
  }),
);

/**
 * دخول العميل برقم الهاتف + (كلمة المرور أو رقم المرجع لأي حجز/طلب)
 */
authRouter.post(
  '/customer/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { phone, secret } = z
      .object({ phone: phoneField, secret: z.string().trim().min(1, 'أدخل كلمة المرور أو رقم المرجع').max(100) })
      .parse(req.body);
    const c = await findCustomer(phone);
    let valid = false;
    if (c.passwordHash) valid = await bcrypt.compare(secret, c.passwordHash);
    if (!valid) {
      const ref = secret.toUpperCase().replace(/\s/g, '');
      const where = { ref, customerId: c.id, deletedAt: null };
      const [b, o, r] = await Promise.all([
        prisma.booking.findFirst({ where, select: { id: true } }),
        prisma.order.findFirst({ where, select: { id: true } }),
        prisma.corporateRequest.findFirst({ where, select: { id: true } }),
      ]);
      valid = Boolean(b || o || r);
    }
    if (!valid) throw unauthorized('البيانات غير صحيحة. تأكد من الرقم وكلمة المرور أو رقم المرجع.');
    const updated = await prisma.customer.update({ where: { id: c.id }, data: { lastLoginAt: new Date() } });
    setAuthCookie(res, { sub: c.id, role: 'CUSTOMER', name: c.name });
    ok(res, customerPublic(updated));
  }),
);

authRouter.post('/customer/logout', (_req, res) => {
  clearAuthCookie(res, 'customer');
  ok(res, { loggedOut: true });
});

authRouter.get(
  '/customer/me',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: req.auth!.sub } });
    if (!c || c.deletedAt) throw unauthorized();
    ok(res, customerPublic(c));
  }),
);

authRouter.post(
  '/customer/password',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل').max(100) }).parse(req.body);
    await prisma.customer.update({ where: { id: req.auth!.sub }, data: { passwordHash: await bcrypt.hash(password, 11) } });
    ok(res, { updated: true });
  }),
);
