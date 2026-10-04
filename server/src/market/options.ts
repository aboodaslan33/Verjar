import { z } from 'zod';
import { badRequest } from '../lib/http';

/**
 * خيارات المنتج التي يختارها العميل (لون، مقاس، خامة…):
 * [{ name: "اللون", values: [{ label: "أحمر", mediaId: "صورة هذا اللون" }] }]
 * المخزون مشترك بين الخيارات، والخيار المختار يُحفظ مع بند الطلب.
 */
export type ProductOption = { name: string; values: { label: string; mediaId?: string | null }[] };
export type Selection = { name: string; value: string }[];

export const MAX_OPTION_GROUPS = 3;
export const MAX_OPTION_VALUES = 30;

export const optionsInput = z
  .array(
    z.object({
      name: z.string().trim().min(1, 'اكتب اسم الخيار (مثل اللون)').max(30),
      values: z
        .array(z.object({ label: z.string().trim().min(1, 'اكتب القيمة').max(40), mediaId: z.string().max(40).nullable().optional() }))
        .min(1, 'أضف قيمة واحدة على الأقل')
        .max(MAX_OPTION_VALUES, `الحد الأقصى ${MAX_OPTION_VALUES} قيمة`),
    }),
  )
  .max(MAX_OPTION_GROUPS, `الحد الأقصى ${MAX_OPTION_GROUPS} خيارات للمنتج`)
  .superRefine((groups, ctx) => {
    const names = new Set<string>();
    groups.forEach((g, i) => {
      if (names.has(g.name)) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: `الخيار "${g.name}" مكرر` });
      names.add(g.name);
      const labels = new Set<string>();
      g.values.forEach((v, j) => {
        if (labels.has(v.label)) ctx.addIssue({ code: 'custom', path: [i, 'values', j, 'label'], message: `القيمة "${v.label}" مكررة` });
        labels.add(v.label);
      });
    });
  });

/** الصورة المرتبطة بكل قيمة يجب أن تكون من صور هذا المنتج — غيرها يُحذف */
export function cleanOptions(groups: ProductOption[], mediaIds: Set<string>): ProductOption[] {
  return groups.map((g) => ({
    name: g.name,
    values: g.values.map((v) => ({ label: v.label, mediaId: v.mediaId && mediaIds.has(v.mediaId) ? v.mediaId : null })),
  }));
}

export function parseOptions(raw: unknown): ProductOption[] {
  return Array.isArray(raw) ? (raw as ProductOption[]).filter((g) => g && typeof g.name === 'string' && Array.isArray(g.values)) : [];
}

export const selectionInput = z
  .array(z.object({ name: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(40) }))
  .max(MAX_OPTION_GROUPS)
  .optional();

/**
 * يتحقق في الخادم من اختيار العميل: قيمة واحدة صحيحة لكل خيار في المنتج.
 * المنتج بلا خيارات يتجاهل أي اختيار مُرسل.
 */
export function resolveSelection(productName: string, raw: unknown, chosen: Selection | undefined): Selection {
  const groups = parseOptions(raw);
  if (!groups.length) return [];
  return groups.map((g) => {
    const pick = chosen?.find((c) => c.name === g.name);
    if (!pick) throw badRequest(`اختر ${g.name} لـ "${productName}"`);
    if (!g.values.some((v) => v.label === pick.value)) throw badRequest(`"${pick.value}" غير متوفر في ${g.name} لـ "${productName}"`);
    return { name: g.name, value: pick.value };
  });
}

export const variantText = (sel: Selection) => sel.map((s) => `${s.name}: ${s.value}`).join(' · ');
export const selectionKey = (productId: string, sel: Selection) => `${productId}|${sel.map((s) => `${s.name}=${s.value}`).join('|')}`;
