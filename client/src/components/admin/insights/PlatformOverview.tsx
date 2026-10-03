import { Link } from 'react-router-dom';
import { useAdminQuery } from '../hooks';
import { Panel, StatTile } from '../ui';
import { Skeleton, Tag } from '../../ui';
import { api } from '../../../lib/api';
import { formatJOD, cx } from '../../../lib/format';
import { formatPct, periodLabel, REWARD_TYPE_LABEL, type Growth, type Metrics } from '../../../lib/insights';

type Overview = {
  period: string;
  previous: string;
  platform: { totalSales: number; totalOrders: number; totalCustomers: number; totalSuppliers: number; totalMaintenanceCompanies: number; totalRevenue: number };
  thisMonth: Metrics;
  lastMonth: Metrics;
  growth: Growth;
  recognitions: { id: string; kind: 'SUPPLIER' | 'CUSTOMER'; period: string; title: string; vendor: { id: string; name: string } | null; customer: { id: string; name: string } | null; rewards: { id: string; type: string; title: string; status: string }[] }[];
  rewards: { id: string; type: string; title: string; vendor: { id: string; name: string } | null; customer: { id: string; name: string } | null; coupon: { code: string; usedCount: number; usageLimit: number | null } | null }[];
};

const money = (v: number) => <span className="text-xl">{formatJOD(v)}</span>;

function GrowthChip({ pct }: { pct: number | null }) {
  return (
    <span dir="ltr" className={cx('text-xs font-bold tabular-nums', pct != null && pct > 0 ? 'text-success' : pct != null && pct < 0 ? 'text-danger' : 'text-muted')}>
      {pct != null && pct > 0 ? '▲ ' : pct != null && pct < 0 ? '▼ ' : ''}
      {formatPct(pct)}
    </span>
  );
}

/** Platform Overview في الصفحة الرئيسية للـ Super Admin */
export function PlatformOverview() {
  const q = useAdminQuery(() => api.get<Overview>('/admin/insights/overview'), [], { live: true });
  const d = q.data;
  if (q.error && !d) return null;
  const rec = (kind: 'SUPPLIER' | 'CUSTOMER') => d?.recognitions.find((r) => r.kind === kind && r.period === d.period) ?? d?.recognitions.find((r) => r.kind === kind);
  const g = d?.growth;
  return (
    <div className="space-y-6">
      <Panel title="نظرة على المنصة" actions={<Link to="/admin/insights" className="text-sm font-semibold underline">أداء المنصة</Link>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <StatTile label="إجمالي مبيعات المنصة" value={money(d?.platform.totalSales ?? 0)} loading={q.loading} tone="brand" />
          <StatTile label="إجمالي الطلبات" value={d?.platform.totalOrders ?? 0} loading={q.loading} />
          <StatTile label="إجمالي العملاء" value={d?.platform.totalCustomers ?? 0} loading={q.loading} to="/admin/customers" />
          <StatTile label="إجمالي الموردين" value={d?.platform.totalSuppliers ?? 0} loading={q.loading} to="/admin/market/suppliers" />
          <StatTile label="شركات الصيانة" value={d?.platform.totalMaintenanceCompanies ?? 0} loading={q.loading} />
          <StatTile label="إجمالي إيرادات FARJAR" value={money(d?.platform.totalRevenue ?? 0)} loading={q.loading} tone="sand" />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={d ? `هذا الشهر — ${periodLabel(d.period)}` : 'هذا الشهر'}>
          {!d ? (
            <Skeleton className="h-32" />
          ) : (
            <dl className="divide-y divide-line">
              {(
                [
                  ['المبيعات', formatJOD(d.thisMonth.totalSales), g!.totalSales.pct],
                  ['الطلبات', d.thisMonth.totalOrders, g!.totalOrders.pct],
                  ['عملاء جدد', d.thisMonth.newCustomers, g!.newCustomers.pct],
                  ['موردون جدد', d.thisMonth.newSuppliers, g!.newSuppliers.pct],
                  ['الإيرادات', formatJOD(d.thisMonth.farjarRevenue), g!.farjarRevenue.pct],
                ] as const
              ).map(([l, v, p]) => (
                <div key={l} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm text-muted">{l}</dt>
                  <dd className="flex items-baseline gap-3">
                    <b className="tabular-nums">{v}</b>
                    <GrowthChip pct={p} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {d && <p className="mt-2 text-xs text-muted">النمو مقارنة بـ {periodLabel(d.previous)}.</p>}
        </Panel>

        <Panel title="التميز والمكافآت" actions={<Link to="/admin/insights/recognition" className="text-sm font-semibold underline">التميز الشهري</Link>}>
          {!d ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-4">
              {(['SUPPLIER', 'CUSTOMER'] as const).map((k) => {
                const r = rec(k);
                return (
                  <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle p-3">
                    <span>
                      <span className="block text-xs text-muted">{k === 'SUPPLIER' ? 'مورد الشهر' : 'عميل الشهر'}</span>
                      {r ? (
                        <b>
                          {r.vendor?.name ?? r.customer?.name} <span className="text-xs font-normal text-muted">({periodLabel(r.period)})</span>
                        </b>
                      ) : (
                        <span className="text-sm text-muted">لم يُختر بعد</span>
                      )}
                    </span>
                    {r ? (
                      <span className="flex flex-wrap gap-1">
                        {r.rewards.map((x) => (
                          <Tag key={x.id} tone={x.status === 'ACTIVE' ? 'brand' : 'neutral'}>
                            {x.title}
                          </Tag>
                        ))}
                      </span>
                    ) : (
                      <Link to="/admin/insights/recognition" className="text-sm font-semibold text-primary-ink underline">
                        اختر الآن
                      </Link>
                    )}
                  </div>
                );
              })}
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">مكافآت فعّالة</p>
                {d.rewards.length === 0 ? (
                  <p className="text-sm text-muted">لا توجد مكافآت فعّالة.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.rewards.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {r.title} <span className="text-xs text-muted">· {r.vendor?.name ?? r.customer?.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">{r.coupon ? <span className="ltr">{r.coupon.code}</span> : REWARD_TYPE_LABEL[r.type]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
