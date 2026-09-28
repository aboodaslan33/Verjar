import { useState } from 'react';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AttachmentList, AttachmentsUpload, OfferStatusTag, TenderStatusTag, type Attachment, type OfferStatus, type TenderStatus } from '../../components/admin/TenderExtras';
import { AdminPage } from '../../components/admin/ui';
import { Button, EmptyState, ErrorState, Input, Modal, SkeletonRows, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useDocumentTitle } from '../../lib/useAsync';

type VendorTender = {
  id: string;
  ref: string;
  title: string;
  description: string;
  location: string;
  durationMonths: number | null;
  deadline: string;
  budget: number | null;
  requirements: string | null;
  attachments: Attachment[];
  status: TenderStatus;
  service: { name: string } | null;
  company: string;
  offers: { id: string; price: number; proposal: string; status: OfferStatus; submittedAt: string; attachments: Attachment[] }[];
};

/** عطاءات الشركات المفتوحة: المورد يقدّم عرضًا أو يسحبه ويرفق ملفاته */
export default function VendorTenders() {
  const { t } = useI18n();
  useDocumentTitle(t('tender.title'));
  const q = useAdminQuery(() => api.get<VendorTender[]>('/vendor/tenders'), []);
  const m = useMutation();
  const [offerFor, setOfferFor] = useState<VendorTender | null>(null);

  const withdraw = async (id: string) => {
    if (await m.run(`w-${id}`, () => api.post(`/vendor/tender-offers/${id}/withdraw`, {}), t('tender.offer.WITHDRAWN'))) q.reload();
  };

  return (
    <AdminPage title={t('tender.openForOffers')} description={t('tender.subtitle')}>
      {q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.retry} />
      ) : q.loading && !q.data ? (
        <SkeletonRows rows={3} />
      ) : !q.data?.length ? (
        <EmptyState title={t('tender.none')} />
      ) : (
        <ul className="space-y-4">
          {q.data.map((x) => {
            const mine = x.offers.find((o) => o.status === 'SUBMITTED');
            const canOffer = x.status === 'OPEN' && new Date(x.deadline) >= new Date() && !mine;
            return (
              <li key={x.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{x.title}</p>
                    <p className="text-xs text-muted">
                      <span className="ltr">{x.ref}</span> · {x.company}
                    </p>
                  </div>
                  <TenderStatusTag status={x.status} />
                </div>
                <p className="mt-3 whitespace-pre-line text-sm">{x.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Meta label={t('tender.service')}>{x.service?.name ?? '—'}</Meta>
                  <Meta label={t('tender.location')}>{x.location}</Meta>
                  <Meta label={t('tender.deadline')}>{formatDate(x.deadline)}</Meta>
                  <Meta label={t('tender.budget')}>{x.budget != null ? formatJOD(x.budget) : '—'}</Meta>
                </dl>
                {x.requirements && <p className="mt-3 whitespace-pre-line text-sm text-muted">{x.requirements}</p>}
                {x.attachments?.length > 0 && (
                  <div className="mt-3">
                    <AttachmentList items={x.attachments} />
                  </div>
                )}

                {x.offers.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-line pt-4">
                    <p className="text-sm font-semibold">{t('tender.yourOffer')}</p>
                    {x.offers.map((o) => (
                      <div key={o.id} className="rounded-lg border border-line p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b className="tabular-nums">{formatJOD(o.price)}</b>
                          <OfferStatusTag status={o.status} />
                        </div>
                        <p className="mt-1 whitespace-pre-line text-muted">{o.proposal}</p>
                        {o.attachments?.length > 0 && (
                          <div className="mt-2">
                            <AttachmentList items={o.attachments} />
                          </div>
                        )}
                        {o.status === 'SUBMITTED' && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <AttachmentsUpload path={`/vendor/tender-offers/${o.id}/attachments`} onDone={q.reload} />
                            <Button size="sm" variant="ghost" loading={m.pending === `w-${o.id}`} onClick={() => withdraw(o.id)}>
                              {t('tender.withdraw')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canOffer && (
                  <div className="mt-4">
                    <Button size="sm" onClick={() => setOfferFor(x)}>
                      {t('tender.submitOffer')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {offerFor && <OfferModal tender={offerFor} onClose={() => setOfferFor(null)} onSaved={q.reload} />}
    </AdminPage>
  );
}

function OfferModal({ tender, onClose, onSaved }: { tender: VendorTender; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const m = useMutation();
  const [price, setPrice] = useState('');
  const [proposal, setProposal] = useState('');
  const submit = async () => {
    const r = await m.run('offer', () => api.post(`/vendor/tenders/${tender.id}/offers`, { price: Number(price), proposal: proposal.trim() }), t('common.saved'));
    if (r) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('tender.submitOffer')} — ${tender.ref}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={m.pending === 'offer'}>
            {t('tender.submitOffer')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={t('tender.price')} type="number" min={0} className="ltr text-start" value={price} onChange={(e) => setPrice(e.target.value)} error={m.fieldErrors.price} />
        <Textarea label={t('tender.proposal')} rows={5} value={proposal} onChange={(e) => setProposal(e.target.value)} error={m.fieldErrors.proposal} />
      </div>
    </Modal>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}
