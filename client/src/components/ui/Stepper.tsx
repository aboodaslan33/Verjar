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
                done && 'bg-primary text-primary-fg',
                active && 'bg-brand-100 text-brand-900 ring-4 ring-brand-50 dark:bg-brand-500/20 dark:text-brand-200 dark:ring-brand-500/10',
                !done && !active && 'bg-subtle text-muted',
              )}
            >
              {done ? <Icon name="check" className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cx('hidden truncate text-sm sm:block', active ? 'font-semibold text-ink' : 'text-muted')}>{s}</span>
            {i < steps.length - 1 && <span className={cx('h-px flex-1', done ? 'bg-primary' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
