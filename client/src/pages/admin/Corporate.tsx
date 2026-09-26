import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { URGENCY_LEVEL_LABEL } from '../../components/admin/labels';
import { StatusOptions } from '../../components/admin/StatusSelect';
import type { CorporateRow } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterSelect, SearchInput } from '../../components/admin/ui';
import { Button, ButtonLink, StatusBadge, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { CORPORATE_TYPE_LABEL, displayPhone, formatDate } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KEYS = ['status', 'type', 'q'] as const;

export default function Corporate() {
  useDocumentTitle('طلبات الشركات');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const list = useAdminQuery(
    () => api.get<Paged<CorporateRow>>('/admin/corporate/requests', { ...v, page, pageSize: 20 }),
    [JSON.stringify(v), page],
    { live: true },
  );

  const columns: Column<CorporateRow>[] = [
    {
      key: 'company',
      header: 'الشركة',
      cell: (r) => (
        <span className="flex flex-col">
          <span>
            {r.companyName} <span className="text-xs font-normal text-muted">#{r.number}</span>
          </span>
          <span className="text-xs font-normal text-muted">{r.contactName}</span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'النوع',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          {CORPORATE_TYPE_LABEL[r.type]}
          {r.type === 'URGENT' && r.urgencyLevel && (
            <Tag tone={r.urgencyLevel === 'CRITICAL' || r.urgencyLevel === 'HIGH' ? 'danger' : 'sand'}>{URGENCY_LEVEL_LABEL[r.urgencyLevel]}</Tag>
          )}
        </span>
      ),
    },
    { key: 'phone', header: 'هاتف المدير', cell: (r) => <span className="ltr">{displayPhone(r.managerPhone)}</span> },
    {
      key: 'services',
      header: 'الخدمات',
      cell: (r) => <span className="line-clamp-1 max-w-[16rem] text-muted">{r.services.map((s) => s.name).join('، ') || '—'}</span>,
      hideOnMobile: true,
    },
    { key: 'date', header: 'التاريخ', cell: (r) => formatDate(r.createdAt) },
    {
      key: 'status',
      header: 'الحالة',
      cell: (r) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={r.status} />
          {(r._count?.contracts ?? 0) > 0 && <Tag tone="brand">عقد</Tag>}
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="طلبات الشركات"
      description="عقود الصيانة السنوية وطلبات الصيانة العاجلة للمصانع والشركات"
      actions={
        <ButtonLink to="/admin/contracts" variant="outline" size="sm">
          العقود
        </ButtonLink>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم الشركة، المسؤول، المرجع…" />
        <FilterSelect label="الحالة" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
          <StatusOptions />
        </FilterSelect>
        <FilterSelect label="النوع" value={v.type} onChange={(e) => f.set({ type: e.target.value })}>
          <option value="">الكل</option>
          <option value="ANNUAL">{CORPORATE_TYPE_LABEL.ANNUAL}</option>
          <option value="URGENT">{CORPORATE_TYPE_LABEL.URGENT}</option>
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/corporate/${r.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        rowClassName={(r) => (r.status === 'NEW' ? 'bg-sand-50/60 dark:bg-sand-700/10' : undefined)}
        empty={{
          title: f.active ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات شركات بعد',
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
