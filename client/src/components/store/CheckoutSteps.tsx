import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';
import { Icon } from '../ui';

const STEPS = [
  { label: 'السلة', to: '/cart' },
  { label: 'بيانات التوصيل', to: '/checkout' },
  { label: 'التأكيد' },
];

/** رأس مسار الشراء: عنوان + خطوات السلة ← البيانات ← التأكيد */
export function CheckoutHeader({ title, current, description }: { title: string; current: 0 | 1 | 2; description?: string }) {
  return (
    <header className="border-b border-line">
      <div className="container flex flex-col gap-5 py-7 md:flex-row md:items-end md:justify-between md:py-10">
        <div>
          <h1 className="text-[1.75rem] md:text-[2.25rem]">{title}</h1>
          {description && <p className="mt-2 text-muted">{description}</p>}
        </div>
        <ol className="flex items-center gap-2 text-sm" aria-label="خطوات الشراء">
          {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            const body = (
              <>
                <span
                  className={cx(
                    'grid h-6 w-6 place-items-center rounded-full text-xs font-bold',
                    done && 'bg-ink text-bg',
                    active && 'bg-primary text-primary-fg',
                    !done && !active && 'border border-line-strong text-muted',
                  )}
                >
                  {done ? <Icon name="check" className="h-3.5 w-3.5" /> : <span className="num">{i + 1}</span>}
                </span>
                <span className={cx(active ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-muted', !active && 'hidden sm:inline')}>{s.label}</span>
              </>
            );
            return (
              <li key={s.label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                {done && s.to && current < 2 ? (
                  <Link to={s.to} className="flex items-center gap-2 hover:underline">
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-center gap-2">{body}</span>
                )}
                {i < STEPS.length - 1 && <span className={cx('h-px w-6 sm:w-10', done ? 'bg-ink' : 'bg-line-strong')} aria-hidden />}
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}
