import multer from 'multer';
import { MB } from '../services/upload.service';

/** multer بالذاكرة — التحقق الفعلي من النوع والحجم يتم في upload.service */
export const memoryUpload = (maxFileMb: number, maxFiles: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileMb * MB, files: maxFiles, fields: 50, fieldSize: 200 * 1024 },
  });
