import type { Prisma } from '@prisma/client';
import { badRequest, notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { POLICIES, deleteStored, validateAndStore } from '../services/upload.service';

export type StoredDoc = { url: string; name: string; kind: string; publicId?: string | null };
export const MAX_PRODUCT_DOCS = 6;

const docsOf = (v: unknown) => (Array.isArray(v) ? (v as StoredDoc[]) : []);

/** ملفات فنية للمنتج (Datasheet / كتالوج / CAD) */
export async function addProductDocs(productId: string, files: Express.Multer.File[], where: Prisma.ProductWhereInput = {}) {
  const p = await prisma.product.findFirst({ where: { id: productId, deletedAt: null, ...where } });
  if (!p) throw notFound('المنتج غير موجود');
  if (!files.length) throw badRequest('اختر ملفًا');
  const current = docsOf(p.documents);
  if (current.length + files.length > MAX_PRODUCT_DOCS) throw badRequest(`الحد الأقصى ${MAX_PRODUCT_DOCS} ملفات لكل منتج`);
  const stored = await validateAndStore(files, POLICIES.technical, 'products/docs');
  const next = [...current, ...stored.map((f) => ({ url: f.url, name: f.originalName.slice(0, 120), kind: f.kind, publicId: f.publicId }))];
  await prisma.product.update({ where: { id: p.id }, data: { documents: next } });
  return next.map(({ publicId: _p, ...d }) => d);
}

export async function removeProductDoc(productId: string, index: number, where: Prisma.ProductWhereInput = {}) {
  const p = await prisma.product.findFirst({ where: { id: productId, deletedAt: null, ...where } });
  if (!p) throw notFound('المنتج غير موجود');
  const current = docsOf(p.documents);
  const doc = current[index];
  if (!doc) throw notFound('الملف غير موجود');
  const next = current.filter((_, i) => i !== index);
  await prisma.product.update({ where: { id: p.id }, data: { documents: next } });
  await deleteStored(doc.publicId ?? null, 'DOCUMENT').catch(() => undefined);
  return next.map(({ publicId: _p, ...d }) => d);
}
