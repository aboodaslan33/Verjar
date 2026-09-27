import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from '../lib/http';

type Db = Prisma.TransactionClient;

/** حقل مواصفات يحدده الأدمن لكل قسم (مثل المقاس للملابس) */
export const specFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,29}$/, 'مفتاح الحقل بأحرف إنجليزية صغيرة وأرقام فقط، مثل size'),
    label: z.string().trim().min(1, 'اسم الحقل مطلوب').max(40),
    type: z.enum(['text', 'number', 'select']).default('text'),
    options: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    required: z.boolean().default(false),
  })
  .refine((f) => f.type !== 'select' || f.options.length > 0, { message: 'أضف خيارًا واحدًا على الأقل', path: ['options'] });

export const specFieldsSchema = z
  .array(specFieldSchema)
  .max(20, 'الحد الأقصى 20 حقلًا')
  .refine((arr) => new Set(arr.map((f) => f.key)).size === arr.length, 'مفاتيح الحقول يجب ألا تتكرر');

export type SpecField = z.infer<typeof specFieldSchema>;

export function parseSpecFields(v: unknown): SpecField[] {
  const r = specFieldsSchema.safeParse(v);
  return r.success ? r.data : [];
}

/** الحقول الفعلية لقسم: حقول القسم الرئيسي ثم حقول القسم الفرعي (بدون تكرار المفاتيح) */
export function effectiveSpecFields(category: { specFields: unknown; parent?: { specFields: unknown } | null }): SpecField[] {
  const merged = new Map<string, SpecField>();
  for (const f of parseSpecFields(category.parent?.specFields)) merged.set(f.key, f);
  for (const f of parseSpecFields(category.specFields)) merged.set(f.key, f);
  return [...merged.values()];
}

export const specsInput = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({});

/** يتحقق من المواصفات حسب حقول القسم ويعيد نسخة نظيفة (يُهمل أي مفتاح غير معرّف) */
export function cleanSpecs(fields: SpecField[], input: Record<string, string | number | null>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = input[f.key];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (empty) {
      if (f.required) errors[`specs.${f.key}`] = `${f.label} مطلوب`;
      continue;
    }
    const s = String(raw).trim().slice(0, 200);
    if (f.type === 'number') {
      const n = Number(s);
      if (!Number.isFinite(n)) errors[`specs.${f.key}`] = `${f.label} يجب أن يكون رقمًا`;
      else out[f.key] = n;
    } else if (f.type === 'select') {
      if (!f.options.includes(s)) errors[`specs.${f.key}`] = `اختر ${f.label} من القائمة`;
      else out[f.key] = s;
    } else out[f.key] = s;
  }
  if (Object.keys(errors).length) throw badRequest('تحقق من المواصفات', { fields: errors });
  return out;
}

/** المواصفات للعرض: [{ label, value }] بترتيب حقول القسم */
export function specList(fields: SpecField[], specs: unknown): { key: string; label: string; value: string }[] {
  const s = (specs ?? {}) as Record<string, unknown>;
  return fields
    .filter((f) => s[f.key] !== undefined && s[f.key] !== null && s[f.key] !== '')
    .map((f) => ({ key: f.key, label: f.label, value: String(s[f.key]) }));
}

/** قسم قابل لإضافة منتجات عليه، مع حقوله الفعلية */
export async function categoryForProduct(db: Db, categoryId: string, opts: { visibleOnly?: boolean } = {}) {
  const cat = await db.category.findFirst({
    where: { id: categoryId, deletedAt: null, ...(opts.visibleOnly ? { visible: true } : {}) },
    include: { parent: true },
  });
  if (!cat || (cat.parent && (cat.parent.deletedAt || (opts.visibleOnly && !cat.parent.visible)))) {
    throw badRequest('القسم غير موجود', { fields: { categoryId: 'اختر القسم' } });
  }
  return { category: cat, fields: effectiveSpecFields(cat) };
}

/** شرط القسم الظاهر (والقسم الرئيسي ظاهر أيضًا إن وُجد) */
export const visibleCategoryWhere: Prisma.CategoryWhereInput = {
  deletedAt: null,
  visible: true,
  OR: [{ parentId: null }, { parent: { deletedAt: null, visible: true } }],
};

/** المنتجات المعروضة للزوار: ظاهرة، معتمدة، مورد فعّال، وقسم ظاهر */
export function publicProductWhere(extra: Prisma.ProductWhereInput = {}): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    visible: true,
    approvalStatus: 'APPROVED',
    vendor: { active: true },
    ...extra,
    category: { ...visibleCategoryWhere, ...((extra.category as Prisma.CategoryWhereInput | undefined) ?? {}) },
  };
}
