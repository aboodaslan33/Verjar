import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AttachmentList, AttachmentsUpload, OfferStatusTag, TenderForm, TenderStatusTag, type Attachment, type OfferStatus, type TenderRow, type TenderStatus } from '../../components/admin/TenderExtras';
import { AdminPage, DefList, DetailSkeleton, Panel, StatTile } from '../../components/admin/ui';
import { Button, ErrorState, Input, Modal, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useDocumentTitle } from '../../lib/useAsync';

type Offer = { id: string; providerName: string; price: number; proposal: string; status: OfferStatus; submittedAt: string; attachments: Attachment[]; vendor: { id: string; name: string } | null };
type Detail = TenderRow & { offers: Offer[]; history: { id: string; action: string; createdAt: string; actor: { name: string } | null }[] };

export default function TenderDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/tenders/${id}`), [id]);
  const m = useMutation();
  const [editing, setEditing] = useState(false);
  const [offering, setOffering] = useState(false);
  const [award, setAward] = useState<Offer | null>(null);
  const [price, setPrice] = useState('');
  const [proposal, setProposal] = useState('');
  useDocumentTitle(q.data?.ref ?? t('tender.title'));

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data)
    return (
      <AdminPage title={t('tender.title')} back={{ to: '/admin/tenders', label: t('tender.title') }}>
        <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />
      </AdminPage>
    );
  const tn = q.data;
  const closed = tn.status === 'AWARDED' || tn.status === 'CANCELLED';

  const setStatus = async (status: TenderStatus) => {
    const r = await m.run('status', () => api.patch(`/admin/tenders/${tn.id}`, { status }), t('common.saved'));
    if (r) q.reload();
  };

  return (
    <AdminPage
      back={{ to: '/admin/tenders', label: t('tender.title') }}
      title={tn.title}
      meta={
        <>
          <TenderStatusTag status={tn.status} />
          <span className="ltr text-sm text-muted">{tn.ref}</span>
        </>
      }
      actions={
        !closed && (
          <>
            <Select label={t('common.status')} wrapperClassName="[&_label]:sr-only" className="h-9 py-0 text-sm" value={tn.status} onChange={(e) => setStatus(e.target.value as TenderStatus)} disabled={m.busy}>
              {(['DRAFT', 'OPEN', 'CLOSED', 'UNDER_REVIEW', 'CANCELLED'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`tender.status.${s}`)}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          </>
        )
      }
    >
      {tn.status === 'AWARDED' && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t('tender.awardedAmount')} value={formatJOD(tn.awardedAmount ?? 0)} />
          <StatTile label={`${t('tender.commission')} (${tn.commissionPercent ?? 0}%)`} value={formatJOD(tn.commissionAmount ?? 0)} tone="brand" />
          <StatTile label={t('tender.providerAmount')} value={formatJOD(tn.providerAmount ?? 0)} tone="sand" />
          <div className="card flex items-center justify-center p-4">
            {tn.contract ? (
              <Link to={`/admin/contracts/${tn.contract.id}`} className="ltr font-semibold hover:underline">
                {tn.contract.ref ?? `#${tn.contract.number}`}
              </Link>
            ) : (
              <Button
                size="sm"
                loading={m.pending === 'contract'}
                onClick={async () => {
                  const r = await m.run('contract', () => api.post(`/admin/tenders/${tn.id}/contract`), t('contract.created'));
                  if (r) q.reload();
                }}
              >
                {t('tender.createContract')}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title={`${t('tender.offers')} (${tn.offers.length})`}
            actions={
              !closed && (
                <Button size="sm" variant="outline" onClick={() => setOffering(true)}>
                  {t('tender.platformOffer')}
                </Button>
              )
            }
            bodyClassName="p-0 sm:p-0"
          >
            {tn.offers.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {tn.offers.map((o) => (
                  <li key={o.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {o.providerName} {!o.vendor && <span className="text-xs text-muted">· {t('tender.platformOffer')}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <b className="tabular-nums">{formatJOD(o.price)}</b>
                        <OfferStatusTag status={o.status} />
                        {!closed && o.status === 'SUBMITTED' && (
                          <Button size="sm" onClick={() => setAward(o)}>
                            {t('tender.award')}
                          </Button>
                        )}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted">{o.proposal}</p>
                    <div className="mt-2">
                      <AttachmentList items={o.attachments} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatDate(o.submittedAt, true)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t('tender.description')}>
            <p className="whitespace-pre-line leading-relaxed">{tn.description}</p>
            {tn.requirements && (
              <>
                <h3 className="mt-5 font-sans text-sm font-semibold">{t('tender.requirements')}</h3>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{tn.requirements}</p>
              </>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title={t('common.company')}>
            <DefList
              cols={1}
              items={[
                [t('common.company'), <Link key="c" to={`/admin/customers/${tn.customer.id}`} className="hover:underline">{tn.customer.companyName ?? tn.customer.name}</Link>],
                [t('tender.service'), tn.service?.name ?? '—'],
                [t('tender.location'), tn.location],
                [t('tender.duration'), tn.durationMonths ?? '—'],
                [t('tender.deadline'), formatDate(tn.deadline)],
                [t('tender.budget'), tn.budget != null ? formatJOD(tn.budget) : '—'],
              ]}
            />
          </Panel>
          <Panel title={t('common.attachments')} actions={<AttachmentsUpload path={`/admin/tenders/${tn.id}/attachments`} onDone={q.reload} />}>
            {tn.attachments.length ? <AttachmentList items={tn.attachments} /> : <p className="text-sm text-muted">—</p>}
          </Panel>
          <Panel title={t('common.history')} bodyClassName="p-0 sm:p-0">
            <ul className="divide-y divide-line text-sm">
              {tn.history.map((h) => (
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
          <TenderForm
            initial={tn}
            withStatus={false}
            busy={m.pending === 'save'}
            errors={m.fieldErrors}
            onSubmit={async (body) => {
              const r = await m.run('save', () => api.patch(`/admin/tenders/${tn.id}`, body), t('common.saved'));
              if (r) {
                setEditing(false);
                q.reload();
              }
            }}
          />
        )}
      </Modal>
      <Modal
        open={offering}
        onClose={() => setOffering(false)}
        title={t('tender.platformOffer')}
        footer={
          <Button
            loading={m.pending === 'offer'}
            onClick={async () => {
              const r = await m.run('offer', () => api.post(`/admin/tenders/${tn.id}/offers`, { price: Number(price), proposal }), t('common.saved'));
              if (r) {
                setOffering(false);
                setPrice('');
                setProposal('');
                q.reload();
              }
            }}
          >
            {t('tender.submitOffer')}
          </Button>
        }
      >
        <div className="space-y-4">
          <Input label={t('tender.price')} type="number" min={0} className="ltr text-start" value={price} onChange={(e) => setPrice(e.target.value)} error={m.fieldErrors.price} />
          <Textarea label={t('tender.proposal')} rows={5} value={proposal} onChange={(e) => setProposal(e.target.value)} error={m.fieldErrors.proposal} />
        </div>
      </Modal>
      <ConfirmDialog
        open={!!award}
        tone="primary"
        title={t('tender.award')}
        confirmLabel={t('tender.award')}
        loading={m.pending === 'award'}
        onClose={() => setAward(null)}
        onConfirm={async () => {
          if (!award) return;
          const r = await m.run('award', () => api.post(`/admin/tenders/${tn.id}/award`, { offerId: award.id }), t('tender.awarded'));
          setAward(null);
          if (r) q.reload();
        }}
      >
        {award && (
          <>
            {award.providerName} — {formatJOD(award.price)}. {t('tender.awardConfirm')}
          </>
        )}
      </ConfirmDialog>
    </AdminPage>
  );
}
