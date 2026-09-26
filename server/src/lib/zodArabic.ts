import { z } from 'zod';

/** رسائل Zod الافتراضية بالعربية (للحقول التي لا تحمل رسالة مخصصة) */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'هذا الحقل مطلوب' };
      if (issue.expected === 'number' || issue.expected === 'integer') return { message: 'يجب إدخال رقم' };
      if (issue.expected === 'boolean') return { message: 'اختر نعم أو لا' };
      return { message: 'قيمة غير صحيحة' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `يجب ألا يقل عن ${issue.minimum} حرف` };
      if (issue.type === 'array') return { message: `اختر ${issue.minimum} على الأقل` };
      if (issue.type === 'number') return { message: `يجب ألا يقل عن ${issue.minimum}` };
      return { message: 'القيمة صغيرة جدًا' };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `يجب ألا يزيد عن ${issue.maximum} حرف` };
      if (issue.type === 'array') return { message: `الحد الأقصى ${issue.maximum}` };
      if (issue.type === 'number') return { message: `يجب ألا يزيد عن ${issue.maximum}` };
      return { message: 'القيمة كبيرة جدًا' };
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: 'اختر قيمة من القائمة' };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'بريد إلكتروني غير صالح' };
      return { message: 'صيغة غير صحيحة' };
    case z.ZodIssueCode.invalid_date:
      return { message: 'تاريخ غير صحيح' };
    case z.ZodIssueCode.not_multiple_of:
      return { message: 'قيمة غير صحيحة' };
    default:
      return { message: ctx.defaultError };
  }
});
