import { z } from 'zod';
import { normalizePhone } from '../lib/phone';

export const phoneField = z
  .string({ required_error: 'رقم الهاتف مطلوب' })
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'رقم الهاتف غير صحيح (مثال: 0791234567)' });
      return z.NEVER;
    }
    return n;
  });

export const nameField = z
  .string({ required_error: 'الاسم مطلوب' })
  .trim()
  .min(2, 'الاسم قصير جدًا')
  .max(100, 'الاسم طويل جدًا');

export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `النص أطول من ${max} حرف`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const requiredText = (label: string, max = 2000) =>
  z
    .string({ required_error: `${label} مطلوب` })
    .trim()
    .min(1, `${label} مطلوب`)
    .max(max, `${label} أطول من ${max} حرف`);

export const latField = z.coerce.number().min(-90).max(90).optional().nullable();
export const lngField = z.coerce.number().min(-180).max(180).optional().nullable();

export const dateField = z
  .string({ required_error: 'التاريخ مطلوب' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة');

export const timeField = z
  .string({ required_error: 'الوقت مطلوب' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'صيغة الوقت غير صحيحة');

export const positiveNumber = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} يجب أن يكون رقمًا` }).positive(`${label} يجب أن يكون أكبر من صفر`).max(1_000_000);

export const positiveInt = (label: string, max = 1000) =>
  z.coerce
    .number({ invalid_type_error: `${label} يجب أن يكون رقمًا` })
    .int(`${label} يجب أن يكون عددًا صحيحًا`)
    .min(1, `${label} يجب أن يكون 1 على الأقل`)
    .max(max);

/** حقل نعم/لا يقبل true/false أو "true"/"false" */
export const boolField = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean({ required_error: 'اختر نعم أو لا' }));

/**
 * كلمات مرور شائعة أو بنمط متكرر/متسلسل (12345678، aaaaaaaa، password1…) تُرفض
 * لأنها أول ما يُجرَّب في التخمين. المقارنة بعد إزالة المسافات وتوحيد الأحرف.
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop', 'iloveyou', 'admin123', 'administrator',
  'welcome1', 'letmein1', 'abc12345', 'abcd1234', '1q2w3e4r', '1qaz2wsx', 'qwer1234', 'asdf1234', 'zxcvbnm1', 'farjar123', 'verjar123',
]);
export function isWeakPassword(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(s)) return true;
  if (/^(.)\1+$/.test(s)) return true; // حرف واحد مكرر
  if (/^\d+$/.test(s)) {
    // أرقام متسلسلة صعودًا أو نزولًا (12345678، 98765432) أو رقم هاتف 07XXXXXXXX
    const asc = '01234567890123456789';
    const desc = '98765432109876543210';
    if (asc.includes(s) || desc.includes(s) || /^07[789]\d{7}$/.test(s)) return true;
  }
  return false;
}
