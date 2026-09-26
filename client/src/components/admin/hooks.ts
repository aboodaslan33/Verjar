import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { ApiError } from '../../lib/api';
import { useLive } from './live';

function toApiError(e: unknown) {
  return e instanceof ApiError ? e : new ApiError('حدث خطأ غير متوقع', 0, 'UNKNOWN');
}

/**
 * تحميل بيانات مع إبقاء البيانات السابقة أثناء إعادة التحميل (بدون وميض).
 * live: يعيد التحميل بصمت عند وصول أحداث SSE.
 * keep: يُبقي البيانات السابقة (باهتة) عند تغيير الفلاتر بدل هيكل التحميل.
 */
export function useAdminQuery<T>(fn: () => Promise<T>, deps: unknown[], opts: { live?: boolean; keep?: boolean } = {}) {
  const { version } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const hasData = useRef(false);
  const keep = useRef(opts.keep);
  keep.current = opts.keep;

  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    // عند تغيّر المعطيات (مثل رقم عنصر آخر) لا نعرض بيانات العنصر السابق، إلا في القوائم (keep)
    if (!silent && !keep.current && hasData.current) {
      setData(null);
      hasData.current = false;
    }
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (id === seq.current) {
        setData(d);
        hasData.current = true;
      }
    } catch (e) {
      if (id === seq.current) setError(toApiError(e));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void run(false), deps);

  const liveVersion = opts.live ? version : 0;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (opts.live) void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveVersion]);

  const reload = useCallback(() => run(true), [run]);
  const retry = useCallback(() => run(false), [run]);
  return { data, error, loading: loading && !data, refreshing, reload, retry, setData };
}

/** فلاتر القوائم مخزنة في رابط الصفحة (?status=NEW&page=2) */
export function useFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => {
    const v = {} as Record<K, string>;
    for (const k of keys) v[k] = params.get(k) ?? '';
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const set = useCallback(
    (patch: Partial<Record<K | 'page', string>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);
  const active = keys.some((k) => values[k]);
  return { values, page, set, setPage: (p: number) => set({ page: p > 1 ? String(p) : '' } as never), clear, active };
}

/** تنفيذ عملية مع حالة تحميل وأخطاء حقول ورسالة نجاح */
export function useMutation() {
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <R>(key: string, fn: () => Promise<R>, success?: string): Promise<R | undefined> => {
      setPending(key);
      setFieldErrors({});
      setError(null);
      try {
        const r = await fn();
        if (success) toast(success, 'success');
        return r;
      } catch (e) {
        const err = toApiError(e);
        const fields = { ...err.fields };
        if (err.field && !fields[err.field]) fields[err.field] = err.message;
        setFieldErrors(fields);
        setError(err.message);
        toast(err.message, 'error');
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [toast],
  );

  const reset = useCallback(() => {
    setFieldErrors({});
    setError(null);
  }, []);

  return { run, pending, fieldErrors, error, reset, busy: pending !== null };
}

/** مؤخِّر قيمة (للبحث أثناء الكتابة) */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
