import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/** تحميل بيانات مع حالات loading / error / data و إعادة تحميل */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      if (id === seq.current) setData(d);
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e : new ApiError('حدث خطأ غير متوقع', 0, 'UNKNOWN'));
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
    document.title = title ? `${title} — مجموعة فرجا` : 'مجموعة فرجا | Farja Group — صيانة وبناء ودهان وأعمال معدنية في الأردن';
  }, [title]);
}
