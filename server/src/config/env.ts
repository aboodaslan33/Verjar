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
  WA_TOKEN: z.string().optional().default(''),
  WA_PHONE_ID: z.string().optional().default(''),
  WA_API_VERSION: z.string().default('v21.0'),
  CLOUDINARY_URL: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('verjar'),
});

const parsed = schema.safeParse(process.env);
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
  waCloudEnabled: Boolean(parsed.data.WA_TOKEN && parsed.data.WA_PHONE_ID),
  cloudinaryEnabled: Boolean(parsed.data.CLOUDINARY_URL),
};
