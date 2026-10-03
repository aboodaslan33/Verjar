import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { AdminPage, FilterBar, FilterSelect, Panel, SearchInput, StatTile } from '../../components/admin/ui';
import { ButtonA, ErrorState, Icon, Input, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { FEE_STATUSES, FEE_STATUS_LABEL, type FeeStatus, type FeeSummary } from '../../lib/supplierFinance';
import { useDocumentTitle } from '../../lib/useAsync';

type SupplierRow = FeeSummary & {
  vendor: { id: string; name: string; slug: string; active: boolean; status: string };
  feePercent: number;
  lastPayment: string | null;
};
type Report = { periods: (FeeSummary & { period: string })[]; totals: FeeSummary };

const GROUP_LABEL = { day: 'يومي', week: 'أسبوعي', month: 'شهري', year: 'سنوي' } as const;
type GroupBy = keyof typeof GROUP_LABEL;

function accountStatus(v: SupplierRow['vendor']) {
  if (!v.active) return <Tag tone="danger">موقوف</Tag>;
  if (v.status === 'APPROVED') return <Tag tone="success">فعّال</Tag>;
  if (v.status === 'PENDING') return <Tag tone="sand">بانتظار المراجعة</Tag>;
  return <Tag tone="danger">{v.status === 'SUSPENDED' ? 'معلّق' : 'مرفوض'}</Tag>;
}

/** إدارة مالية الموردين: المستحق لفرجار على كل مورد، والتقارير حسب الفترة */
export default function SupplierFinance() {
  useDocumentTitle('مالية الموردين');
  const f = useFilters(['q', 'balance', 'groupBy', 'vendorId', 'status', 'from', 'to'] as const);
  const v = f.values;
  const list = useAdminQuery(() => api.get<{ suppliers: SupplierRow[]; totals: FeeSummary }>('/admin/supplier-finance'), []);
  const groupBy = (v.groupBy || 'month') as GroupBy;
  const reportParams = Object.fromEntries(Object.entries({ groupBy, vendorId: v.vendorId, status: v.status, from: v.from, to: v.to }).filter(([, x]) => x)) as Record<string, string>;
  const report = useAdminQuery(() => api.get<Report>('/admin/supplier-finance/report', reportParams), [JSON.stringify(reportParams)], { keep: true });

  const q = v.q.trim().toLowerCase();
  const rows = (list.data?.suppliers ?? []).filter(
    (r) => (!q || r.vendor.name.toLowerCase().includes(q)) && (v.balance !== 'due' || r.outstanding > 0) && (v.balance !== 'clear' || r.outstanding <= 0),
  );
  const t = list.data?.totals;
  const exportUrl = (format: 'csv' | 'xlsx') =>
    api.url(`/admin/reports/supplier_fees?${new URLSearchParams({ format, lang: 'ar', groupBy, ...(v.vendorId ? { supplierId: v.vendorId } : {}), ...(v.status ? { status: v.status } : {}), ...(v.from ? { from: v.from } : {}), ...(v.to ? { to: v.to } : {}) })}`);

  const columns: Column<SupplierRow>[] = [
    { key: 'name', header: 'المورد', cell: (r) => <span className="font-medium">{r.vendor.name}</span> },
    { key: 'orders', header: 'الطلبات', cell: (r) => <span className="tabular-nums">{r.orders}</span>, hideOnMobile: true },
    { key: 'sales', header: 'المبيعات', cell: (r) => <span className="tabular-nums">{formatJOD(r.customerSales)}</span> },
    { key: 'pct', header: 'نسبة فرجار', cell: (r) => <span dir="ltr">{r.feePercent}%</span>, hideOnMobile: true },
    { key: 'fees', header: 'إجمالي العمولة', cell: (r) => <span className="tabular-nums">{formatJOD(r.fees)}</span> },
    { key: 'paid', header: 'المدفوع', cell: (r) => <span className="tabular-nums">{formatJOD(r.paid)}</span>, hideOnMobile: true },
    {
      key: 'rem',
      header: 'المتبقي',
      cell: (r) => (
        <span className="tabular-nums">
          <b>{formatJOD(r.outstanding)}</b>
          {r.due > 0 && <span className="block text-xs text-muted">مستحق الآن {formatJOD(r.due)}</span>}
          {r.disputed > 0 && <span className="block text-xs text-danger">متنازع {formatJOD(r.disputed)}</span>}
        </span>
      ),
    },
    { key: 'last', header: 'آخر دفعة', cell: (r) => (r.lastPayment ? formatDate(r.lastPayment) : <span className="text-muted">—</span>), hideOnMobile: true },
    { key: 'status', header: 'الحساب', cell: (r) => accountStatus(r.vendor) },
  ];

  return (
    <AdminPage title="مالية الموردين" description="Supplier Financial Management — نسبة فرجار المستحقة على كل مورد، الدفعات، والنزاعات. المبالغ من النسبة المثبتة وقت كل طلب.">
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={list.retry} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="إجمالي المبيعات" value={formatJOD(t?.customerSales ?? 0)} sub={`${t?.orders ?? 0} طلب`} loading={list.loading} />
            <StatTile label="إجمالي عمولة فرجار" value={formatJOD(t?.fees ?? 0)} tone="brand" loading={list.loading} />
            <StatTile label="المدفوع لفرجار" value={formatJOD(t?.paid ?? 0)} tone="sand" loading={list.loading} />
            <StatTile
              label="المتبقي على الموردين"
              value={formatJOD(t?.outstanding ?? 0)}
              sub={t ? `مستحق ${formatJOD(t.due)} · معلّق ${formatJOD(t.pending)} · متنازع ${formatJOD(t.disputed)}` : undefined}
              tone="warn"
              loading={list.loading}
            />
          </div>
          <div className="mt-6">
            <FilterBar onClear={() => f.set({ q: '', balance: '' })} active={!!(v.q || v.balance)}>
              <SearchInput value={v.q} onChange={(x) => f.set({ q: x })} placeholder="اسم المورد…" />
              <FilterSelect label="الرصيد" value={v.balance} onChange={(e) => f.set({ balance: e.target.value })}>
                <option value="">كل الموردين</option>
                <option value="due">عليهم مبالغ</option>
                <option value="clear">لا مبالغ متبقية</option>
              </FilterSelect>
            </FilterBar>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.vendor.id}
              rowHref={(r) => `/admin/supplier-finance/${r.vendor.id}`}
              loading={list.loading}
              error={null}
              empty={{ title: 'لا يوجد موردون مطابقون' }}
            />
          </div>
        </>
      )}

      <div className="mt-8">
        <Panel
          title="التقارير المالية"
          actions={
            <div className="flex gap-2">
              <ButtonA href={exportUrl('xlsx')} download variant="outline" size="sm">
                <Icon name="download" className="h-4 w-4" /> Excel
              </ButtonA>
              <ButtonA href={exportUrl('csv')} download variant="ghost" size="sm">
                CSV
              </ButtonA>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <FilterSelect label="التجميع" value={groupBy} onChange={(e) => f.set({ groupBy: e.target.value })}>
              {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABEL[g]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="المورد" value={v.vendorId} onChange={(e) => f.set({ vendorId: e.target.value })}>
              <option value="">كل الموردين</option>
              {list.data?.suppliers.map((r) => (
                <option key={r.vendor.id} value={r.vendor.id}>
                  {r.vendor.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="حالة الدفع" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
              <option value="">كل الحالات</option>
              {FEE_STATUSES.map((s: FeeStatus) => (
                <option key={s} value={s}>
                  {FEE_STATUS_LABEL[s]}
                </option>
              ))}
            </FilterSelect>
            <Input label="من" type="date" className="ltr text-start" value={v.from} onChange={(e) => f.set({ from: e.target.value })} />
            <Input label="إلى" type="date" className="ltr text-start" value={v.to} onChange={(e) => f.set({ to: e.target.value })} />
          </div>
          {report.error ? (
            <ErrorState message={report.error.message} onRetry={report.retry} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="إجمالي المبيعات" value={formatJOD(report.data?.totals.customerSales ?? 0)} sub="Total Sales" loading={report.loading} />
                <StatTile label="إجمالي عمولة فرجار" value={formatJOD(report.data?.totals.fees ?? 0)} sub="Total Farjar Fees" tone="brand" loading={report.loading} />
                <StatTile label="إجمالي المدفوع" value={formatJOD(report.data?.totals.paid ?? 0)} sub="Total Paid" tone="sand" loading={report.loading} />
                <StatTile label="إجمالي المتبقي" value={formatJOD(report.data?.totals.outstanding ?? 0)} sub="Total Outstanding" tone="warn" loading={report.loading} />
              </div>
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {!report.data?.periods.length && <li className="p-4 text-sm text-muted">لا توجد بيانات ضمن الفلاتر.</li>}
                {report.data?.periods.map((p) => (
                  <li key={p.period} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span>
                      <span className="block font-medium" dir="ltr">
                        {p.period}
                      </span>
                      <span className="text-xs text-muted">
                        {p.orders} طلب · مبيعات {formatJOD(p.customerSales)} · مدفوع {formatJOD(p.paid)}
                      </span>
                    </span>
                    <span className="text-end text-sm">
                      <b className="block tabular-nums">{formatJOD(p.fees)}</b>
                      <span className="text-xs text-muted">متبقي {formatJOD(p.outstanding)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
