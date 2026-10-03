import { useState } from 'react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useDebounced, useFilters, useMutation } from '../../components/admin/hooks';
import type { VendorReportRow } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterInput, StatTile } from '../../components/admin/ui';
import { Button, Icon, Input, Modal, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type Report = {
  rows: VendorReportRow[];
  summary: { salesTotal: number; commissionTotal: number; vendorNetTotal: number; due: number; paid: number };
};

/** الموردون والتقرير المالي: مبيعات كل مورد، عمولة المنصة، والمستحق */
export default function Vendors() {
  useDocumentTitle('الموردون');
  const f = useFilters(['from', 'to'] as const);
  const report = useAdminQuery(() => api.get<Report>('/admin/vendors/report', f.values), [f.values.from, f.values.to], { keep: true, live: true });
  const [granting, setGranting] = useState(false);
  const s = report.data?.summary;

  const columns: Column<VendorReportRow>[] = [
    {
      key: 'vendor',
      header: 'المورد',
      cell: (r) => (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {r.vendor.name}
            {r.vendor.isHouse && <Tag>الشركة</Tag>}
            {!r.vendor.active && <Tag tone="danger">موقوف</Tag>}
          </span>
          {!r.vendor.isHouse && (
            <span className="block text-xs text-muted">
              نسبة فرجار {r.vendor.platformFeePercent != null ? <span dir="ltr">{r.vendor.platformFeePercent}%</span> : 'حسب المنتج'}
            </span>
          )}
        </span>
      ),
    },
    { key: 'orders', header: 'الطلبات', cell: (r) => <span className="tabular-nums">{r.ordersCount}</span>, hideOnMobile: true },
    { key: 'sales', header: 'المبيعات', cell: (r) => <span className="tabular-nums">{formatJOD(r.salesTotal)}</span> },
    { key: 'commission', header: 'عمولتي', cell: (r) => <span className="tabular-nums">{formatJOD(r.commissionTotal)}</span> },
    { key: 'paid', header: 'المدفوع', cell: (r) => <span className="tabular-nums text-muted">{formatJOD(r.paid)}</span>, hideOnMobile: true },
    {
      key: 'due',
      header: 'المستحق للمورد',
      cell: (r) =>
        r.due > 0 ? (
          <span className="font-bold tabular-nums text-warn">
            {formatJOD(r.due)} <span className="text-xs font-normal text-muted">({r.dueOrders} طلب)</span>
          </span>
        ) : (
          <span className="tabular-nums text-muted">{formatJOD(0)}</span>
        ),
    },
  ];

  return (
    <AdminPage
      title="الموردون"
      description="المبيعات والعمولة ضمن الفترة المحددة. المستحق = صافي الطلبات المكتملة التي لم تُسوَّ بعد."
      actions={
        <Button size="sm" onClick={() => setGranting(true)}>
          <Icon name="plus" className="h-4 w-4" /> منح صلاحية مورد
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="مبيعات الموردين" value={formatJOD(s?.salesTotal ?? 0)} loading={report.loading} />
        <StatTile label="عمولتي" value={formatJOD(s?.commissionTotal ?? 0)} tone="brand" loading={report.loading} />
        <StatTile label="مستحق للموردين" value={formatJOD(s?.due ?? 0)} tone="warn" loading={report.loading} />
        <StatTile label="دُفع للموردين" value={formatJOD(s?.paid ?? 0)} tone="sand" loading={report.loading} />
      </div>
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterInput label="من" type="date" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label="إلى" type="date" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
      </FilterBar>
      <DataTable
        rows={report.data?.rows}
        columns={columns}
        rowKey={(r) => r.vendor.id}
        rowHref={(r) => `/admin/vendors/${r.vendor.id}`}
        loading={report.loading}
        refreshing={report.refreshing}
        error={report.error}
        onRetry={report.retry}
        rowClassName={(r) => (!r.vendor.active ? 'opacity-70' : undefined)}
        empty={{ title: 'لا يوجد موردون بعد', description: 'امنح عميلًا مسجّلًا صلاحية مورد ليبدأ بإضافة منتجاته.' }}
      />
      <GrantDialog open={granting} onClose={() => setGranting(false)} onGranted={report.reload} />
    </AdminPage>
  );
}

type CustomerRow = { id: string; name: string; phone: string; companyName: string | null };

/** منح صلاحية مورد لعميل مسجّل: بحث بالاسم أو الهاتف ثم تحديد العمولة */
export function GrantDialog({
  open,
  onClose,
  onGranted,
  customer: fixed,
}: {
  open: boolean;
  onClose: () => void;
  onGranted: () => void;
  customer?: CustomerRow;
}) {
  const m = useMutation();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CustomerRow | null>(fixed ?? null);
  const q = useDebounced(search.trim());
  const results = useAdminQuery(
    () => (q.length >= 2 && !fixed ? api.get<Paged<CustomerRow>>('/admin/customers', { q, pageSize: 6 }) : Promise.resolve(null)),
    [q],
    { keep: true },
  );
  const customer = fixed ?? picked;

  const grant = async () => {
    if (!customer) return;
    const r = await m.run(
      'grant',
      () => api.post('/admin/vendors', { customerId: customer.id }),
      `أصبح ${customer.name} موردًا`,
    );
    if (r) {
      onGranted();
      onClose();
      setPicked(null);
      setSearch('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="منح صلاحية مورد"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={grant} loading={m.pending === 'grant'} disabled={!customer}>
            منح الصلاحية
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {customer ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span>
              <span className="block font-medium">{customer.name}</span>
              <span className="ltr block text-sm text-muted">{customer.phone}</span>
            </span>
            {!fixed && (
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setPicked(null)}>
                تغيير
              </button>
            )}
          </div>
        ) : (
          <div>
            <Input label="ابحث عن العميل بالاسم أو الهاتف" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line empty:hidden">
              {results.data?.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setPicked(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-subtle">
                    <span className="font-medium">{c.name}</span>
                    <span className="ltr text-sm text-muted">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">يجب أن يكون العميل مسجّلًا في الموقع بكلمة مرور.</p>
          </div>
        )}
        <p className="text-sm text-muted">نسبة فرجار على منتجاته تُحدد لكل منتج (الافتراضي من الإعدادات)، ويمكن ضبط نسبة خاصة للمورد من صفحته.</p>
      </div>
    </Modal>
  );
}
