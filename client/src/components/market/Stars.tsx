import { cx } from '../../lib/format';

/** نجوم التقييم (للعرض) */
export function Stars({ value, className }: { value: number; className?: string }) {
  const full = Math.round(value);
  return (
    <span className={cx('inline-flex gap-0.5 text-primary', className)} role="img" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-4 w-4" fill={i <= full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}

/** إدخال تقييم من 1 إلى 5 */
export function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="flex items-center justify-between gap-3">
      <legend className="float-start text-sm">{label}</legend>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            aria-label={`${i} من 5`}
            aria-pressed={value === i}
            className={cx('grid h-9 w-9 place-items-center rounded-lg transition-colors', i <= value ? 'text-primary' : 'text-line-strong hover:text-primary/60')}
          >
            <svg viewBox="0 0 20 20" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
            </svg>
          </button>
        ))}
      </span>
    </fieldset>
  );
}
