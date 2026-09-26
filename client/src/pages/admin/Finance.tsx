import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { PaymentForm } from '../../components/admin/PaymentForm';
import { PaymentsList } from '../../components/admin/RecordLists';
import type { FinanceRow, FinanceSummary, Payment } from '../../components/admin/types';
import { AdminPage, FilterBar, SearchInput, StatTile } from '../../components/admin/ui';
import { Button, ButtonA, ErrorState, Icon, Modal, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, displayPhone, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type FinanceList = Paged<FinanceRow> & { totals: FinanceSummary };
type CustomerFinance = {
  customer: { id: string; name: string; phone: string; companyName: string | null };
  summary: FinanceSummary;
  payments: Payment[];
};

const KEYS = ['q', 'due'] as const;

export default function Finance() {
  useDocumentTitle('المالية');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const list = useAdminQuery(() => api.get<FinanceList>('/admin/finance/customers', { ...v, page, pageSize: 20 }), [JSON.stringify(v), page], { keep: true });
  const [selected, setSelected] = useState<string | null>(null);
  const t = list.data?.totals;

  const columns: Column<FinanceRow>[] = [
    {
      key: 'name',
      header: 'العميل',
      cell: (r) => (
        <button type="button" onClick={() => setSelected(r.id)} className="flex flex-col text-start hover:text-brand-700 dark:hover:text-brand-200">
          <span className="font-medium">{r.name}</span>
          <span className="text-xs text-muted">
            {r.companyName && <>{r.companyName} · </>}
            <span className="ltr">{displayPhone(r.phone)}</span>
          </span>
        </button>
      ),
    },
    { key: 'billed', header: 'المطلوب', cell: (r) => <span className="tabular-nums">{formatJOD(r.billed)}</span>, align: 'end' },
    { key: 'paid', header: 'المدفوع', cell: (r) => <span className="tabular-nums text-success">{formatJOD(r.paid)}</span>, align: 'end' },
    {
      key: 'remaining',
      header: 'المتبقي',
      cell: (r) => (
        <span
          className={cx(
            'inline-block rounded-md px-2 py-0.5 tabular-nums',
            r.remaining > 0.0005 ? 'bg-warn/10 font-bold text-warn' : r.remaining < -0.0005 ? 'text-sky-700 dark:text-sky-300' : 'text-muted',
          )}
        >
          {formatJOD(r.remaining)}
        </span>
      ),
      align: 'end',
    },
    {
      key: 'act',
      header: '',
      align: 'end',
      hideOnMobile: true,
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(r.id)}>
          الدفعات
        </Button>
      ),
    },
  ];

  return (
    <AdminPage
      title="المالية"
      description="المطلوب والمدفوع والمتبقي على كل عميل (الطلبات + الحجوزات + العقود)"
      actions={
        <>
          <ButtonA href={api.url('/admin/finance/export?kind=customers')} download variant="outline" size="sm">
            <Icon name="download" className="h-4 w-4" /> تصدير العملاء CSV
          </ButtonA>
          <ButtonA href={api.url('/admin/finance/export?kind=payments')} download variant="outline" size="sm">
            <Icon name="download" className="h-4 w-4" /> تصدير الدفعات CSV
          </ButtonA>
        </>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="إجمالي المطلوب" value={formatJOD(t?.billed ?? 0)} loading={list.loading} />
        <StatTile label="إجمالي المدفوع" value={formatJOD(t?.paid ?? 0)} loading={list.loading} tone="brand" />
        <StatTile label="إجمالي المتبقي" value={formatJOD(t?.remaining ?? 0)} loading={list.loading} tone={t && t.remaining > 0 ? 'warn' : 'neutral'} />
      </div>
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم، شركة، هاتف…" />
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm">
          <input type="checkbox" className="accent-brand-700" checked={v.due === 'true'} onChange={(e) => f.set({ due: e.target.checked ? 'true' : '' })} />
          عليهم مبالغ فقط
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(r) => r.id}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: f.active ? 'لا يوجد عملاء مطابقون' : 'لا توجد بيانات مالية بعد' }}
      />
      <CustomerFinanceModal id={selected} onClose={() => setSelected(null)} onChanged={list.reload} />
    </AdminPage>
  );
}

function CustomerFinanceModal({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const q = useAdminQuery(() => (id ? api.get<CustomerFinance>(`/admin/finance/customers/${id}`) : Promise.resolve(null)), [id]);
  const [adding, setAdding] = useState(false);
  const d = q.data;
  const setSummary = (summary: FinanceSummary) => q.setData((x) => (x ? { ...x, summary } : x));

  return (
    <Modal open={!!id} onClose={() => { setAdding(false); onClose(); }} title={d?.customer.name ?? 'الحساب المالي'} size="lg">
      {q.loading || (d && d.customer.id !== id) ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : q.error || !d ? (
        <ErrorState message={q.error?.message ?? 'تعذر التحميل'} onRetry={q.retry} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>
              {d.customer.companyName && <>{d.customer.companyName} · </>}
              <span className="ltr">{displayPhone(d.customer.phone)}</span>
            </span>
            <Link to={`/admin/customers/${d.customer.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200">
              السجل الكامل للعميل
            </Link>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['المطلوب', d.summary.billed, ''],
                ['المدفوع', d.summary.paid, 'text-success'],
                ['المتبقي', d.summary.remaining, d.summary.remaining > 0.0005 ? 'text-warn' : ''],
              ] as const
            ).map(([k, val, cls]) => (
              <div key={k} className="rounded-xl bg-subtle px-2 py-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className={cx('mt-0.5 font-bold tabular-nums', cls)}>{formatJOD(val)}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">الدفعات ({d.payments.length})</h3>
              {!adding && (
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Icon name="plus" className="h-4 w-4" /> إضافة دفعة
                </Button>
              )}
            </div>
            {adding && (
              <div className="mb-4 rounded-xl border border-line bg-subtle/40 p-4">
                <PaymentForm
                  customerId={d.customer.id}
                  onCancel={() => setAdding(false)}
                  onSaved={(_p, summary) => {
                    setAdding(false);
                    setSummary(summary);
                    q.reload();
                    onChanged();
                  }}
                />
              </div>
            )}
            <PaymentsList
              payments={d.payments}
              showLink
              onDeleted={(pid, summary) => {
                q.setData((x) => (x ? { ...x, summary, payments: x.payments.filter((p) => p.id !== pid) } : x));
                onChanged();
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
