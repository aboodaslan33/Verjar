import { useEffect, useRef } from 'react';

/** تحويل الأرقام العربية/الفارسية والفاصلة العربية إلى صيغة قابلة للقراءة */
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,]/g, '.')
    .trim();
}

export function toNum(s: string): number {
  const n = normalizeDigits(s);
  if (n === '' || !/^\d*\.?\d+$|^\d+\.?$/.test(n)) return NaN;
  return Number(n);
}

/** نفس قواعد positiveNumber في السيرفر */
export function checkPositive(label: string, raw: string, max = 1_000_000): string | undefined {
  if (!raw.trim()) return `${label} مطلوب`;
  const n = toNum(raw);
  if (Number.isNaN(n)) return `${label} يجب أن يكون رقمًا`;
  if (n <= 0) return `${label} يجب أن يكون أكبر من صفر`;
  if (n > max) return `${label} أكبر من المسموح`;
  return undefined;
}

/** نفس قواعد positiveInt في السيرفر */
export function checkInt(label: string, raw: string, max: number): string | undefined {
  if (!raw.trim()) return `${label} مطلوب`;
  const n = toNum(raw);
  if (Number.isNaN(n)) return `${label} يجب أن يكون رقمًا`;
  if (!Number.isInteger(n)) return `${label} يجب أن يكون عددًا صحيحًا`;
  if (n < 1) return `${label} يجب أن يكون 1 على الأقل`;
  if (n > max) return `${label} يجب ألا يزيد عن ${max}`;
  return undefined;
}

export function checkText(label: string, raw: string, max: number, min = 1): string | undefined {
  const v = raw.trim();
  if (v.length < min) return min > 1 && v.length > 0 ? `${label} قصير جدًا` : `${label} مطلوب`;
  if (v.length > max) return `${label} أطول من ${max} حرف`;
  return undefined;
}

export function checkOptionalText(label: string, raw: string, max: number): string | undefined {
  return raw.trim().length > max ? `${label} أطول من ${max} حرف` : undefined;
}

/** مفتاح خطأ السيرفر "details.area" → "area" */
export function localKey(serverKey: string): string {
  return serverKey.replace(/^details\./, '').split('.')[0];
}

/** ينزل إلى أول حقل فيه خطأ ويضع المؤشر عليه */
export function focusFirstError(container: HTMLElement | null, orderedKeys: string[], errors: Record<string, string | undefined>) {
  if (!container) return;
  const key = orderedKeys.find((k) => errors[k]);
  const target =
    (key && container.querySelector<HTMLElement>(`[data-field="${key}"]`)) ||
    container.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = target.matches('input,textarea,select,button')
    ? target
    : target.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select,button');
  window.setTimeout(() => focusable?.focus({ preventScroll: true }), 250);
}

/** حفظ مسودة النموذج في sessionStorage (النصوص فقط — الملفات لا تُحفظ) */
export function loadDraft<T extends object>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function useDraftSaver(key: string, value: unknown, enabled: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!enabled) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        // التخزين غير متاح
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [key, value, enabled]);
}

export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // تجاهل
  }
}

export const MB = 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
