import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL مطلوب'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET يجب أن يكون 16 حرفًا على الأقل'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** عدد البروكسيات أمام السيرفر (لمعرفة IP العميل الحقيقي في حدود المحاولات) */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  ADMIN_WHATSAPP: z.string().default('962780192930'),
  /** link (افتراضي): الموقع يفتح واتساب برسالة جاهزة. cloud: إرسال تلقائي عبر Cloud API (يتطلب WA_TOKEN و WA_PHONE_ID صالحين) */
  WA_MODE: z.enum(['link', 'cloud']).default('link'),
  WA_TOKEN: z.string().optional().default(''),
  WA_PHONE_ID: z.string().optional().default(''),
  WA_API_VERSION: z.string().default('v21.0'),
  CLOUDINARY_URL: z.string().optional().default(''),
  // البريد (SMTP) للنشرة البريدية — مثال Gmail: smtp.gmail.com / 465 / البريد / App Password
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM_NAME: z.string().default('مجموعة فرجا'),
  CLOUDINARY_FOLDER: z.string().default('verjar'),
});

const parsed = schema.safeParse(process.env);
// قيمة المثال في .env.example لا تصلح للإنتاج: أي شخص يعرفها يستطيع تزوير الجلسات
if (parsed.success && parsed.data.NODE_ENV === 'production' && /change-me/i.test(parsed.data.JWT_SECRET)) {
  // eslint-disable-next-line no-console
  console.error('JWT_SECRET ما زال قيمة المثال — ضع قيمة عشوائية طويلة في متغيرات البيئة');
  process.exit(1);
}
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('إعدادات البيئة غير صحيحة:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  waCloudEnabled: parsed.data.WA_MODE === 'cloud' && Boolean(parsed.data.WA_TOKEN && parsed.data.WA_PHONE_ID),
  cloudinaryEnabled: Boolean(parsed.data.CLOUDINARY_URL),
  emailEnabled: Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASS),
  /** رابط الواجهة العام (أول قيمة في CLIENT_URL) — لروابط البريد */
  siteUrl: parsed.data.CLIENT_URL.split(',')[0].trim().replace(/\/$/, ''),
};
