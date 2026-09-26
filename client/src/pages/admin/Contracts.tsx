import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ContractForm } from '../../components/admin/ContractForm';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { FileUploadForm } from '../../components/admin/FileUploadForm';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { CONTRACT_STATUS_LABEL, daysUntil } from '../../components/admin/labels';
import type { Contract } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterSelect } from '../../components/admin/ui';
import { Button, ButtonLink, Icon, Modal, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KEYS = ['status', 'expiring'] as const;

export default function Contracts() {
  useDocumentTitle('عقود الشركات');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const list = useAdminQuery(
    () => api.get<Paged<Contract>>('/admin/corporate/contracts', { ...v, page, pageSize: 20 }),
    [JSON.stringify(v), page],
    { keep: true },
  );
  const [edit, setEdit] = useState<Contract | null>(null);
  const [upload, setUpload] = useState<Contract | null>(null);

  const columns: Column<Contract>[] = [
    {
      key: 'company',
      header: 'الشركة / العقد',
      cell: (c) => (
        <span className="flex flex-col">
          <span className="font-medium">{c.corporateRequest?.companyName ?? c.customer?.companyName ?? c.customer?.name}</span>
          <span className="text-xs text-muted">
            {c.title} · #{c.number}
          </span>
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'المدة',
      cell: (c) => (
        <span className="whitespace-nowrap text-sm">
          {formatDate(c.startDate)} — {formatDate(c.endDate)}
        </span>
      ),
    },
    {
      key: 'left',
      header: 'المتبقي',
      cell: (c) => {
        if (c.status !== 'ACTIVE') return <span className="text-muted">—</span>;
        const left = daysUntil(c.endDate);
        if (left < 0) return <span className="font-semibold text-danger">انتهى منذ {-left} يوم</span>;
        return (
          <span className={cx('tabular-nums', left <= c.reminderDays ? 'font-bold text-warn' : 'text-ink')}>
            {left} يوم
          </span>
        );
      },
    },
    { key: 'value', header: 'القيمة', cell: (c) => <span className="tabular-nums">{formatJOD(c.value)}</span> },
    { key: 'status', header: 'الحالة', cell: (c) => <Tag tone={c.status === 'ACTIVE' ? 'brand' : c.status === 'CANCELLED' ? 'danger' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Tag> },
    {
      key: 'file',
      header: 'الملف',
      cell: (c) =>
        c.fileUrl ? (
          <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
            <Icon name="file" className="h-4 w-4" /> عرض
          </a>
        ) : (
          <span className="text-xs text-muted">لم يُرفع</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      cell: (c) => (
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>
            تعديل
          </Button>
          <Button size="sm" variant="outline" onClick={() => setUpload(c)}>
            <Icon name="upload" className="h-4 w-4" /> PDF
          </Button>
          {c.corporateRequest && (
            <Link to={`/admin/corporate/${c.corporateRequest.id}`} className="grid h-9 place-items-center rounded-xl px-2 text-sm text-muted hover:bg-subtle hover:text-ink">
              الطلب
            </Link>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="عقود الشركات"
      description="العقود السارية والمنتهية وتذكيرات التجديد"
      actions={
        <ButtonLink to="/admin/corporate" variant="outline" size="sm">
          طلبات الشركات
        </ButtonLink>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label="الحالة" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">الكل</option>
          {(Object.keys(CONTRACT_STATUS_LABEL) as (keyof typeof CONTRACT_STATUS_LABEL)[]).map((s) => (
            <option key={s} value={s}>
              {CONTRACT_STATUS_LABEL[s]}
            </option>
          ))}
        </FilterSelect>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm">
          <input type="checkbox" className="accent-brand-700" checked={v.expiring === 'true'} onChange={(e) => f.set({ expiring: e.target.checked ? 'true' : '' })} />
          تنتهي خلال 60 يوم
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(c) => c.id}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        rowClassName={(c) =>
          c.status === 'ACTIVE' && daysUntil(c.endDate) <= c.reminderDays ? 'bg-warn/5' : undefined
        }
        empty={{
          title: f.active ? 'لا توجد عقود مطابقة' : 'لا توجد عقود بعد',
          description: 'تُنشأ العقود من صفحة طلب الشركة عبر «تحويل إلى عقد».',
        }}
      />

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`تعديل العقد #${edit?.number ?? ''}`}>
        {edit && (
          <ContractForm
            contract={edit}
            onCancel={() => setEdit(null)}
            onSaved={() => {
              setEdit(null);
              list.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={!!upload} onClose={() => setUpload(null)} title="رفع ملف العقد النهائي">
        {upload && (
          <>
            <p className="mb-4 text-sm text-muted">يظهر الملف للعميل في صفحته ويُرفق بالعقد «{upload.title}».</p>
            <FileUploadForm
              target={{ contractId: upload.id }}
              kinds={['CONTRACT']}
              defaultKind="CONTRACT"
              defaultTitle={`عقد — ${upload.title}`}
              showAmount={false}
              onUploaded={() => list.reload()}
            />
          </>
        )}
      </Modal>
    </AdminPage>
  );
}
