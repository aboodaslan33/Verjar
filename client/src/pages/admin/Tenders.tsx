import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerPicker, type PickedCustomer } from '../../components/admin/CustomerPicker';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, FilterBar, FilterSelect, SearchInput } from '../../components/admin/ui';
import { TenderForm, TenderStatusTag, type TenderRow } from '../../components/admin/TenderExtras';
import { Button, Icon, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Tenders() {
  const { t } = useI18n();
  useDocumentTitle(t('tender.title'));
  const f = useFilters(['status', 'q'] as const);
  const list = useAdminQuery(() => api.get<Paged<TenderRow>>('/admin/tenders', { ...f.values, page: f.page, pageSize: 20 }), [JSON.stringify(f.values), f.page], { keep: true });
  const [creating, setCreating] = useState(false);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const m = useMutation();
  const navigate = useNavigate();

  const columns: Column<TenderRow>[] = [
    {
      key: 'title',
      header: t('tender.name'),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.title}</span>
          <span className="text-xs text-muted">
            <span className="ltr">{r.ref}</span> · {r.customer.companyName ?? r.customer.name}
          </span>
        </span>
      ),
    },
    { key: 'service', header: t('tender.service'), cell: (r) => r.service?.name ?? '—', hideOnMobile: true },
    { key: 'deadline', header: t('tender.deadline'), cell: (r) => formatDate(r.deadline) },
    { key: 'offers', header: t('tender.offers'), cell: (r) => <span className="tabular-nums">{r._count.offers}</span> },
    { key: 'amount', header: t('tender.awardedAmount'), cell: (r) => (r.awardedAmount != null ? formatJOD(r.awardedAmount) : '—'), hideOnMobile: true },
    { key: 'status', header: t('common.status'), cell: (r) => <TenderStatusTag status={r.status} /> },
  ];

  return (
    <AdminPage
      title={t('tender.title')}
      description={t('tender.subtitle')}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" /> {t('tender.new')}
        </Button>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="TEN-2026-…" />
        <FilterSelect label={t('common.status')} value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {(['DRAFT', 'OPEN', 'CLOSED', 'UNDER_REVIEW', 'AWARDED', 'CANCELLED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`tender.status.${s}`)}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/tenders/${r.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: t('tender.none') }}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title={t('tender.new')} size="lg">
        {creating && (
          <div className="space-y-4">
            <CustomerPicker label={t('common.company')} value={customer} onChange={setCustomer} error={m.fieldErrors.customerId} />
            <TenderForm
              busy={m.busy}
              errors={m.fieldErrors}
              onSubmit={async (body) => {
                const r = await m.run('create', () => api.post<{ id: string }>('/admin/tenders', { ...body, customerId: customer?.id }), t('common.saved'));
                if (r) navigate(`/admin/tenders/${r.id}`);
              }}
            />
          </div>
        )}
      </Modal>
    </AdminPage>
  );
}
