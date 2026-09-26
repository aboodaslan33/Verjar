import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/http';
import { MB } from '../services/upload.service';

/** multer بالذاكرة — التحقق الفعلي من النوع والحجم يتم في upload.service */
export const memoryUpload = (maxFileMb: number, maxFiles: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileMb * MB, files: maxFiles, fields: 50, fieldSize: 200 * 1024 },
  });

/**
 * حماية الذاكرة عند الرفع (الملفات تُحمّل في الذاكرة قبل فحصها):
 * - رفض الطلب مبكرًا إذا تجاوز حجمه الكلي maxTotalMb (من Content-Length)
 * - حد أقصى لعدد طلبات الرفع المتزامنة على مستوى السيرفر
 */
let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 4;

export function uploadGuard(maxTotalMb: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('multipart/form-data')) return next();
    const length = Number(req.get('content-length'));
    // المتصفحات ترسل Content-Length دائمًا مع FormData — الطلب بدونه (chunked) يُرفض حتى لا يتجاوز الحد
    if (!Number.isFinite(length) || length <= 0) {
      return next(new HttpError(411, 'طلب غير صالح: حجم البيانات غير محدد', 'LENGTH_REQUIRED'));
    }
    if (length > maxTotalMb * MB) {
      return next(new HttpError(413, `حجم الملفات أكبر من المسموح (${maxTotalMb} ميغابايت كحد أقصى للطلب)`, 'PAYLOAD_TOO_LARGE'));
    }
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      return next(new HttpError(503, 'الخادم مشغول برفع ملفات أخرى، حاول بعد لحظات', 'BUSY'));
    }
    activeUploads++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeUploads--;
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}
