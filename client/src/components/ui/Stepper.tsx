import { cx } from '../../lib/format';
import { Icon } from './Icon';

/** مؤشر خطوات النموذج */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="خطوات النموذج">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cx(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors',
                done && 'bg-brand-700 text-white',
                active && 'bg-sand-300 text-brand-900 ring-4 ring-sand-100 dark:ring-sand-700/30',
                !done && !active && 'bg-subtle text-muted',
              )}
            >
              {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cx('hidden truncate text-sm sm:block', active ? 'font-semibold text-ink' : 'text-muted')}>{s}</span>
            {i < steps.length - 1 && <span className={cx('h-px flex-1', done ? 'bg-brand-600' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
