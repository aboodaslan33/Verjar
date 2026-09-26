import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from '../lib/format';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
type Ctx = { toast: (message: string, tone?: Toast['tone']) => void };

const ToastContext = createContext<Ctx>({ toast: () => {} });
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto w-full max-w-sm animate-fade-up rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lift',
              t.tone === 'success' && 'bg-inverse',
              t.tone === 'error' && 'bg-danger',
              t.tone === 'info' && 'bg-ink text-bg',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
