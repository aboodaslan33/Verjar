import { useEffect, useMemo, useRef, useState } from 'react';
import { useSite } from '../../context/SiteContext';
import { api, ApiError } from '../../lib/api';
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, cx, formatSlot, todayAmman, weekdayOf } from '../../lib/format';
import type { DaySlots } from '../../lib/types';
import { Button, Icon, Skeleton } from '../ui';

const monthFmt = new Intl.DateTimeFormat('ar-JO-u-nu-latn', { month: 'long', timeZone: 'UTC' });
const monthShort = (d: string) => monthFmt.format(new Date(`${d}T00:00:00Z`));
const dayNum = (d: string) => Number(d.slice(8, 10));

export function longDate(d: string) {
  return `${WEEKDAYS[weekdayOf(d)]} ${dayNum(d)} ${monthShort(d)} ${d.slice(0, 4)}`;
}

type Props = {
  date: string;
  time: string;
  onChange: (date: string, time: string) => void;
  error?: string;
  /** زيادته تعيد تحميل الأوقات (بعد تعارض من السيرفر) */
  reloadKey?: number;
};

/** اختيار اليوم (شريط أيام أفقي) ثم الوقت من الأوقات المتاحة */
export function SlotPicker({ date, time, onChange, error, reloadKey = 0 }: Props) {
  const { settings } = useSite();
  const today = todayAmman();
  const days = useMemo(
    () => Array.from({ length: settings.maxDaysAhead + 1 }, (_, i) => addDays(today, i)),
    [today, settings.maxDaysAhead],
  );
  const isWorking = (d: string) => settings.workingDays.includes(weekdayOf(d));

  const [data, setData] = useState<DaySlots | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  // اختيار أول يوم عمل تلقائيًا لعرض الأوقات مباشرة
  useEffect(() => {
    if (!date || !days.includes(date)) {
      const first = days.find(isWorking);
      if (first) onChange(first, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setLoading(true);
    setLoadError(null);
    api
      .get<DaySlots>('/bookings/slots', { date })
      .then((d) => {
        if (!live) return;
        setData(d);
        // إن أصبح الوقت المختار غير متاح نلغيه
        if (time && !d.slots.some((s) => s.time === time && s.available)) onChange(date, '');
      })
      .catch((e) => live && setLoadError(e instanceof ApiError ? e.message : 'تعذر تحميل الأوقات'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadKey, retry]);

  // إبقاء اليوم المختار ظاهرًا في الشريط
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [date]);

  const scroll = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * -260, behavior: 'smooth' });
  const available = data?.slots.filter((s) => s.available).length ?? 0;
  const gap = data?.gapHours ?? settings.bookingGapHours;

  return (
    <div data-field="time">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="label mb-0">اليوم</p>
          <p className="text-sm text-muted">{date ? longDate(date) : 'اختر يومًا'}</p>
        </div>
        <div className="hidden gap-1 sm:flex">
          <button type="button" onClick={() => scroll(-1)} className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:bg-subtle" aria-label="الأيام السابقة">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => scroll(1)} className="grid h-10 w-10 place-items-center rounded-lg border border-line hover:bg-subtle" aria-label="الأيام التالية">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={strip}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0"
        role="group"
        aria-label="الأيام المتاحة للحجز"
      >
        {days.map((d, i) => {
          const working = isWorking(d);
          const active = d === date;
          const showMonth = i === 0 || dayNum(d) === 1;
          return (
            <button
              key={d}
              type="button"
              disabled={!working}
              aria-pressed={active}
              aria-label={`${longDate(d)}${working ? '' : ' — عطلة'}`}
              onClick={() => onChange(d, '')}
              className={cx(
                'relative flex min-h-[4.75rem] w-[4.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-xl border text-center transition-colors',
                active
                  ? 'border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-500'
                  : working
                    ? 'border-line bg-surface hover:border-brand-400'
                    : 'cursor-not-allowed border-transparent bg-subtle text-muted/70',
              )}
            >
              <span className={cx('text-xs', active ? 'text-white/85' : 'text-muted')}>{i === 0 ? 'اليوم' : i === 1 ? 'غدًا' : WEEKDAYS_SHORT[weekdayOf(d)]}</span>
              <span className="text-xl font-bold leading-tight">{dayNum(d)}</span>
              <span className={cx('text-[10px]', active ? 'text-white/80' : 'text-muted', !showMonth && !active && 'opacity-0')}>
                {working ? monthShort(d) : 'عطلة'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="label mb-0">الوقت</p>
          {data?.open && !loading && (
            <span className="text-sm text-muted">
              <span className="ltr">{available}</span> وقت متاح
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="status" aria-label="جاري تحميل الأوقات">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm" role="alert">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((r) => r + 1)}>
              <Icon name="refresh" className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </div>
        ) : !data ? null : !data.open ? (
          <p className="rounded-xl bg-subtle p-4 text-sm text-muted">
            {data.reason === 'closed' ? 'هذا اليوم عطلة. اختر يومًا آخر.' : `الحجز متاح حتى ${settings.maxDaysAhead} يومًا من اليوم فقط.`}
          </p>
        ) : available === 0 ? (
          <>
            <SlotGrid data={data} time={time} onPick={(t) => onChange(date, t)} />
            <p className="mt-3 rounded-xl bg-sand-50 p-3 text-sm text-ink dark:bg-sand-700/15">
              لا توجد أوقات متاحة في هذا اليوم. اختر يومًا آخر من الشريط أعلاه.
            </p>
          </>
        ) : (
          <SlotGrid data={data} time={time} onPick={(t) => onChange(date, t)} />
        )}

        {error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            نترك <span className="ltr">{gap}</span> ساعات على الأقل بين كل موعد وآخر حتى يصل الفريق في وقته، لذلك تظهر
            الأوقات القريبة من حجوزات أخرى معطّلة.
          </span>
        </p>
      </div>
    </div>
  );
}

function SlotGrid({ data, time, onPick }: { data: DaySlots; time: string; onPick: (t: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="الأوقات">
      {data.slots.map((s) => {
        const active = s.time === time;
        return (
          <button
            key={s.time}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!s.available}
            onClick={() => onPick(s.time)}
            className={cx(
              'flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition-colors',
              active && 'border-brand-700 bg-brand-700 text-white dark:border-brand-500 dark:bg-brand-500',
              !active && s.available && 'border-line bg-surface font-semibold hover:border-brand-400',
              !s.available && 'cursor-not-allowed border-transparent bg-subtle text-muted',
            )}
          >
            <span className={cx('text-[15px]', !s.available && 'line-through decoration-muted/60')}>{formatSlot(s.time)}</span>
            {!s.available && <span className="text-[11px]">{s.reason === 'booked' ? 'محجوز' : 'مضى'}</span>}
          </button>
        );
      })}
    </div>
  );
}
