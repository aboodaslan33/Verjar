import { cx } from '../../lib/format';
import { Icon } from './Icon';

/**
 * مؤشر خطوات: شريط تقدم رفيع + أسماء الخطوات.
 * onStep (اختياري): يسمح بالرجوع لخطوة سابقة بالنقر.
 */
export function Stepper({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (i: number) => void }) {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 100;
  return (
    <nav aria-label="خطوات النموذج" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between text-sm sm:hidden">
        <span className="font-semibold text-ink">{steps[current]}</span>
        <span className="text-muted">
          الخطوة <span className="num">{current + 1}</span> من <span className="num">{steps.length}</span>
        </span>
      </div>
      <div className="relative h-[3px] rounded-full bg-line" aria-hidden>
        <span
          className="absolute inset-y-0 start-0 rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <ol className="mt-3 hidden grid-flow-col sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = done && onStep;
          const Tag = clickable ? 'button' : 'span';
          return (
            <li key={s} aria-current={active ? 'step' : undefined} className={cx(i === steps.length - 1 ? 'text-end' : i === 0 ? 'text-start' : 'text-center')}>
              <Tag
                {...(clickable ? { type: 'button' as const, onClick: () => onStep(i) } : {})}
                className={cx(
                  'inline-flex items-center gap-1.5 text-sm transition-colors',
                  active && 'font-semibold text-ink',
                  done && 'text-ink',
                  !done && !active && 'text-muted',
                  clickable && 'rounded-md hover:underline',
                )}
              >
                {done ? (
                  <Icon name="check" className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <span className={cx('num text-xs', active ? 'text-accent' : 'text-muted')}>{String(i + 1).padStart(2, '0')}</span>
                )}
                {s}
              </Tag>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
