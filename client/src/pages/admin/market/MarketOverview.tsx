import { Link } from 'react-router-dom';
import { useAdminQuery, useFilters } from '../../../components/admin/hooks';
import { AdminPage, FilterBar, FilterInput, Panel, StatTile } from '../../../components/admin/ui';
import { ErrorState, Tag } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatJOD } from '../../../lib/format';
import { INVOICE_PURPOSE_LABEL, REVENUE_MODE_LABEL, RFQ_STATUS_LABEL, VENDOR_STATUS_LABEL, type RfqStatus, type VendorStatus } from '../../../lib/market';
import { useDocumentTitle } from '../../../lib/useAsync';

type Overview = {
  revenueMode: string;
  suppliers: Partial<Record<VendorStatus, number>>;
  plans: { plan: string; count: number }[];
  products: number;
  pendingProducts: number;
  rfqs: Partial<Record<RfqStatus, number>>;
  deals: { count: number; value: number; expected: number; commission: number };
  leads: { sent: number; feesValue: number };
  revenue: { paid: Record<string, number>; pending: Record<string, number>; total: number };
};

/** لوحة السوق الصناعي والتقرير المالي: الاشتراكات، العمولات، الإعلانات، الـ Leads، وأرباح FARJAR */
export default function MarketOverview() {
  useDocumentTitle('لوحة السوق الصناعي');
  const f = useFilters(['from', 'to'] as const);
  const q = useAdminQuery(() => api.get<Overview>('/admin/market/overview', f.values), [f.values.from, f.values.to], { keep: true });
  const d = q.data;
  const rfqTotal = d ? Object.values(d.rfqs).reduce((a, b) => a + (b ?? 0), 0) : 0;
  return (
    <AdminPage
      title="لوحة السوق الصناعي"
      description="FARJAR Industrial Marketplace — الموردون، الطلبات، الصفقات والإيرادات"
      meta={d && <Tag tone="dark">نموذج الإيراد: {REVENUE_MODE_LABEL[d.revenueMode] ?? d.revenueMode}</Tag>}
      actions={
        <Link to="/admin/settings#market" className="text-sm text-muted hover:text-ink">
          إعدادات السوق
        </Link>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterInput label="من" type="date" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label="إلى" type="date" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
      </FilterBar>
      {q.error && <ErrorState message={q.error.message} onRetry={q.retry} />}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="أرباح FARJAR (مدفوعة)" value={formatJOD(d?.revenue.total ?? 0)} tone="brand" loading={q.loading} />
        <StatTile label="قيمة الصفقات" value={formatJOD(d?.deals.value ?? 0)} sub={`${d?.deals.count ?? 0} صفقة · عمولة محسوبة ${formatJOD(d?.deals.commission ?? 0)}`} loading={q.loading} />
        <StatTile label="طلبات عروض الأسعار" value={rfqTotal} sub={`${d?.leads.sent ?? 0} Lead مُرسل للموردين`} to="/admin/market/rfqs" loading={q.loading} />
        <StatTile label="موردون بانتظار المراجعة" value={d?.suppliers.PENDING ?? 0} to="/admin/market/suppliers?status=PENDING" tone={d?.suppliers.PENDING ? 'warn' : 'neutral'} loading={q.loading} />
      </div>
      {d && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="الإيرادات حسب المصدر" className="lg:col-span-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-2 text-start font-semibold">المصدر</th>
                  <th className="py-2 text-end font-semibold">مدفوع</th>
                  <th className="py-2 text-end font-semibold">بانتظار الدفع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {['SUBSCRIPTION', 'COMMISSION', 'AD', 'LEAD_FEE', 'ORDER', 'PROCUREMENT'].map((k) => (
                  <tr key={k}>
                    <td className="py-2.5">{INVOICE_PURPOSE_LABEL[k]}</td>
                    <td className="py-2.5 text-end font-semibold tabular-nums">{formatJOD(d.revenue.paid[k] ?? 0)}</td>
                    <td className="py-2.5 text-end tabular-nums text-muted">{formatJOD(d.revenue.pending[k] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              قيمة الـ Leads المُرسلة (حسب أسعارها): {formatJOD(d.leads.feesValue)} — تُحصّل فقط عند تفعيل رسوم الـ Leads. <Link to="/admin/market/invoices" className="underline">الفواتير</Link>
            </p>
          </Panel>
          <div className="space-y-6">
            <Panel title="الموردون">
              <ul className="space-y-1.5 text-sm">
                {(Object.keys(VENDOR_STATUS_LABEL) as VendorStatus[]).map((k) => (
                  <li key={k} className="flex justify-between">
                    <Link to={`/admin/market/suppliers?status=${k}`} className="hover:underline">
                      {VENDOR_STATUS_LABEL[k]}
                    </Link>
                    <span className="num font-semibold">{d.suppliers[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">حسب الباقة: {d.plans.map((p) => `${p.plan} ${p.count}`).join(' · ')}</p>
            </Panel>
            <Panel title="الطلبات حسب الحالة">
              <ul className="space-y-1.5 text-sm">
                {(Object.keys(RFQ_STATUS_LABEL) as RfqStatus[]).map((k) => (
                  <li key={k} className="flex justify-between">
                    <Link to={`/admin/market/rfqs?status=${k}`} className="hover:underline">
                      {RFQ_STATUS_LABEL[k]}
                    </Link>
                    <span className="num font-semibold">{d.rfqs[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                المنتجات المعتمدة {d.products} · بانتظار المراجعة{' '}
                <Link to="/admin/products?approval=PENDING" className="underline">
                  {d.pendingProducts}
                </Link>
              </p>
            </Panel>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
