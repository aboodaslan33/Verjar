import { FAILURES, FLOW, STATUS_LABEL, type DeliveryStatus } from '../../lib/delivery';
import { cx, formatDate } from '../../lib/format';
import { Icon } from '../ui';

/** المراحل التي يراها المورد والعميل (بدون المراحل المالية الداخلية) */
const PUBLIC_STEPS: DeliveryStatus[] = ['NEW', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

/**
 * شريط تقدّم الطلب + سجل مختصر للحالات. يُستخدم في صفحة التتبّع وحساب العميل ولوحة المورد.
 */
export function DeliveryTimeline({ status, timeline }: { status: DeliveryStatus; timeline: { status: DeliveryStatus; at: string }[] }) {
  const stopped = FAILURES.includes(status) || status === 'CANCELLED' || status === 'RESCHEDULED';
  // PICKUP_ASSIGNED يُعرض ضمن "قيد التجهيز"، والمراحل المالية ضمن "تم التسليم"
  const rank = (s: DeliveryStatus) => {
    const i = FLOW.indexOf(s);
    if (i < 0) return -1;
    if (s === 'PICKUP_ASSIGNED') return PUBLIC_STEPS.indexOf('ACCEPTED');
    if (i >= FLOW.indexOf('DELIVERED')) return PUBLIC_STEPS.indexOf('DELIVERED');
    return PUBLIC_STEPS.indexOf(s);
  };
  // عند التعثر: آخر مرحلة وصلها الطلب قبل التوقف
  const reached = stopped ? Math.max(-1, ...timeline.map((e) => rank(e.status))) : rank(status);
  const at = (s: DeliveryStatus) => [...timeline].reverse().find((e) => rank(e.status) === PUBLIC_STEPS.indexOf(s))?.at;

  return (
    <div className="space-y-4">
      {stopped && (
        <p className={cx('rounded-xl px-3 py-2 text-sm font-semibold', status === 'RESCHEDULED' ? 'bg-sand-50 text-ink dark:bg-sand-700/15' : 'bg-danger/10 text-danger')}>
          {STATUS_LABEL[status]}
        </p>
      )}
      <ol className="space-y-0">
        {PUBLIC_STEPS.map((s, i) => {
          const done = i <= reached;
          const current = !stopped && i === reached;
          const time = done ? at(s) : undefined;
          return (
            <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
              {i < PUBLIC_STEPS.length - 1 && (
                <span className={cx('absolute start-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-0.5', i < reached ? 'bg-primary' : 'bg-line')} aria-hidden />
              )}
              <span
                className={cx(
                  'relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2',
                  done ? 'border-primary bg-primary text-white' : 'border-line bg-surface',
                  current && 'ring-4 ring-primary/20',
                )}
                aria-hidden
              >
                {done && <Icon name="check" className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cx('text-sm', done ? 'font-semibold text-ink' : 'text-muted')}>{STATUS_LABEL[s]}</p>
                {time && <p className="text-xs text-muted tabular-nums">{formatDate(time, true)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
