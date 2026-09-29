import { z } from 'zod';

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** بيانات المنتج الصناعية (B2B) — مشتركة بين الإدارة والمورد */
export const industrialFields = {
  sku: opt(60),
  partNumber: opt(80),
  manufacturer: opt(80),
  brand: opt(60),
  originCountry: opt(60),
  priceOnRequest: z.boolean().default(false),
  minOrderQty: z.coerce.number().int().min(1, 'الحد الأدنى للطلب 1 على الأقل').max(1_000_000).default(1),
  availability: z.enum(['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK']).default('IN_STOCK'),
  leadTimeDays: z.coerce.number().int().min(0).max(730).optional().nullable(),
  warranty: opt(120),
  videoUrl: z
    .union([z.string().trim().url('رابط الفيديو غير صحيح').max(300).refine((u) => u.startsWith('https://'), 'رابط الفيديو يبدأ بـ https://'), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => v || null),
  keywords: opt(500),
};

/** السعر: مطلوب ما لم يكن "السعر عند الطلب" */
export const priceField = z.coerce.number().min(0, 'السعر لا يكون سالبًا').max(10_000_000);

export function checkPrice(input: { price?: number; priceOnRequest?: boolean }) {
  if (!input.priceOnRequest && input.price !== undefined && input.price <= 0) return 'السعر يجب أن يكون أكبر من صفر، أو اختر "السعر عند الطلب"';
  return null;
}
