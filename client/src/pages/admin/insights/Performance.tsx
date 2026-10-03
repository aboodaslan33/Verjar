import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CompareLegend, CompareTile, MonthlyBars, RankBars } from '../../../components/admin/insights/Charts';
import { useAdminQuery } from '../../../components/admin/hooks';
import { AdminPage, DetailSkeleton, Panel } from '../../../components/admin/ui';
import { Button, ErrorState, Icon, Select, Tag } from '../../../components/ui';
import { api } from '../../../lib/api';
import { cx, formatDate } from '../../../lib/format';
import {
  METRIC,
  SECTION_LABEL,
  currentPeriodKey,
  formatMetric,
  formatPct,
  monthName,
  periodLabel,
  shiftKey,
  type GrowthKey,
  type Metrics,
  type PeriodData,
  type SeriesData,
} from '../../../lib/insights';
import { useDocumentTitle } from '../../../lib/useAsync';

/** اختيار شهر وسنة */
export function MonthPicker({ value, onChange, label, max }: { value: string; onChange: (v: string) => void; label: string; max: string }) {
  const [y, m] = value.split('-').map(Number);
  const [maxY, maxM] = max.split('-').map(Number);
  const years = Array.from({ length: maxY - 2024 + 1 }, (_, i) => maxY - i);
  const set = (yy: number, mm: number) => {
    const k = `${yy}-${String(mm).padStart(2, '0')}`;
    onChange(k > max ? max : k);
  };
  return (
    <fieldset className="flex items-end gap-2">
      <legend className="sr-only">{label}</legend>
      <Select label={label} value={String(m)} onChange={(e) => set(y, Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
          <option key={mm} value={mm} disabled={y === maxY && mm > maxM}>
            {monthName(mm)}
          </option>
        ))}
      </Select>
      <Select label="السنة" value={String(y)} onChange={(e) => set(Number(e.target.value), m)}>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </Select>
    </fieldset>
  );
}

const KPI: (keyof Metrics)[] = [
  'totalSales',
  'totalOrders',
  'farjarRevenue',
  'farjarCommissions',
  'productSales',
  'productsSold',
  'avgOrderValue',
  'maintenanceContractsValue',
  'subscriptionsRevenue',
  'totalCustomers',
  'activeCustomers',
  'activeSuppliers',
  'activeMaintenanceCompanies',
  'returningRate',
  'activeSupplierRate',
  'couponDiscounts',
];

const GROWTH_TILES: { key: GrowthKey; label: string }[] = [
  { key: 'totalSales', label: 'نمو المبيعات' },
  { key: 'totalOrders', label: 'نمو عدد الطلبات' },
  { key: 'activeCustomers', label: 'نمو العملاء النشطين' },
  { key: 'activeSuppliers', label: 'نمو الموردين النشطين' },
  { key: 'farjarRevenue', label: 'نمو الإيرادات' },
  { key: 'productsSold', label: 'نمو المنتجات المباعة' },
  { key: 'newCustomers', label: 'العملاء الجدد' },
  { key: 'newProducts', label: 'المنتجات الجديدة' },
];

const CHART_METRICS: (keyof Metrics)[] = ['totalSales', 'totalOrders', 'farjarRevenue', 'activeCustomers', 'activeSuppliers', 'productsSold', 'avgOrderValue'];

/** Platform Performance + Growth Analysis — إحصائيات المنصة الشهرية ونموها (Super Admin) */
export default function Performance() {
  useDocumentTitle('أداء المنصة');
  const now = currentPeriodKey();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? now;
  const compareTo = params.get('compare') ?? shiftKey(period, -1);
  const [chartMetric, setChartMetric] = useState<keyof Metrics>('totalSales');
  const setParam = (k: string, v: string) => setParams((p) => (p.set(k, v), p), { replace: true });

  const q = useAdminQuery(() => api.get<PeriodData>('/admin/insights/period', { period }), [period], { keep: true });
  const cmp = useAdminQuery(
    () => api.get<{ a: PeriodData; b: PeriodData; growth: PeriodData['growth'] }>('/admin/insights/compare', { a: compareTo, b: period }),
    [compareTo, period],
    { keep: true },
  );
  const series = useAdminQuery(() => api.get<SeriesData>('/admin/insights/series', { end: period, months: 12 }), [period], { keep: true });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.get('/admin/insights/period', { period, refresh: 1 });
      q.retry();
      series.retry();
      cmp.retry();
    } finally {
      setRefreshing(false);
    }
  };

  const chartPoints = useMemo(
    () => (series.data?.points ?? []).map((p) => ({ key: p.period, label: p.label, short: monthName(Number(p.period.slice(5))),
        num: `${p.period.slice(5)}/${p.period.slice(2, 4)}`, value: p.metrics[chartMetric] })),
    [series.data, chartMetric],
  );

  if (q.loading && !q.data) return <DetailSkeleton />;
  if (q.error && !q.data) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  const d = q.data!;
  const m = d.metrics;
  const b = d.breakdown;

  return (
    <AdminPage
      title="أداء المنصة"
      description="Platform Performance — مبيعات وطلبات وعملاء وموردون وإيرادات FARJAR لكل شهر، محسوبة من البيانات الفعلية ومحفوظة في أرشيف شهري."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthPicker label="الشهر" value={period} max={now} onChange={(v) => setParam('period', v)} />
          <Button size="sm" variant="ghost" loading={refreshing} onClick={refresh} title="إعادة حساب الشهر من البيانات الحالية">
            <Icon name="refresh" className="h-4 w-4" /> إعادة الحساب
          </Button>
        </div>
      }
    >
      <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Tag tone={d.final ? 'neutral' : 'brand'}>{d.final ? 'شهر مكتمل — محفوظ في الأرشيف' : 'الشهر الجاري — يُحدَّث تلقائيًا'}</Tag>
        آخر حساب: {formatDate(d.computedAt, true)}
      </p>

      {/* المؤشرات الرئيسية مع التغير عن الشهر السابق */}
      <section aria-labelledby="kpi-title">
        <h2 id="kpi-title" className="mb-3 text-lg">
          {d.label}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {KPI.map((k) => {
            const meta = METRIC[k];
            const prevV = d.previous.metrics[k];
            const pct = prevV ? Math.round(((m[k] - prevV) / prevV) * 1000) / 10 : m[k] ? null : 0;
            return (
              <div key={k} className="card px-4 py-3" title={meta.hint}>
                <p className="text-xs font-medium text-muted">{meta.label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">{meta.format === 'percent' ? <span dir="ltr">{formatMetric(m[k], meta.format)}</span> : formatMetric(m[k], meta.format)}</p>
                {meta.format !== 'percent' && (
                  <p className={cx('text-xs tabular-nums', pct != null && pct > 0 ? 'text-success' : pct != null && pct < 0 ? 'text-danger' : 'text-muted')}>
                    <span dir="ltr">{formatPct(pct)}</span> <span className="text-muted">عن {d.previous.label}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* الرسم الشهري */}
      <Panel
        title="الأداء الشهري (آخر 12 شهرًا)"
        className="mt-6"
        actions={
          <Select label="" aria-label="المؤشر" value={chartMetric} onChange={(e) => setChartMetric(e.target.value as keyof Metrics)}>
            {CHART_METRICS.map((k) => (
              <option key={k} value={k}>
                {METRIC[k].label}
              </option>
            ))}
          </Select>
        }
      >
        {series.data ? (
          <>
            <MonthlyBars title={`${METRIC[chartMetric].label} شهريًا`} points={chartPoints} format={METRIC[chartMetric].format} selected={period} onSelect={(k) => setParam('period', k)} />
            <p className="mt-3 text-xs text-muted">
              أعلى شهر مبيعًا: <b className="text-ink">{series.data.bestSalesMonth.label}</b> ({formatMetric(series.data.bestSalesMonth.value, 'money')}) · أعلى شهر طلبات:{' '}
              <b className="text-ink">{series.data.bestOrdersMonth.label}</b> ({series.data.bestOrdersMonth.value})
            </p>
          </>
        ) : (
          <div className="h-48 animate-pulse rounded-lg bg-subtle" />
        )}
      </Panel>

      {/* مقارنة النمو */}
      <section className="mt-6" aria-labelledby="growth-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="growth-title" className="text-lg">
              تحليل النمو
            </h2>
            <p className="text-sm text-muted">Growth Analysis — قارن أي شهرين (مثل يناير مقابل فبراير، أو نفس الشهر بين سنتين).</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <MonthPicker label="مقارنة بـ" value={compareTo} max={now} onChange={(v) => setParam('compare', v)} />
          </div>
        </div>
        {cmp.data && (
          <>
            <CompareLegend aLabel={periodLabel(compareTo)} bLabel={periodLabel(period)} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {GROWTH_TILES.map((t) => {
                const g = cmp.data!.growth[t.key];
                return <CompareTile key={t.key} label={t.label} a={g.from} b={g.to} pct={g.pct} format={METRIC[t.key].format} aLabel={periodLabel(compareTo)} bLabel={periodLabel(period)} />;
              })}
            </div>
          </>
        )}
      </section>

      {/* التحليل */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="أكثر الفئات مبيعًا">
          <RankBars rows={b.topCategories.map((x) => ({ label: x.name, value: x.sales, sub: `${x.quantity} قطعة` }))} format="money" />
        </Panel>
        <Panel title="أكثر المنتجات طلبًا">
          <RankBars rows={b.topProducts.map((x) => ({ label: x.name, value: x.quantity, sub: formatMetric(x.sales, 'money') }))} format="count" />
        </Panel>
        <Panel title="المناطق الأكثر طلبًا">
          <RankBars rows={b.topRegions.map((x) => ({ label: x.region, value: x.orders, sub: formatMetric(x.sales, 'money') }))} format="count" />
        </Panel>
        <Panel title="إيرادات FARJAR حسب القسم">
          <RankBars rows={(Object.keys(SECTION_LABEL) as (keyof typeof SECTION_LABEL)[]).map((k) => ({ label: SECTION_LABEL[k], value: b.revenueBySection[k] }))} format="money" />
        </Panel>
        <Panel title="أكثر الموردين نشاطًا">
          <RankBars rows={b.topSuppliers.map((x) => ({ label: x.name, value: x.sales, sub: `${x.orders} طلب` }))} format="money" />
        </Panel>
        <Panel title="أكثر العملاء نشاطًا">
          <RankBars rows={b.topCustomers.map((x) => ({ label: x.name, value: x.spend, sub: `${x.orders} طلب` }))} format="money" />
        </Panel>
      </div>

      {series.data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Panel title="الفئات الأعلى مبيعًا (12 شهرًا)">
            <RankBars rows={series.data.categories} format="money" />
          </Panel>
          <Panel title="المنتجات الأكثر طلبًا (12 شهرًا)">
            <RankBars rows={series.data.products} format="count" />
          </Panel>
          <Panel title="المناطق الأكثر طلبًا (12 شهرًا)">
            <RankBars rows={series.data.regions} format="count" />
          </Panel>
        </div>
      )}

      <Panel title="تفاصيل الشهر" className="mt-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(METRIC) as (keyof Metrics)[]).map((k) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5" title={METRIC[k].hint}>
              <dt className="text-muted">{METRIC[k].label}</dt>
              <dd className="font-semibold tabular-nums">{formatMetric(m[k], METRIC[k].format)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted">
          التعريفات: {METRIC.totalSales.label} = {METRIC.totalSales.hint}. {METRIC.farjarRevenue.label} = {METRIC.farjarRevenue.hint}. {METRIC.activeCustomers.label}: {METRIC.activeCustomers.hint}.
        </p>
      </Panel>
    </AdminPage>
  );
}
