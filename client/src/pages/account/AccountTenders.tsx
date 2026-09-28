import { useState } from 'react';
import { AttachmentList, AttachmentsUpload, OfferStatusTag, TenderForm, TenderStatusTag, type Attachment, type OfferStatus, type TenderRow } from '../../components/admin/TenderExtras';
import { Button, EmptyState, ErrorState, Modal, SkeletonRows } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { useAsync } from '../../lib/useAsync';

type MyTender = Omit<TenderRow, 'customer' | 'contract' | '_count'> & {
  createdAt: string;
  offers: { id: string; providerName: string; price: number; proposal: string; status: OfferStatus; submittedAt: string; attachments: Attachment[] }[];
};

/** عطاءات الشركة: نشر عطاء، متابعة العروض، إغلاق أو إلغاء */
export function TendersTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get<MyTender[]>('/account/tenders'), []);
  const [form, setForm] = useState<{ tender?: MyTender } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErrors({});
    try {
      if (form?.tender) await api.patch(`/account/tenders/${form.tender.id}`, body);
      else await api.post('/account/tenders', body);
      toast(t('common.saved'));
      setForm(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { title: err.message });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: 'OPEN' | 'CLOSED' | 'CANCELLED') => {
    try {
      await api.patch(`/account/tenders/${id}`, { status });
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'error', 'error');
    }
  };

  let body;
  if (loading && !data) body = <SkeletonRows rows={3} />;
  else if (error) body = <ErrorState message={error.message} onRetry={reload} />;
  else if (!data?.length)
    body = (
      <EmptyState
        title={t('tender.none')}
        description={t('tender.mineHint')}
        action={<Button onClick={() => setForm({})}>{t('tender.new')}</Button>}
      />
    );
  else
    body = (
      <ul className="space-y-3">
        {data.map((x) => {
          const editable = !['AWARDED', 'CANCELLED'].includes(x.status);
          return (
            <li key={x.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted">
                    <span className="ltr">{x.ref}</span> · {formatDate(x.createdAt)}
                  </p>
                </div>
                <TenderStatusTag status={x.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Meta label={t('tender.service')}>{x.service?.name ?? '—'}</Meta>
                <Meta label={t('tender.deadline')}>{formatDate(x.deadline)}</Meta>
                <Meta label={t('tender.budget')}>{x.budget != null ? formatJOD(x.budget) : '—'}</Meta>
                <Meta label={t('tender.awardedAmount')}>{x.awardedAmount != null ? formatJOD(x.awardedAmount) : '—'}</Meta>
              </dl>
              {x.attachments?.length > 0 && (
                <div className="mt-3">
                  <AttachmentList items={x.attachments} />
                </div>
              )}

              <h3 className="mb-2 mt-5 text-sm font-semibold">
                {t('tender.offers')} ({x.offers.length})
              </h3>
              {x.offers.length === 0 ? (
                <p className="text-sm text-muted">{t('common.none')}</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {x.offers.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{o.providerName}</p>
                        <p className="mt-0.5 whitespace-pre-line text-muted">{o.proposal}</p>
                        {o.attachments?.length > 0 && (
                          <div className="mt-2">
                            <AttachmentList items={o.attachments} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <b className="tabular-nums">{formatJOD(o.price)}</b>
                        <OfferStatusTag status={o.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {editable && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <Button size="sm" variant="outline" onClick={() => setForm({ tender: x })}>
                    {t('common.edit')}
                  </Button>
                  {x.status === 'DRAFT' || x.status === 'CLOSED' ? (
                    <Button size="sm" onClick={() => setStatus(x.id, 'OPEN')}>
                      {t('tender.publish')}
                    </Button>
                  ) : x.status === 'OPEN' ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(x.id, 'CLOSED')}>
                      {t('tender.close')}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setStatus(x.id, 'CANCELLED')}>
                    {t('common.cancel')}
                  </Button>
                  <span className="ms-auto">
                    <AttachmentsUpload path={`/account/tenders/${x.id}/attachments`} onDone={reload} />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <div>
      {!!data?.length && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{t('tender.mineHint')}</p>
          <Button size="sm" onClick={() => setForm({})}>
            {t('tender.new')}
          </Button>
        </div>
      )}
      {body}
      {form && (
        <Modal open onClose={() => setForm(null)} title={form.tender ? form.tender.title : t('tender.new')} size="lg">
          <TenderForm
            initial={form.tender}
            onSubmit={save}
            busy={busy}
            errors={errors}
            servicesPath="/corporate/services"
            withStatus={!form.tender}
          />
        </Modal>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}
