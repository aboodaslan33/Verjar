import { useState } from 'react';
import { cx } from '../../../lib/format';
import { formatMetric, formatPct, type MetricFormat } from '../../../lib/insights';

/**
 * رسوم لوحة الإحصائيات — بدون مكتبات:
 * - MonthlyBars: سلسلة واحدة (لون واحد)، تلميح عند المرور، الشهر المختار بقيمة ظاهرة، وجدول بديل.
 * - CompareTile: مقارنة شهرين لمؤشر واحد (لكل مؤشر مقياسه الخاص — لا محور مزدوج).
 * - RankBars: ترتيب أفقي (مقدار) بلون واحد.
 */

export function MonthlyBars({
  points,
  format,
  selected,
  onSelect,
  title,
}: {
  points: { key: string; label: string; short: string; num?: string; value: number }[];
  format: MetricFormat;
  selected?: string;
  onSelect?: (key: string) => void;
  title: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...points.map((p) => p.value));
  const active = points.find((p) => p.key === (hover ?? selected)) ?? points[points.length - 1];
  return (
    <div className="viz">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">
          {active?.label}: <b className="text-base text-ink tabular-nums">{active ? formatMetric(active.value, format) : '—'}</b>
        </p>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-muted underline hover:text-ink">
          {table ? 'عرض الرسم' : 'عرض كجدول'}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-start text-xs text-muted">
              <th className="py-1.5 text-start font-medium">الشهر</th>
              <th className="py-1.5 text-end font-medium">القيمة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.key} className={cx(p.key === selected && 'font-bold')}>
                <td className="py-1.5">{p.label}</td>
                <td className="py-1.5 text-end tabular-nums">{formatMetric(p.value, format)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="img" aria-label={title} className="relative">
          {/* خط الأساس والشبكة الخفيفة */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 border-b border-line">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/70" />
          </div>
          <ul className="relative flex h-48 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {points.map((p) => {
              const h = (p.value / max) * 100;
              const isSel = p.key === selected;
              return (
                <li key={p.key} className="group relative flex h-full flex-1 flex-col justify-end">
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-pointer"
                    onMouseEnter={() => setHover(p.key)}
                    onFocus={() => setHover(p.key)}
                    onBlur={() => setHover(null)}
                    onClick={() => onSelect?.(p.key)}
                    aria-label={`${p.label}: ${formatMetric(p.value, format)}`}
                    aria-pressed={isSel}
                  />
                  {(hover === p.key || isSel) && p.value > 0 && (
                    <span className="mb-1 self-center whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-bg tabular-nums">{formatMetric(p.value, format)}</span>
                  )}
                  <span
                    className={cx('mx-auto w-full max-w-[2.75rem] rounded-t-[4px] transition-opacity', hover && hover !== p.key && !isSel ? 'opacity-60' : 'opacity-100')}
                    style={{ height: `${Math.max(p.value > 0 ? 2 : 0, h)}%`, background: 'var(--viz-cur)', outline: isSel ? '2px solid rgb(var(--c-ink))' : undefined, outlineOffset: 2 }}
                  />
                </li>
              );
            })}
          </ul>
          <ul className="mt-1.5 flex gap-[2px]" aria-hidden>
            {points.map((p) => (
              <li key={p.key} className={cx('flex-1 truncate text-center text-[11px]', p.key === selected ? 'font-bold text-ink' : 'text-muted')}>
                {/* الشاشات الضيقة: رقم الشهر/السنة، والواسعة: اسم الشهر */}
                <span className="ltr md:hidden">{p.num ?? p.short}</span>
                <span className="hidden md:inline">{p.short}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** مقارنة شهرين لمؤشر واحد: عمودان أفقيان بمقياس خاص بالمؤشر + نسبة النمو */
export function CompareTile({ label, a, b, format, pct, aLabel, bLabel }: { label: string; a: number; b: number; format: MetricFormat; pct: number | null; aLabel: string; bLabel: string }) {
  const max = Math.max(1, a, b);
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  return (
    <div className="viz card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span dir="ltr" className={cx('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', up ? 'bg-success/10 text-success' : down ? 'bg-danger/10 text-danger' : 'bg-subtle text-muted')}>
          {up ? '▲ ' : down ? '▼ ' : ''}
          {formatPct(pct)}
        </span>
      </div>
      <dl className="mt-3 space-y-2">
        {(
          [
            [aLabel, a, 'var(--viz-prev)'],
            [bLabel, b, 'var(--viz-cur)'],
          ] as const
        ).map(([l, v, color]) => (
          <div key={l}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <dt className="flex items-center gap-1.5 text-muted">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden />
                {l}
              </dt>
              <dd className="font-semibold tabular-nums text-ink">{formatMetric(v, format)}</dd>
            </div>
            <div className="mt-1 h-2 rounded-full bg-subtle">
              <div className="h-2 rounded-full" style={{ width: `${(v / max) * 100}%`, background: color, minWidth: v > 0 ? 4 : 0 }} />
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CompareLegend({ aLabel, bLabel }: { aLabel: string; bLabel: string }) {
  return (
    <div className="viz flex flex-wrap items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-prev)' }} /> {aLabel}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--viz-cur)' }} /> {bLabel}
      </span>
    </div>
  );
}

/** قائمة ترتيب أفقية (أكثر الفئات/المنتجات/المناطق…) */
export function RankBars({ rows, format, empty = 'لا توجد بيانات لهذه الفترة.' }: { rows: { label: string; value: number; sub?: string }[]; format: MetricFormat; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="viz space-y-2.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="me-1.5 text-xs text-muted tabular-nums">{i + 1}.</span>
              {r.label}
              {r.sub && <span className="ms-1.5 text-xs text-muted">{r.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMetric(r.value, format)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-subtle">
            <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--viz-cur)', minWidth: r.value > 0 ? 4 : 0 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
