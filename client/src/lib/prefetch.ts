import { useEffect } from 'react';

type Entry = [RegExp, () => Promise<unknown>, boolean];

const done = new Set<() => Promise<unknown>>();
function load(fn: () => Promise<unknown>) {
  if (done.has(fn)) return;
  done.add(fn);
  fn().catch(() => done.delete(fn));
}

/** اتصال بطيء أو توفير البيانات: لا نحمّل مسبقًا في الخلفية */
function constrained() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData || (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)));
}

/**
 * تنقّل أسرع: كود الصفحة يُحمَّل قبل الضغط —
 * عند مرور المؤشر أو لمس أي رابط داخلي، والصفحات الأساسية بهدوء بعد أول تحميل.
 */
export function usePrefetchRoutes(routes: Entry[]) {
  useEffect(() => {
    const match = (path: string) => routes.find(([re]) => re.test(path))?.[1];
    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.origin !== location.origin) return;
      const fn = match(a.pathname);
      if (fn) load(fn);
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('touchstart', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);

    let idle: number | undefined;
    const warm = () => {
      if (constrained()) return;
      const queue = routes.filter(([, , core]) => core).map(([, fn]) => fn);
      const step = () => {
        const fn = queue.shift();
        if (!fn) return;
        load(fn);
        idle = window.setTimeout(step, 250);
      };
      step();
    };
    const start = window.setTimeout(() => {
      if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(warm);
      else warm();
    }, 2500);
    return () => {
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('touchstart', onIntent);
      document.removeEventListener('focusin', onIntent);
      clearTimeout(start);
      clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
