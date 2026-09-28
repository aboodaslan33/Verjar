import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { BRAND } from './brand';
import { isEn } from './i18n/lang';

/** ذاكرة مؤقتة للصفحات العامة: العودة لصفحة زرتها تُظهر بياناتها فورًا ثم تُحدَّث بالخلفية */
const cache = new Map<string, unknown>();
const CACHE_MAX = 80;

export function clearAsyncCache() {
  cache.clear();
}

/**
 * تحميل بيانات مع حالات loading / error / data و إعادة تحميل.
 * cacheKey (اختياري): يعرض آخر نتيجة محفوظة فورًا (بدون هيكل تحميل) ويعيد الجلب بصمت.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const cached = cacheKey !== undefined && cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(cached === null);
  const seq = useRef(0);
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const run = useCallback(async () => {
    const id = ++seq.current;
    const key = keyRef.current;
    const hit = key !== undefined && cache.has(key);
    // مفتاح جديد غير محفوظ (منتج آخر مثلًا): لا نعرض بيانات المفتاح السابق
    if (hit) setData(cache.get(key!) as T);
    else if (key !== undefined) setData(null);
    setLoading(!hit);
    setError(null);
    try {
      const d = await fn();
      if (id === seq.current) setData(d);
      if (key !== undefined) {
        cache.delete(key);
        cache.set(key, d);
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
      }
    } catch (e) {
      if (id === seq.current && !hit) setError(e instanceof ApiError ? e : new ApiError('حدث خطأ غير متوقع', 0, 'UNKNOWN'));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, reload: run, setData };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const brand = isEn() ? BRAND.en : BRAND.ar;
    document.title = title ? `${title} — ${brand}` : isEn() ? `${BRAND.en} — ${BRAND.tagline}` : `${BRAND.ar} | ${BRAND.en} — ${BRAND.tagline}`;
  }, [title]);
}
