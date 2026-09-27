import { cx } from '../../lib/format';
import { Icon } from '../ui';

/** محدد الكمية (+ / −) مقيّد بالمخزون */
export function QtyStepper({
  value,
  max,
  onChange,
  labelledBy,
  size = 'md',
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  labelledBy?: string;
  size?: 'sm' | 'md';
}) {
  const cap = Math.max(1, max);
  const btn = cx(
    'grid place-items-center text-ink transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40',
    size === 'sm' ? 'h-11 w-11' : 'h-12 w-12',
  );
  return (
    <div role="group" aria-labelledby={labelledBy} className="inline-flex items-center overflow-hidden rounded-lg border border-line-strong bg-surface">
      <button type="button" className={btn} onClick={() => onChange(Math.min(cap, value + 1))} disabled={value >= cap} aria-label="زيادة الكمية">
        <Icon name="plus" className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={cap}
        value={value}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(1, Math.min(cap, n)));
        }}
        aria-label="الكمية"
        className={cx('ltr border-x border-line bg-transparent text-center font-semibold text-ink focus:outline-none', size === 'sm' ? 'h-11 w-12' : 'h-12 w-14')}
      />
      <button type="button" className={btn} onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="إنقاص الكمية">
        <Icon name="minus" className="h-4 w-4" />
      </button>
    </div>
  );
}
