import { randomInt } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { getSettings, settingsSchema, updateSettings } from '../../services/settings.service';
import { whatsappMode } from '../../services/whatsapp.service';
import { env } from '../../config/env';
import { clientIp, forwardChain, isProxyAddress } from '../../lib/clientIp';
import { formLimiter } from '../../middleware/rateLimit';
import { emailReady, sendTransactional } from '../../services/email.service';
import { OTP_MINUTES } from '../../services/emailOtp.service';
import { renderOtpEmail } from '../../services/emailTemplates';

export const settingsRouter = Router();

/**
 * فحص كشف عنوان الزائر (للأدمن): يُظهر العنوان الذي تُحسب عليه حدود المحاولات
 * وسلسلة الوسطاء، للتأكد على الاستضافة أن كل زائر يُعرف بعنوانه وليس بعنوان الوسيط.
 */
settingsRouter.get('/network', (req, res) => {
  const chain = forwardChain(req).map((ip) => ({ ip, proxy: isProxyAddress(ip) }));
  ok(res, { clientIp: clientIp(req), chain });
});

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, {
      settings: await getSettings(),
      system: { whatsappMode: whatsappMode(), cloudinary: env.cloudinaryEnabled, email: env.emailEnabled },
    });
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const patch = settingsSchema.partial().parse(req.body);
    const s = await updateSettings(patch);
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'settings', meta: Object.keys(patch) });
    ok(res, s);
  }),
);

export const logsRouter = Router();

logsRouter.get(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.whatsAppLog.findMany({ orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.whatsAppLog.count(),
    ]);
    ok(res, paged(items, total, q));
  }),
);

logsRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
        ...pageArgs(q),
      }),
      prisma.auditLog.count(),
    ]);
    ok(res, paged(items, total, q));
  }),
);

// ───────────── معاينة واختبار رسائل البريد ─────────────

const purposeQ = z.object({ purpose: z.enum(['LOGIN_2FA', 'VERIFY_EMAIL', 'PASSWORD_RESET', 'SENSITIVE_ACTION']).default('LOGIN_2FA') });

/** معاينة قالب رمز التحقق بالبريد (HTML) ببيانات تجريبية */
settingsRouter.get(
  '/email/preview',
  asyncHandler(async (req, res) => {
    const { purpose } = purposeQ.parse(req.query);
    const mail = await renderOtpEmail({ name: 'أحمد السعدي', code: '482915', purpose, minutes: OTP_MINUTES, requestedAt: new Date(), ip: clientIp(req) });
    ok(res, { subject: mail.subject, html: mail.html, text: mail.text });
  }),
);

/** يرسل رسالة رمز تحقق تجريبية (رمز غير صالح للاستخدام) إلى بريد المستخدم الحالي أو بريد يحدده */
settingsRouter.post(
  '/email/test',
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = purposeQ.extend({ to: z.string().trim().toLowerCase().email('بريد غير صحيح').optional() }).parse(req.body ?? {});
    if (!emailReady()) throw badRequest('خدمة البريد غير مفعّلة: أضف SMTP_HOST وSMTP_USER وSMTP_PASS في إعدادات الخادم');
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { name: true, email: true } });
    const to = input.to ?? me.email;
    if (!to) throw badRequest('حدد بريدًا لإرسال الرسالة التجريبية', { field: 'to' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const mail = await renderOtpEmail({ name: me.name, code, purpose: input.purpose, minutes: OTP_MINUTES, requestedAt: new Date(), ip: clientIp(req) });
    await sendTransactional(to, { ...mail, subject: `[تجربة] ${mail.subject}` });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'email_test', entity: 'settings', meta: { to, purpose: input.purpose } });
    ok(res, { sentTo: to });
  }),
);
