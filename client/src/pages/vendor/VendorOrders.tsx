import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { StatusOptions } from '../../components/admin/StatusSelect';
import { AdminPage, FilterBar, FilterSelect } from '../../components/admin/ui';
import { StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import type { VendorOrder } from './types';

export default function VendorOrders() {
  useDocumentTitle('الطلبات');
  const f = useFilters(['status'] as const);
  const list = useAdminQuery(
    () => api.get<Paged<VendorOrder>>('/vendor/orders', { ...f.values, page: f.page, pageSize: 20 }),
    [f.values.status, f.page],
    { keep: true },
  );

  const columns: Column<VendorOrder>[] = [
    {
      key: 'num',
      header: 'الطلب',
      cell: (o) => (
        <span>
          <span className="block font-semibold">#{o.number}</span>
          <span className="text-xs text-muted">{formatDate(o.createdAt, true)}</span>
        </span>
      ),
    },
    { key: 'customer', header: 'العميل', cell: (o) => o.order.customerName },
    { key: 'items', header: 'المنتجات', cell: (o) => `${o.items.reduce((n, i) => n + i.quantity, 0)} قطعة`, hideOnMobile: true },
    { key: 'total', header: 'المبلغ', cell: (o) => <span className="tabular-nums">{formatJOD(o.total)}</span> },
    { key: 'net', header: 'صافيك', cell: (o) => <b className="tabular-nums">{formatJOD(o.vendorNet)}</b> },
    { key: 'status', header: 'الحالة', cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <AdminPage title="الطلبات" description="طلبات منتجاتك فقط. حدّث الحالة عند التجهيز والتسليم.">
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <StatusOptions />
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(o) => o.id}
        rowHref={(o) => `/vendor/orders/${o.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: f.active ? 'لا توجد طلبات بهذه الحالة' : 'لا توجد طلبات بعد' }}
      />
    </AdminPage>
  );
}
