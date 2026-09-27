import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '../../lib/format';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * نافذة حوار: على الجوال تظهر كورقة من الأسفل، وعلى الشاشات الأكبر في المنتصف.
 * تحبس التركيز بداخلها، وتُغلق بـ Esc أو بالنقر على الخلفية، وتعيد التركيز لما كان قبلها.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const auto = ref.current?.querySelector<HTMLElement>('[autofocus],input:not([type=hidden]),select,textarea');
    (auto ?? ref.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="anim-fade absolute inset-0 bg-[rgb(20_20_21/0.55)]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          'anim-modal relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-overlay outline-none sm:rounded-xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
        )}
      >
        <span className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="-me-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink" aria-label="إغلاق">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-xl sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
