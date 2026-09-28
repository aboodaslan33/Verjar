import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { audit } from '../lib/audit';
import { HttpError, asyncHandler, badRequest, conflict, ok, unauthorized } from '../lib/http';
import { normalizePhone } from '../lib/phone';
import { prisma } from '../lib/prisma';
import { clearAuthCookie, isAdminRole, passwordFingerprint, principalOf, requireAdmin, requireAuth, requireCustomer, setAuthCookie } from '../middleware/auth';
import { accountLimiter, authLimiter } from '../middleware/rateLimit';
import { emailReady, sendPasswordReset } from '../services/email.service';
import { beginLoginAttempt, invalidCredentials, lockKey, loginFailed, loginSucceeded } from '../services/loginLock.service';
import { isWeakPassword, nameField } from '../validators/common';

export const authRouter = Router();

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  passwordHash: string | null;
  emailOptIn: boolean;
};

/** بيانات العميل للواجهة، مع متجره إن كان لديه صلاحية مورد فعّالة */
async function customerPublic(c: CustomerRow) {
  const vendor = await prisma.vendor.findFirst({ where: { customerId: c.id, active: true }, select: { id: true, name: true, slug: true } });
  return {
    role: 'CUSTOMER' as const,
    vendor,
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    companyName: c.companyName,
    hasPassword: Boolean(c.passwordHash),
    emailOptIn: c.emailOptIn,
  };
}

function adminPublic(u: { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF' }) {
  return { role: u.role, id: u.id, name: u.name, email: u.email };
}

/** بريد حساب إدارة/موظف: لا يُسمح لعميل باستخدامه (وإلا حُجب دخول الأدمن من صفحة الدخول الموحّدة) */
const isStaffEmail = async (email: string) => Boolean(await prisma.user.findUnique({ where: { email }, select: { id: true } }));

/** هاش ثابت للمقارنة عند عدم وجود الحساب (زمن استجابة متقارب) */
const DUMMY_HASH = bcrypt.hashSync('farjar-dummy-password', 10);
const BCRYPT_ROUNDS = 11;

/** رقم هاتف أردني فقط: 07XXXXXXXX (يقبل الأرقام العربية و +962) */
const jordanPhoneField = z
  .string({ required_error: 'رقم الهاتف مطلوب' })
  .trim()
  .min(1, 'رقم الهاتف مطلوب')
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n || !/^9627[789]\d{7}$/.test(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل رقم هاتف أردني صحيح بالصيغة 07XXXXXXXX' });
      return z.NEVER;
    }
    return n;
  });

const emailField = z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح').max(150, 'البريد الإلكتروني طويل جدًا');

const passwordField = z
  .string({ required_error: 'كلمة المرور مطلوبة' })
  .min(8, 'كلمة المرور 8 أحرف على الأقل')
  .max(100, 'كلمة المرور طويلة جدًا')
  .refine((v) => !isWeakPassword(v), 'كلمة المرور سهلة التخمين، اختر كلمة أقوى (امزج حروفًا وأرقامًا)');

// ───────────── الجلسة الموحّدة ─────────────

/** بيانات المستخدم الحالي (عميل أو أدمن) — تُستدعى عند إقلاع الواجهة */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const a = req.auth!;
    if (isAdminRole(a.role)) {
      const u = await prisma.user.findUnique({ where: { id: a.sub } });
      if (!u || !u.active) {
        clearAuthCookie(res);
        throw unauthorized('انتهت الجلسة، سجّل الدخول مجددًا');
      }
      return ok(res, adminPublic(u));
    }
    const c = await prisma.customer.findUnique({ where: { id: a.sub } });
    if (!c || c.deletedAt) {
      clearAuthCookie(res);
      throw unauthorized('انتهت الجلسة، سجّل الدخول مجددًا');
    }
    return ok(res, await customerPublic(c));
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
});

/** تسجيل حساب عميل جديد */
authRouter.post(
  '/register',
  authLimiter,
  accountLimiter('phone'),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: nameField,
        phone: jordanPhoneField,
        email: z
          .union([emailField, z.literal('')])
          .optional()
          .nullable()
          .transform((v) => v || null),
        password: passwordField,
        /** موافقة على استلام أخبار المنتجات والخدمات الجديدة بالبريد */
        emailOptIn: z.boolean().default(true),
        /** رقم مرجع حجز/طلب سابق — مطلوب فقط إذا كان للرقم حجوزات سابقة كضيف */
        ref: z.string().trim().max(30).optional(),
      })
      .parse(req.body);

    const existing = await prisma.customer.findUnique({ where: { phone: input.phone } });
    if (existing && existing.passwordHash && !existing.deletedAt) {
      throw conflict('هذا الرقم مسجّل مسبقًا. سجّل الدخول بدلًا من ذلك.', { field: 'phone', code: 'PHONE_TAKEN' });
    }

    if (input.email) {
      const byEmail = await prisma.customer.findUnique({ where: { email: input.email }, select: { id: true } });
      if ((byEmail && byEmail.id !== existing?.id) || (await isStaffEmail(input.email))) {
        throw conflict('هذا البريد مستخدم لحساب آخر', { field: 'email', code: 'EMAIL_TAKEN' });
      }
    }

    // رقم استُخدم سابقًا في حجز كضيف: نطلب رقم مرجع لإثبات ملكية الرقم قبل ربط الحجوزات بالحساب
    if (existing) {
      const where = { customerId: existing.id, deletedAt: null };
      // أي سجل مرتبط بالرقم (حتى العقود والملفات والدفعات) يتطلب إثبات الملكية
      const counts = await Promise.all([
        prisma.booking.count({ where }),
        prisma.order.count({ where }),
        prisma.corporateRequest.count({ where }),
        prisma.contract.count({ where }),
        prisma.quoteFile.count({ where }),
        prisma.payment.count({ where }),
      ]);
      if (counts.some((n) => n > 0)) {
        if (!input.ref) {
          throw new HttpError(
            409,
            'لهذا الرقم حجوزات أو طلبات سابقة. أدخل رقم المرجع لأحدها (مثل B-7K2M9Q) لتأكيد أن الرقم لك.',
            'CLAIM_REQUIRED',
            { field: 'ref' },
          );
        }
        const ref = input.ref.toUpperCase().replace(/\s/g, '');
        const refWhere = { ref, customerId: existing.id };
        const [rb, ro, rr] = await Promise.all([
          prisma.booking.findFirst({ where: refWhere, select: { id: true } }),
          prisma.order.findFirst({ where: refWhere, select: { id: true } }),
          prisma.corporateRequest.findFirst({ where: refWhere, select: { id: true } }),
        ]);
        if (!rb && !ro && !rr) throw badRequest('رقم المرجع غير صحيح لهذا الرقم', { field: 'ref' });
      }
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const now = new Date();
    const data = { name: input.name, email: input.email, passwordHash, registeredAt: now, lastLoginAt: now, emailOptIn: input.emailOptIn };
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { ...data, email: input.email ?? existing.email, deletedAt: null, otpHash: null, otpExpiresAt: null },
        })
      : await prisma.customer.create({ data: { ...data, phone: input.phone } });

    setAuthCookie(res, principalOf(customer));
    await audit({ actorType: 'customer', action: existing ? 'register_claim' : 'register', entity: 'customer', entityId: customer.id });
    ok(res, await customerPublic(customer), 201);
  }),
);

/**
 * دخول برقم الهاتف أو البريد + كلمة المرور.
 * بريد حساب إدارة (غير مستخدم لعميل) يُدخل للوحة التحكم مباشرة.
 */
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { identifier, password } = z
      .object({
        identifier: z.string({ required_error: 'أدخل رقم الهاتف أو البريد الإلكتروني' }).trim().min(1, 'أدخل رقم الهاتف أو البريد الإلكتروني').max(150),
        password: z.string({ required_error: 'أدخل كلمة المرور' }).min(1, 'أدخل كلمة المرور').max(100),
      })
      .parse(req.body);

    const phone = identifier.includes('@') ? null : normalizePhone(identifier);
    if (!identifier.includes('@') && !phone) throw badRequest('رقم الهاتف غير صحيح (مثال: 0791234567)', { field: 'identifier' });

    // قفل بعد 5 محاولات خاطئة (تُحسب المحاولة قبل فحص كلمة المرور)
    const key = lockKey(identifier);
    const attempt = await beginLoginAttempt(key);
    const invalid = async (): Promise<never> => {
      throw invalidCredentials('رقم الهاتف أو البريد أو كلمة المرور غير صحيحة', await loginFailed(key, attempt));
    };

    const customer = phone
      ? await prisma.customer.findUnique({ where: { phone } })
      : await prisma.customer.findUnique({ where: { email: identifier.toLowerCase() } });

    if ((!customer || customer.deletedAt) && identifier.includes('@')) {
      const user = await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
      if (user) {
        if (!user.active || !(await bcrypt.compare(password, user.passwordHash))) return invalid();
        await loginSucceeded(key);
        const updatedUser = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        setAuthCookie(res, principalOf(updatedUser));
        await audit({ actorId: user.id, actorType: 'admin', action: 'login', entity: 'user', entityId: user.id });
        return ok(res, adminPublic(updatedUser));
      }
    }
    if (!customer || customer.deletedAt) {
      await bcrypt.compare(password, DUMMY_HASH);
      return invalid();
    }
    if (!customer.passwordHash) {
      throw new HttpError(
        401,
        'هذا الرقم غير مرتبط بكلمة مرور بعد. أنشئ حسابًا بنفس الرقم لإكمال التسجيل.',
        'NO_PASSWORD',
      );
    }
    if (!(await bcrypt.compare(password, customer.passwordHash))) return invalid();

    await loginSucceeded(key);
    const updated = await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
    setAuthCookie(res, principalOf(updated));
    return ok(res, await customerPublic(updated));
  }),
);

// ───────────── نسيت كلمة المرور ─────────────

const RESET_TTL_S = 60 * 60;

/** طلب رابط إعادة التعيين بالبريد — الرد نفسه دائمًا حتى لا يكشف وجود الحساب */
authRouter.post(
  '/password/forgot',
  authLimiter,
  accountLimiter('email'),
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailField }).parse(req.body);
    if (!emailReady()) {
      throw new HttpError(503, 'استعادة كلمة المرور بالبريد غير متاحة حاليًا. تواصل معنا على واتساب لتعيين كلمة مرور مؤقتة.', 'EMAIL_DISABLED');
    }
    const c = await prisma.customer.findUnique({ where: { email } });
    if (c && !c.deletedAt) {
      const token = jwt.sign({ sub: c.id, purpose: 'reset', pv: passwordFingerprint(c.passwordHash) }, env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: RESET_TTL_S,
      });
      const url = `${env.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendPasswordReset(email, c.name, url);
      } catch (e) {
        console.error('password reset email failed', e);
      }
    }
    ok(res, { message: 'إذا كان البريد مسجّلًا لدينا ستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة خلال دقائق.' });
  }),
);

/** تعيين كلمة مرور جديدة من رابط البريد (صالح لساعة ولمرة واحدة) */
authRouter.post(
  '/password/reset',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(10).max(2000), password: passwordField }).parse(req.body);
    const invalid = () => badRequest('الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.', { field: 'token' });
    let p: { sub?: string; purpose?: string; pv?: string };
    try {
      p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as typeof p;
    } catch {
      throw invalid();
    }
    if (p.purpose !== 'reset' || !p.sub) throw invalid();
    const c = await prisma.customer.findUnique({ where: { id: p.sub } });
    // بصمة كلمة المرور تجعل الرابط صالحًا لمرة واحدة: بعد التغيير لا يعود يطابق
    if (!c || c.deletedAt || p.pv !== passwordFingerprint(c.passwordHash)) throw invalid();
    const updated = await prisma.customer.update({
      where: { id: c.id },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), lastLoginAt: new Date() },
    });
    setAuthCookie(res, principalOf(updated));
    await audit({ actorType: 'customer', action: 'password_reset', entity: 'customer', entityId: c.id });
    ok(res, await customerPublic(updated));
  }),
);

/** تعديل بيانات العميل (الاسم والبريد) */
authRouter.patch(
  '/profile',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: nameField.optional(),
        email: z
          .union([emailField, z.literal('')])
          .optional()
          .nullable()
          .transform((v) => (v === undefined ? undefined : v || null)),
        emailOptIn: z.boolean().optional(),
      })
      .parse(req.body);
    if (input.email) {
      const other = await prisma.customer.findUnique({ where: { email: input.email }, select: { id: true } });
      if ((other && other.id !== req.auth!.sub) || (await isStaffEmail(input.email))) throw conflict('هذا البريد مستخدم لحساب آخر', { field: 'email' });
    }
    const c = await prisma.customer.update({ where: { id: req.auth!.sub }, data: input });
    if (input.name) setAuthCookie(res, principalOf(c));
    ok(res, await customerPublic(c));
  }),
);

// ───────────── الأدمن ─────────────

authRouter.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email('بريد غير صالح'), password: z.string().min(1, 'كلمة المرور مطلوبة').max(100) })
      .parse(req.body);
    const key = lockKey(email);
    const attempt = await beginLoginAttempt(key);
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : (await bcrypt.compare(password, DUMMY_HASH), false);
    if (!user || !user.active || !valid) {
      throw invalidCredentials('البريد أو كلمة المرور غير صحيحة', await loginFailed(key, attempt));
    }
    await loginSucceeded(key);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    setAuthCookie(res, principalOf(user));
    await audit({ actorId: user.id, actorType: 'admin', action: 'login', entity: 'user', entityId: user.id });
    ok(res, adminPublic(user));
  }),
);

authRouter.post('/admin/logout', (_req, res) => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
});

authRouter.get(
  '/admin/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
    if (!user || !user.active) throw unauthorized();
    ok(res, adminPublic(user));
  }),
);

authRouter.post(
  '/admin/password',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { current, next } = z
      .object({ current: z.string().min(1, 'أدخل كلمة المرور الحالية').max(100), next: passwordField })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw badRequest('كلمة المرور الحالية غير صحيحة', { field: 'current' });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS) } });
    // الجلسات الأخرى تنتهي (تغيّرت بصمة كلمة المرور) — الجلسة الحالية تُجدَّد
    setAuthCookie(res, principalOf(updated));
    await audit({ actorId: user.id, actorType: 'admin', action: 'password_change', entity: 'user', entityId: user.id });
    ok(res, { updated: true });
  }),
);

// ───────────── العملاء ─────────────

authRouter.post('/customer/logout', (_req, res) => {
  clearAuthCookie(res);
  ok(res, { loggedOut: true });
});

authRouter.get(
  '/customer/me',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findUnique({ where: { id: req.auth!.sub } });
    if (!c || c.deletedAt) throw unauthorized();
    ok(res, await customerPublic(c));
  }),
);

authRouter.post(
  '/customer/password',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const { current, password } = z
      .object({ current: z.string().max(100).optional(), password: passwordField })
      .parse(req.body);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: req.auth!.sub } });
    // تغيير كلمة مرور موجودة يتطلب الحالية (حماية من جلسة مسروقة)
    if (c.passwordHash && !(current && (await bcrypt.compare(current, c.passwordHash)))) {
      throw badRequest('كلمة المرور الحالية غير صحيحة', { field: 'current' });
    }
    const updated = await prisma.customer.update({ where: { id: c.id }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) } });
    setAuthCookie(res, principalOf(updated));
    await audit({ actorType: 'customer', action: 'password_change', entity: 'customer', entityId: c.id });
    ok(res, { updated: true });
  }),
);
