import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/ui/Icon';
import { cx } from '../lib/format';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; tone: Tone };
type Ctx = { toast: (message: string, tone?: Tone) => void };

const ToastContext = createContext<Ctx>({ toast: () => {} });
let seq = 0;
const DURATION = 4000;
const ICON: Record<Tone, IconName> = { success: 'check', error: 'alert', info: 'info' };

/**
 * إشعارات عابرة: تظهر أسفل الشاشة (فوق شريط الجوال السفلي)، بحد أقصى 3،
 * مع شريط يوضح الوقت المتبقي، وتتوقف عند المرور بالمؤشر.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = 'success') => {
      const id = ++seq;
      setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, tone }].slice(-3));
      timers.current.set(id, window.setTimeout(() => dismiss(id), DURATION));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(var(--tabbar-h) + 1rem)' }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="anim-toast pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg bg-inverse py-3 pe-2 ps-3.5 text-sm text-inverse-fg shadow-overlay"
          >
            <span
              className={cx(
                'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full',
                t.tone === 'success' && 'bg-primary text-primary-fg',
                t.tone === 'error' && 'bg-danger text-white',
                t.tone === 'info' && 'bg-inverse-fg/15 text-inverse-fg',
              )}
            >
              <Icon name={ICON[t.tone]} className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 flex-1 font-medium leading-relaxed">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-inverse-fg/60 transition-colors hover:bg-inverse-fg/10 hover:text-inverse-fg"
              aria-label="إغلاق الإشعار"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
            <span
              className={cx('absolute inset-x-0 bottom-0 h-0.5 origin-left', t.tone === 'error' ? 'bg-danger' : 'bg-primary')}
              style={{ animation: `progress ${DURATION}ms linear forwards` }}
              aria-hidden
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
