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
