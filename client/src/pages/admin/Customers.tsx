import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import type { CustomerRow } from '../../components/admin/types';
import { AdminPage, FilterBar, SearchInput } from '../../components/admin/ui';
import { api } from '../../lib/api';
import { displayPhone, formatDate } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KEYS = ['q'] as const;

export default function Customers() {
  useDocumentTitle('العملاء');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const list = useAdminQuery(() => api.get<Paged<CustomerRow>>('/admin/customers', { ...v, page, pageSize: 20 }), [v.q, page], { keep: true });

  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'العميل',
      cell: (c) => (
        <span className="flex flex-col">
          <span>{c.name}</span>
          {c.companyName && <span className="text-xs font-normal text-muted">{c.companyName}</span>}
        </span>
      ),
    },
    { key: 'phone', header: 'الهاتف', cell: (c) => <span className="ltr">{displayPhone(c.phone)}</span> },
    { key: 'b', header: 'حجوزات', cell: (c) => <span className="tabular-nums">{c._count.bookings}</span>, align: 'center' },
    { key: 'o', header: 'طلبات', cell: (c) => <span className="tabular-nums">{c._count.orders}</span>, align: 'center' },
    { key: 'cr', header: 'شركات', cell: (c) => <span className="tabular-nums">{c._count.corporateRequests}</span>, align: 'center' },
    { key: 'created', header: 'منذ', cell: (c) => formatDate(c.createdAt), hideOnMobile: true },
    { key: 'login', header: 'آخر دخول', cell: (c) => (c.lastLoginAt ? formatDate(c.lastLoginAt) : <span className="text-muted">—</span>), hideOnMobile: true },
  ];

  return (
    <AdminPage title="العملاء" description="يُنشأ العميل تلقائيًا عند أول حجز أو طلب برقم هاتفه">
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم، شركة، رقم هاتف…" />
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(c) => c.id}
        rowHref={(c) => `/admin/customers/${c.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: f.active ? 'لا يوجد عملاء مطابقون' : 'لا يوجد عملاء بعد' }}
      />
    </AdminPage>
  );
}
