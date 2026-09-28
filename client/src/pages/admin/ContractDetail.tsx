import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ContractFieldsForm, ContractStatusTag, type ContractDisplay, type ContractFields } from '../../components/admin/ContractExtras';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, Panel, StatTile } from '../../components/admin/ui';
import { Button, ErrorState, Input, Modal, StatusBadge, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD, todayAmman } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useDocumentTitle } from '../../lib/useAsync';

type Visit = { id: string; scheduledAt: string; status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'MISSED'; notes: string | null; completedAt: string | null; technician: { id: string; name: string } | null };
type FileRow = { id: string; kind: string; title: string; url: string; amount: number | null; createdAt: string };
type Detail = ContractFields & {
  id: string;
  number: number;
  ref: string | null;
  displayStatus: ContractDisplay;
  paid: number;
  remaining: number;
  visitsUsed: number;
  visitsScheduled: number;
  visitsRemaining: number | null;
  customer: { id: string; name: string; phone: string; companyName: string | null };
  services: { id: string; key: string; name: string }[];
  technician: { id: string; name: string } | null;
  corporateRequest: { id: string; number: number } | null;
  tender: { id: string; ref: string; title: string } | null;
  requests: { id: string; number: number; type: string; status: RequestStatus; createdAt: string }[];
  visits: Visit[];
  payments: { id: string; amount: number; method: string; paidAt: string; reference: string | null }[];
  quoteFiles: FileRow[];
  invoices: FileRow[];
  fileUrl: string | null;
  history: { id: string; action: string; createdAt: string; actor: { name: string } | null; meta: unknown }[];
};

/** صفحة العقد: الملخص المالي والزيارات، وكل ما يرتبط به، والتعديل */
export default function ContractDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/corporate/contracts/${id}`), [id]);
  const m = useMutation();
  const [editing, setEditing] = useState(false);
  const [visitDate, setVisitDate] = useState(todayAmman());
  useDocumentTitle(q.data?.ref ?? q.data?.title ?? t('contract.title'));

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data)
    return (
      <AdminPage title={t('contract.title')} back={{ to: '/admin/contracts', label: t('contract.title') }}>
        <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />
      </AdminPage>
    );
  const c = q.data;

  const addVisit = async () => {
    const r = await m.run('visit', () => api.post(`/admin/corporate/contracts/${c.id}/visits`, { scheduledAt: `${visitDate}T09:00:00+03:00` }), t('common.saved'));
    if (r) q.reload();
  };
  const setVisit = async (v: Visit, status: Visit['status']) => {
    const r = await m.run(`v-${v.id}`, () => api.patch(`/admin/corporate/contracts/visits/${v.id}`, { status }), t('common.saved'));
    if (r) q.reload();
  };

  return (
    <AdminPage
      back={{ to: '/admin/contracts', label: t('contract.title') }}
      title={c.title}
      meta={
        <>
          <ContractStatusTag status={c.displayStatus} />
          <Tag>{t(`contract.type.${c.type}`)}</Tag>
          <span className="ltr text-sm text-muted">{c.ref ?? `#${c.number}`}</span>
          {c.renewalStatus !== 'NONE' && <Tag tone="sand">{t(`contract.renewal.${c.renewalStatus}`)}</Tag>}
        </>
      }
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          {t('common.edit')}
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('contract.value')} value={formatJOD(c.value)} />
        <StatTile label={t('contract.paid')} value={formatJOD(c.paid)} tone="sand" />
        <StatTile label={t('contract.remaining')} value={formatJOD(c.remaining)} tone={c.remaining > 0 ? 'warn' : 'neutral'} />
        <StatTile
          label={t('contract.visitsUsed')}
          value={c.visitsIncluded != null ? `${c.visitsUsed} / ${c.visitsIncluded}` : String(c.visitsUsed)}
          sub={c.visitsRemaining != null ? `${t('contract.visitsRemaining')}: ${c.visitsRemaining}` : undefined}
          tone="brand"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title={`${t('contract.visits')} (${c.visits.length})`}
            actions={
              <span className="flex items-end gap-2">
                <Input label={t('contract.visitDate')} type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} wrapperClassName="[&_label]:sr-only" className="h-9 py-0 text-sm" />
                <Button size="sm" onClick={addVisit} loading={m.pending === 'visit'}>
                  {t('contract.addVisit')}
                </Button>
              </span>
            }
            bodyClassName="p-0 sm:p-0"
          >
            {c.visits.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.visits.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <span>
                      <span className="block font-medium">{formatDate(v.scheduledAt)}</span>
                      <span className="text-xs text-muted">{v.technician?.name ?? '—'}</span>
                    </span>
                    <select
                      aria-label={t('common.status')}
                      className="input h-9 w-auto py-0 text-sm"
                      value={v.status}
                      disabled={m.pending === `v-${v.id}`}
                      onChange={(e) => setVisit(v, e.target.value as Visit['status'])}
                    >
                      {(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED'] as const).map((s) => (
                        <option key={s} value={s}>
                          {t(`contract.visit.${s}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`${t('contract.requests')} (${c.requests.length})`} bodyClassName="p-0 sm:p-0">
            {c.requests.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.requests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <Link to={`/admin/corporate/${r.id}`} className="font-medium hover:underline">
                      #{r.number}
                    </Link>
                    <span className="flex items-center gap-3 text-sm text-muted">
                      {formatDate(r.createdAt)} <StatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`${t('contract.payments')} (${c.payments.length})`} bodyClassName="p-0 sm:p-0">
            {c.payments.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <span className="text-sm">
                      {formatDate(p.paidAt)} · {t(`pay.${p.method}` as never)}
                    </span>
                    <b className="tabular-nums">{formatJOD(p.amount)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`${t('contract.invoices')} / ${t('common.attachments')} (${c.quoteFiles.length})`} bodyClassName="p-0 sm:p-0">
            {c.quoteFiles.length === 0 && !c.fileUrl ? (
              <p className="p-4 text-sm text-muted sm:p-5">{t('contract.filesHint')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.fileUrl && (
                  <li className="px-4 py-3 sm:px-5">
                    <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      PDF
                    </a>
                  </li>
                )}
                {c.quoteFiles.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      {f.title}
                    </a>
                    <span className="text-sm text-muted">
                      {f.kind === 'INVOICE' && <Tag>{t('contract.invoices')}</Tag>} {f.amount != null && formatJOD(f.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={t('common.customer')}>
            <DefList
              cols={1}
              items={[
                [t('common.company'), <Link key="c" to={`/admin/customers/${c.customer.id}`} className="hover:underline">{c.customer.companyName ?? c.customer.name}</Link>],
                [t('contract.start'), formatDate(c.startDate)],
                [t('contract.end'), formatDate(c.endDate)],
                c.paymentMethod && [t('pay.title'), t(`pay.${c.paymentMethod}` as never)],
                [t('contract.technician'), c.technician?.name ?? '—'],
                c.responseHours != null && [t('contract.responseHours'), c.responseHours],
                [t('contract.services'), c.services.map((s) => s.name).join('، ') || '—'],
                c.tender && [t('contract.fromTender'), <Link key="t" to={`/admin/tenders/${c.tender.id}`} className="ltr hover:underline">{c.tender.ref}</Link>],
              ]}
            />
          </Panel>
          {c.terms && (
            <Panel title={t('contract.terms')}>
              <p className="whitespace-pre-line text-sm leading-relaxed">{c.terms}</p>
            </Panel>
          )}
          <Panel title={t('common.history')} bodyClassName="p-0 sm:p-0">
            <ul className="divide-y divide-line text-sm">
              {c.history.map((h) => (
                <li key={h.id} className="px-4 py-2.5 sm:px-5">
                  <span className="font-medium">{h.action}</span> <span className="text-muted">· {h.actor?.name ?? '—'} · {formatDate(h.createdAt, true)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={t('common.edit')} size="lg">
        {editing && (
          <ContractFieldsForm
            initial={{ ...c, serviceIds: c.services.map((s) => s.id), technicianId: c.technician?.id ?? null }}
            submitLabel={t('common.save')}
            busy={m.pending === 'save'}
            errors={m.fieldErrors}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const r = await m.run('save', () => api.patch(`/admin/corporate/contracts/${c.id}`, body), t('common.saved'));
              if (r) {
                setEditing(false);
                q.reload();
              }
            }}
          />
        )}
      </Modal>
    </AdminPage>
  );
}
