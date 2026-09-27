import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http';

function zodToFields(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, data: null, error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields = zodToFields(err);
    return res.status(400).json({
      ok: false,
      data: null,
      error: { code: 'VALIDATION', message: Object.values(fields)[0] ?? 'البيانات غير صحيحة', fields },
    });
  }
  if (err instanceof HttpError) {
    // أخطاء حقول محددة (مثل المواصفات) تُعرض بجانب الحقل كما في أخطاء zod
    const fields = (err.details as { fields?: Record<string, string> } | undefined)?.fields;
    return res.status(err.status).json({
      ok: false,
      data: null,
      error: { code: err.code, message: err.message, details: err.details, ...(fields ? { fields } : {}) },
    });
  }
  if (err instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'حجم أحد الملفات أكبر من المسموح',
      LIMIT_FILE_COUNT: 'عدد الملفات أكبر من المسموح',
      LIMIT_UNEXPECTED_FILE: 'عدد الملفات أكبر من المسموح أو حقل ملف غير متوقع',
    };
    return res.status(400).json({
      ok: false,
      data: null,
      error: { code: 'UPLOAD', message: messages[err.code] ?? 'تعذر رفع الملفات' },
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({ ok: false, data: null, error: { code: 'NOT_FOUND', message: 'العنصر غير موجود' } });
    }
    if (err.code === 'P2002') {
      return res.status(409).json({ ok: false, data: null, error: { code: 'CONFLICT', message: 'القيمة مستخدمة مسبقًا' } });
    }
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ ok: false, data: null, error: { code: 'BAD_JSON', message: 'صيغة البيانات غير صحيحة' } });
  }
  console.error(err);
  return res.status(500).json({
    ok: false,
    data: null,
    error: { code: 'SERVER_ERROR', message: 'حدث خطأ في الخادم، حاول مرة أخرى' },
  });
}
