import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { StatusOptions } from '../../components/admin/StatusSelect';
import type { OrderRow } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterInput, FilterSelect, SearchInput } from '../../components/admin/ui';
import { Button, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { displayPhone, formatDate, formatJOD, formatTime } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KEYS = ['status', 'q', 'from', 'to'] as const;

export default function Orders() {
  useDocumentTitle('طلبات المتجر');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const list = useAdminQuery(
    () => api.get<Paged<OrderRow>>('/admin/orders', { ...v, page, pageSize: 20 }),
    [JSON.stringify(v), page],
    { live: true, keep: true },
  );

  const columns: Column<OrderRow>[] = [
    {
      key: 'num',
      header: 'الطلب',
      cell: (o) => (
        <span className="flex flex-col">
          <span>
            #{o.number} <span className="font-normal">{o.customerName}</span>
          </span>
          <span className="ltr text-start text-xs font-normal text-muted">{displayPhone(o.phone)}</span>
        </span>
      ),
    },
    {
      key: 'date',
      header: 'التاريخ',
      cell: (o) => (
        <span className="whitespace-nowrap">
          {formatDate(o.createdAt)} <span className="text-muted">· {formatTime(o.createdAt)}</span>
        </span>
      ),
    },
    { key: 'items', header: 'المنتجات', cell: (o) => `${o._count?.items ?? 0} صنف` },
    { key: 'addr', header: 'العنوان', cell: (o) => <span className="line-clamp-1 max-w-[14rem]">{o.address}</span>, hideOnMobile: true },
    { key: 'total', header: 'الإجمالي', cell: (o) => <b className="tabular-nums">{formatJOD(o.total)}</b>, align: 'end' },
    { key: 'status', header: 'الحالة', cell: (o) => <StatusBadge status={o.status} /> },
  ];

  return (
    <AdminPage title="طلبات المتجر" description="طلبات الشراء من المتجر الإلكتروني">
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم، هاتف، رقم الطلب…" />
        <FilterSelect label="الحالة" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
          <StatusOptions />
        </FilterSelect>
        <FilterInput label="من تاريخ" type="date" className="ltr" value={v.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label="إلى تاريخ" type="date" className="ltr" value={v.to} onChange={(e) => f.set({ to: e.target.value })} />
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(o) => o.id}
        rowHref={(o) => `/admin/orders/${o.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        rowClassName={(o) => (o.status === 'NEW' ? 'bg-sand-50/60 dark:bg-sand-700/10' : undefined)}
        empty={{
          title: f.active ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد',
          action: f.active ? (
            <Button variant="outline" size="sm" onClick={f.clear}>
              مسح الفلاتر
            </Button>
          ) : undefined,
        }}
      />
    </AdminPage>
  );
}
