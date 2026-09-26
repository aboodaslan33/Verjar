import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import type { MediaKind } from '@prisma/client';
import { env } from '../config/env';
import { badRequest } from '../lib/http';

/**
 * رفع الملفات: Cloudinary في الإنتاج (قرص Render مؤقت).
 * في التطوير والاختبارات بدون CLOUDINARY_URL تُحفظ الملفات في server/uploads.
 */

export const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (env.cloudinaryEnabled) {
  // مكتبة cloudinary تقرأ CLOUDINARY_URL من البيئة تلقائيًا
  cloudinary.config({ secure: true });
}

export type DetectedType = { mime: string; ext: string; kind: MediaKind };

/** كشف نوع الملف من محتواه الفعلي (magic bytes) وليس من الاسم */
export function sniff(buf: Buffer): DetectedType | null {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg', kind: 'IMAGE' };
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: 'png', kind: 'IMAGE' };
  if (hex.startsWith('474946383')) return { mime: 'image/gif', ext: 'gif', kind: 'IMAGE' };
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', kind: 'IMAGE' };
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (/^(heic|heix|mif1|msf1|hevc)/.test(brand)) return { mime: 'image/heic', ext: 'heic', kind: 'IMAGE' };
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: 'mov', kind: 'VIDEO' };
    return { mime: 'video/mp4', ext: 'mp4', kind: 'VIDEO' };
  }
  if (hex.startsWith('1a45dfa3')) return { mime: 'video/webm', ext: 'webm', kind: 'VIDEO' };
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', kind: 'DOCUMENT' };
  return null;
}

export type UploadPolicy = {
  /** الأنواع المسموحة */
  kinds: MediaKind[];
  /** الحد الأقصى بالبايت لكل نوع */
  maxBytes: Partial<Record<MediaKind, number>>;
};

export const MB = 1024 * 1024;

export const POLICIES = {
  photos: { kinds: ['IMAGE'], maxBytes: { IMAGE: 5 * MB } },
  designFiles: { kinds: ['IMAGE', 'DOCUMENT'], maxBytes: { IMAGE: 5 * MB, DOCUMENT: 10 * MB } },
  documents: { kinds: ['IMAGE', 'DOCUMENT'], maxBytes: { IMAGE: 5 * MB, DOCUMENT: 10 * MB } },
  pdfOnly: { kinds: ['DOCUMENT'], maxBytes: { DOCUMENT: 15 * MB } },
  productMedia: { kinds: ['IMAGE', 'VIDEO'], maxBytes: { IMAGE: 8 * MB, VIDEO: 60 * MB } },
} satisfies Record<string, UploadPolicy>;

const KIND_AR: Record<MediaKind, string> = { IMAGE: 'صورة', VIDEO: 'فيديو', DOCUMENT: 'ملف PDF' };

export function validateFile(file: Express.Multer.File, policy: UploadPolicy): DetectedType {
  const detected = sniff(file.buffer);
  if (!detected || !policy.kinds.includes(detected.kind)) {
    const allowed = policy.kinds.map((k) => KIND_AR[k]).join(' أو ');
    throw badRequest(`الملف "${file.originalname}" غير مدعوم. المسموح: ${allowed}`);
  }
  const max = policy.maxBytes[detected.kind];
  if (max && file.size > max) {
    throw badRequest(`حجم الملف "${file.originalname}" أكبر من ${Math.round(max / MB)} ميغابايت`);
  }
  return detected;
}

export type StoredFile = { url: string; publicId: string | null; kind: MediaKind; originalName: string };

export async function storeFile(file: Express.Multer.File, folder: string, detected: DetectedType): Promise<StoredFile> {
  if (env.cloudinaryEnabled) {
    const resourceType = detected.kind === 'VIDEO' ? 'video' : detected.kind === 'DOCUMENT' ? 'raw' : 'image';
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
          resource_type: resourceType,
          // ملفات raw تحتاج الامتداد في الاسم لتُحمّل بشكل صحيح
          ...(resourceType === 'raw' ? { public_id: `${randomUUID()}.${detected.ext}` } : {}),
        },
        (err, res) => (err || !res ? reject(err ?? new Error('upload failed')) : resolve(res)),
      );
      stream.end(file.buffer);
    });
    return { url: result.secure_url, publicId: result.public_id, kind: detected.kind, originalName: file.originalname };
  }

  const dir = path.join(LOCAL_UPLOAD_DIR, folder);
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${detected.ext}`;
  await fs.writeFile(path.join(dir, name), file.buffer);
  return {
    url: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/uploads/${folder}/${name}`,
    publicId: null,
    kind: detected.kind,
    originalName: file.originalname,
  };
}

/** تحقق من جميع الملفات أولًا ثم ارفعها — حتى لا يُرفع جزء ويفشل الباقي */
export async function validateAndStore(
  files: Express.Multer.File[] | undefined,
  policy: UploadPolicy,
  folder: string,
): Promise<StoredFile[]> {
  if (!files?.length) return [];
  const detected = files.map((f) => validateFile(f, policy));
  return Promise.all(files.map((f, i) => storeFile(f, folder, detected[i])));
}

export async function deleteStored(publicId: string | null | undefined, kind: MediaKind = 'IMAGE') {
  if (!publicId || !env.cloudinaryEnabled) return;
  const resourceType = kind === 'VIDEO' ? 'video' : kind === 'DOCUMENT' ? 'raw' : 'image';
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (e) {
    console.error('cloudinary destroy failed', e);
  }
}
