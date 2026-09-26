import { Link, useSearchParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery } from '../../components/admin/hooks';
import {
  ACTOR_TYPE_LABEL,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  WA_CHANNEL_LABEL,
  WA_STATUS_LABEL,
} from '../../components/admin/labels';
import type { AuditLog, WhatsAppLog } from '../../components/admin/types';
import { AdminPage, Truncated } from '../../components/admin/ui';
import { Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, displayPhone, formatDate } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type TabKey = 'whatsapp' | 'audit';

export default function Logs() {
  useDocumentTitle('السجلات');
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'audit' ? 'audit' : 'whatsapp';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const go = (patch: { tab?: TabKey; page?: number }) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (patch.tab) {
          n.set('tab', patch.tab);
          n.delete('page');
        }
        if (patch.page) {
          if (patch.page > 1) n.set('page', String(patch.page));
          else n.delete('page');
        }
        return n;
      },
      { replace: true },
    );

  return (
    <AdminPage title="السجلات" description="رسائل واتساب المرسلة وسجل عمليات الإدارة">
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ['whatsapp', 'سجل واتساب'],
            ['audit', 'سجل العمليات'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => go({ tab: k })}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm',
              tab === k ? 'border-brand-600 font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'whatsapp' ? <WhatsAppLogs page={page} onPage={(p) => go({ page: p })} /> : <AuditLogs page={page} onPage={(p) => go({ page: p })} />}
    </AdminPage>
  );
}

const ENTITY_PATH: Record<string, string> = {
  booking: '/admin/bookings/',
  order: '/admin/orders/',
  corporate: '/admin/corporate/',
  product: '/admin/products/',
  customer: '/admin/customers/',
};

function WhatsAppLogs({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const q = useAdminQuery(() => api.get<Paged<WhatsAppLog>>('/admin/logs/whatsapp', { page, pageSize: 30 }), [page], { live: true, keep: true });
  const columns: Column<WhatsAppLog>[] = [
    { key: 'date', header: 'التاريخ', cell: (l) => <span className="whitespace-nowrap text-sm">{formatDate(l.createdAt, true)}</span> },
    { key: 'to', header: 'إلى', cell: (l) => <span className="ltr">{displayPhone(l.to)}</span> },
    { key: 'channel', header: 'القناة', cell: (l) => <span className="text-xs text-muted">{WA_CHANNEL_LABEL[l.channel]}</span> },
    {
      key: 'status',
      header: 'الحالة',
      cell: (l) => <Tag tone={l.status === 'SENT' ? 'brand' : l.status === 'FAILED' ? 'danger' : 'sand'}>{WA_STATUS_LABEL[l.status]}</Tag>,
    },
    {
      key: 'msg',
      header: 'الرسالة',
      className: 'max-w-[22rem]',
      cell: (l) => (
        <span className="block text-sm text-muted">
          <Truncated text={l.message} />
          {l.error && <span className="mt-0.5 block text-xs text-danger">{l.error}</span>}
        </span>
      ),
    },
    {
      key: 'link',
      header: '',
      align: 'end',
      cell: (l) => (
        <span className="flex justify-end gap-2 whitespace-nowrap text-sm">
          {l.entityType && l.entityId && ENTITY_PATH[l.entityType] && (
            <Link to={ENTITY_PATH[l.entityType] + l.entityId} className="text-muted hover:text-ink hover:underline">
              العنصر
            </Link>
          )}
          {l.link && (
            <a href={l.link} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-200">
              فتح
            </a>
          )}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      rows={q.data?.items}
      columns={columns}
      rowKey={(l) => l.id}
      loading={q.loading}
      refreshing={q.refreshing}
      error={q.error}
      onRetry={q.retry}
      total={q.data?.total}
      page={q.data?.page}
      pages={q.data?.pages}
      onPage={onPage}
      empty={{ title: 'لا توجد رسائل بعد', description: 'تُسجّل هنا كل رسالة واتساب تُجهّز أو تُرسل.' }}
    />
  );
}

function metaText(meta: unknown): string {
  if (meta == null) return '';
  if (Array.isArray(meta)) return meta.join('، ');
  if (typeof meta === 'object') {
    return Object.entries(meta as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  }
  return String(meta);
}

function AuditLogs({ page, onPage }: { page: number; onPage: (p: number) => void }) {
  const q = useAdminQuery(() => api.get<Paged<AuditLog>>('/admin/logs/audit', { page, pageSize: 30 }), [page], { keep: true });
  const columns: Column<AuditLog>[] = [
    { key: 'date', header: 'التاريخ', cell: (l) => <span className="whitespace-nowrap text-sm">{formatDate(l.createdAt, true)}</span> },
    { key: 'actor', header: 'المنفّذ', cell: (l) => l.actor?.name ?? ACTOR_TYPE_LABEL[l.actorType] ?? l.actorType },
    { key: 'action', header: 'العملية', cell: (l) => <Tag>{AUDIT_ACTION_LABEL[l.action] ?? l.action}</Tag> },
    {
      key: 'entity',
      header: 'العنصر',
      cell: (l) => {
        const label = AUDIT_ENTITY_LABEL[l.entity] ?? l.entity;
        const path = l.entityId && ENTITY_PATH[l.entity];
        return path && l.action !== 'delete' ? (
          <Link to={path + l.entityId} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      key: 'meta',
      header: 'تفاصيل',
      className: 'max-w-[22rem]',
      hideOnMobile: true,
      cell: (l) => <span className="ltr block truncate text-start text-xs text-muted" title={metaText(l.meta)}>{metaText(l.meta)}</span>,
    },
  ];
  return (
    <DataTable
      rows={q.data?.items}
      columns={columns}
      rowKey={(l) => l.id}
      loading={q.loading}
      refreshing={q.refreshing}
      error={q.error}
      onRetry={q.retry}
      total={q.data?.total}
      page={q.data?.page}
      pages={q.data?.pages}
      onPage={onPage}
      empty={{ title: 'لا توجد عمليات مسجلة' }}
    />
  );
}
