import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { STATUS_DOT, URGENCY_LABEL } from '../../components/admin/labels';
import { StatusOptions } from '../../components/admin/StatusSelect';
import type { BookingRow, CalendarItem, Technician } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterInput, FilterSelect, SearchInput } from '../../components/admin/ui';
import { Button, ErrorState, Icon, Skeleton, StatusBadge, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import {
  BOOKING_TYPE_LABEL,
  STATUS_LABEL,
  WEEKDAYS_SHORT,
  cx,
  displayPhone,
  formatDate,
  formatSlot,
  formatTime,
  todayAmman,
} from '../../lib/format';
import type { BookingType, Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const TYPES = Object.keys(BOOKING_TYPE_LABEL) as BookingType[];
const FILTER_KEYS = ['status', 'type', 'urgency', 'technicianId', 'from', 'to', 'q'] as const;

export default function Bookings() {
  useDocumentTitle('الحجوزات');
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calendar' ? 'calendar' : 'table';

  const setView = (v: 'table' | 'calendar') =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(v === 'calendar' ? {} : prev);
        if (v === 'calendar') n.set('view', 'calendar');
        else n.delete('view');
        n.delete('month');
        return n;
      },
      { replace: true },
    );

  return (
    <AdminPage
      title="الحجوزات"
      description="كل حجوزات الكشف والدهان والبناء والأعمال المعدنية"
      actions={
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="طريقة العرض">
          {(
            [
              ['table', 'جدول'],
              ['calendar', 'تقويم'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cx(
                'rounded-lg px-4 py-1.5 text-sm font-medium',
                view === v ? 'bg-brand-700 text-white dark:bg-brand-500' : 'text-muted hover:text-ink',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      }
    >
      {view === 'table' ? <BookingsTable /> : <BookingsCalendar />}
    </AdminPage>
  );
}

function BookingsTable() {
  const f = useFilters(FILTER_KEYS);
  const { values: v, page } = f;
  const techs = useAdminQuery(() => api.get<Technician[]>('/admin/technicians'), []);
  const list = useAdminQuery(
    () => api.get<Paged<BookingRow>>('/admin/bookings', { ...v, page, pageSize: 20 }),
    [JSON.stringify(v), page],
    { live: true },
  );

  const columns: Column<BookingRow>[] = [
    {
      key: 'name',
      header: 'العميل',
      cell: (b) => (
        <span className="flex flex-col">
          <span>
            {b.name} <span className="text-xs font-normal text-muted">#{b.number}</span>
          </span>
          <span className="ltr text-start text-xs font-normal text-muted">{displayPhone(b.phone)}</span>
        </span>
      ),
    },
    { key: 'type', header: 'النوع', cell: (b) => BOOKING_TYPE_LABEL[b.type] },
    {
      key: 'when',
      header: 'الموعد',
      cell: (b) => (
        <span className="whitespace-nowrap">
          {formatDate(b.scheduledAt)} <span className="text-muted">· {formatTime(b.scheduledAt)}</span>
        </span>
      ),
    },
    { key: 'loc', header: 'الموقع', cell: (b) => <span className="line-clamp-1 max-w-[14rem]">{b.locationText}</span>, hideOnMobile: true },
    { key: 'tech', header: 'الفني', cell: (b) => b.technician?.name ?? <span className="text-muted">—</span> },
    {
      key: 'status',
      header: 'الحالة',
      cell: (b) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge status={b.status} />
          {b.urgency === 'EMERGENCY' && <Tag tone="danger">{URGENCY_LABEL.EMERGENCY}</Tag>}
        </span>
      ),
    },
  ];

  return (
    <>
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم، هاتف، رقم الحجز…" />
        <FilterSelect label="الحالة" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
          <StatusOptions />
        </FilterSelect>
        <FilterSelect label="النوع" value={v.type} onChange={(e) => f.set({ type: e.target.value })}>
          <option value="">كل الأنواع</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {BOOKING_TYPE_LABEL[t]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="الأولوية" value={v.urgency} onChange={(e) => f.set({ urgency: e.target.value })}>
          <option value="">الكل</option>
          <option value="NORMAL">عادي</option>
          <option value="EMERGENCY">طارئ</option>
        </FilterSelect>
        <FilterSelect label="الفني" value={v.technicianId} onChange={(e) => f.set({ technicianId: e.target.value })}>
          <option value="">كل الفنيين</option>
          {techs.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </FilterSelect>
        <FilterInput label="من تاريخ" type="date" className="ltr" value={v.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label="إلى تاريخ" type="date" className="ltr" value={v.to} onChange={(e) => f.set({ to: e.target.value })} />
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(b) => b.id}
        rowHref={(b) => `/admin/bookings/${b.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        rowClassName={(b) => (b.status === 'NEW' ? 'bg-sand-50/60 dark:bg-sand-700/10' : undefined)}
        empty={{
          title: f.active ? 'لا توجد حجوزات مطابقة' : 'لا توجد حجوزات بعد',
          description: f.active ? 'جرّب تغيير الفلاتر.' : 'ستظهر هنا الحجوزات فور وصولها من الموقع.',
          action: f.active ? (
            <Button variant="outline" size="sm" onClick={f.clear}>
              مسح الفلاتر
            </Button>
          ) : undefined,
        }}
      />
    </>
  );
}

// ───────────── التقويم ─────────────

function monthOf(date: string) {
  return date.slice(0, 7);
}
function shiftMonth(month: string, d: number) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
}
const MONTH_FMT = new Intl.DateTimeFormat('ar-JO-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function BookingsCalendar() {
  const [params, setParams] = useSearchParams();
  const today = todayAmman();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : monthOf(today);
  const setMonth = (m: string) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('view', 'calendar');
        n.set('month', m);
        return n;
      },
      { replace: true },
    );

  const q = useAdminQuery(() => api.get<CalendarItem[]>('/admin/bookings/calendar', { month }), [month], { live: true });

  const { cells, byDate } = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = first.getUTCDay(); // الأحد = 0 → أول عمود
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
    while (cells.length % 7) cells.push(null);
    const byDate = new Map<string, CalendarItem[]>();
    for (const it of q.data ?? []) {
      const list = byDate.get(it.localDate) ?? [];
      list.push(it);
      byDate.set(it.localDate, list);
    }
    return { cells, byDate };
  }, [month, q.data]);

  const [yy, mm] = month.split('-').map(Number);
  const monthLabel = MONTH_FMT.format(new Date(Date.UTC(yy, mm - 1, 1)));
  const count = q.data?.filter((b) => b.status !== 'CANCELLED').length ?? 0;
  const agenda = cells.filter((c): c is string => !!c && (byDate.get(c)?.length ?? 0) > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="الشهر السابق">
            <Icon name="chevronRight" className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[9rem] text-center text-lg font-semibold">{monthLabel}</h2>
          <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="الشهر التالي">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </Button>
          {month !== monthOf(today) && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(monthOf(today))}>
              اليوم
            </Button>
          )}
        </div>
        <p className="text-sm text-muted">{q.data ? `${count} حجز هذا الشهر` : ''}</p>
      </div>

      {q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.retry} />
      ) : (
        <>
          {/* شبكة الشهر — شاشات متوسطة فأكبر */}
          <div className={cx('card hidden overflow-hidden md:block', q.refreshing && 'opacity-80')}>
            <div className="grid grid-cols-7 border-b border-line bg-subtle/60 text-center text-xs font-medium text-muted">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const items = date ? byDate.get(date) ?? [] : [];
                return (
                  <div
                    key={i}
                    className={cx(
                      'min-h-[7.5rem] border-b border-e border-line p-1.5 [&:nth-child(7n)]:border-e-0',
                      !date && 'bg-subtle/40',
                      date === today && 'bg-sand-50 dark:bg-sand-700/10',
                    )}
                  >
                    {date && (
                      <>
                        <div className="mb-1 flex items-center justify-between px-1">
                          <span
                            className={cx(
                              'grid h-6 min-w-[1.5rem] place-items-center rounded-full text-xs font-semibold tabular-nums',
                              date === today ? 'bg-brand-700 text-white dark:bg-brand-500' : 'text-muted',
                            )}
                          >
                            {Number(date.slice(8))}
                          </span>
                          {items.length > 3 && <span className="text-[10px] text-muted">{items.length}</span>}
                        </div>
                        {q.loading ? (
                          i % 3 === 0 && <Skeleton className="h-5" />
                        ) : (
                          <ul className="space-y-1">
                            {items.slice(0, 4).map((b) => (
                              <li key={b.id}>
                                <CalendarEntry b={b} />
                              </li>
                            ))}
                            {items.length > 4 && <li className="px-1 text-[11px] text-muted">+{items.length - 4} أخرى</li>}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* قائمة أيام — الجوال */}
          <div className="md:hidden">
            {q.loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
              </div>
            ) : agenda.length === 0 ? (
              <p className="card p-6 text-center text-sm text-muted">لا توجد حجوزات في هذا الشهر.</p>
            ) : (
              <ul className="space-y-3">
                {agenda.map((d) => (
                  <li key={d} className="card overflow-hidden">
                    <p className={cx('border-b border-line px-4 py-2 text-sm font-semibold', d === today && 'bg-sand-50 dark:bg-sand-700/10')}>
                      {formatDate(`${d}T12:00:00Z`, false)}
                    </p>
                    <ul className="divide-y divide-line">
                      {byDate.get(d)!.map((b) => (
                        <li key={b.id}>
                          <Link to={`/admin/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_DOT[b.status])} />
                            <span className="w-16 shrink-0 text-sm font-semibold">{formatSlot(b.localTime)}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {b.name} · <span className="text-muted">{BOOKING_TYPE_LABEL[b.type]}</span>
                            </span>
                            <StatusBadge status={b.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="دليل الألوان">
            {Object.entries(STATUS_DOT).map(([s, c]) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cx('h-2.5 w-2.5 rounded-full', c)} />
                {STATUS_LABEL[s as keyof typeof STATUS_LABEL]}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CalendarEntry({ b }: { b: CalendarItem }) {
  return (
    <Link
      to={`/admin/bookings/${b.id}`}
      title={`${b.name} — ${BOOKING_TYPE_LABEL[b.type]} — ${STATUS_LABEL[b.status]}${b.technician ? ` — ${b.technician.name}` : ''}`}
      className={cx(
        'flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] leading-5 hover:border-brand-300',
        b.status === 'CANCELLED' && 'line-through opacity-60',
        b.urgency === 'EMERGENCY' && 'border-danger/50',
      )}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[b.status])} aria-hidden />
      <span className="shrink-0 font-semibold tabular-nums">{b.localTime}</span>
      <span className="truncate">{b.name}</span>
    </Link>
  );
}
