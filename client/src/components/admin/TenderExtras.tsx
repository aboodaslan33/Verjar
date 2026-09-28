import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { addDays, todayAmman } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Button, Input, Select, Tag, Textarea } from '../ui';
import { isoToDateInput } from './labels';

export type TenderStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'UNDER_REVIEW' | 'AWARDED' | 'CANCELLED';
export type OfferStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
export type Attachment = { url: string; name: string; kind: string };

export type TenderRow = {
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
  serviceId: string | null;
  awardedAmount: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
  providerAmount: number | null;
  awardedOfferId: string | null;
  customer: { id: string; name: string; companyName: string | null; phone: string };
  service: { id: string; name: string } | null;
  contract: { id: string; ref: string | null; number: number } | null;
  _count: { offers: number };
};

export function TenderStatusTag({ status }: { status: TenderStatus }) {
  const { t } = useI18n();
  return <Tag tone={status === 'OPEN' ? 'brand' : status === 'AWARDED' ? 'dark' : status === 'CANCELLED' ? 'danger' : 'neutral'}>{t(`tender.status.${status}`)}</Tag>;
}

export function OfferStatusTag({ status }: { status: OfferStatus }) {
  const { t } = useI18n();
  return <Tag tone={status === 'ACCEPTED' ? 'success' : status === 'REJECTED' || status === 'WITHDRAWN' ? 'neutral' : 'brand'}>{t(`tender.offer.${status}`)}</Tag>;
}

type Service = { id: string; name: string; active: boolean };

/** نموذج بيانات العطاء — تستخدمه لوحة التحكم وصفحة حساب الشركة */
export function TenderForm({
  initial,
  onSubmit,
  busy,
  errors,
  servicesPath = '/admin/corporate/services',
  withStatus = true,
}: {
  initial?: Partial<TenderRow>;
  onSubmit: (body: Record<string, unknown>) => void;
  busy?: boolean;
  errors: Record<string, string>;
  servicesPath?: string;
  withStatus?: boolean;
}) {
  const { t } = useI18n();
  const [services, setServices] = useState<Service[] | null>(null);
  useEffect(() => {
    api.get<Service[]>(servicesPath).then(setServices).catch(() => setServices([]));
  }, [servicesPath]);
  const [f, setF] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    serviceId: initial?.serviceId ?? '',
    location: initial?.location ?? '',
    durationMonths: initial?.durationMonths != null ? String(initial.durationMonths) : '12',
    deadline: initial?.deadline ? isoToDateInput(initial.deadline) : addDays(todayAmman(), 14),
    budget: initial?.budget != null ? String(initial.budget) : '',
    requirements: initial?.requirements ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const body = (status?: 'DRAFT' | 'OPEN') => ({
    title: f.title.trim(),
    description: f.description.trim(),
    serviceId: f.serviceId || null,
    location: f.location.trim(),
    durationMonths: f.durationMonths ? Number(f.durationMonths) : null,
    deadline: `${f.deadline}T23:59:00+03:00`,
    budget: f.budget ? Number(f.budget) : null,
    requirements: f.requirements.trim() || null,
    ...(status ? { status } : {}),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(body(withStatus ? 'OPEN' : undefined));
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Input label={t('tender.name')} value={f.title} onChange={(e) => set('title', e.target.value)} error={errors.title} />
      <Textarea label={t('tender.description')} rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} error={errors.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={t('tender.service')} value={f.serviceId} onChange={(e) => set('serviceId', e.target.value)} error={errors.serviceId}>
          <option value="">—</option>
          {services?.filter((s) => s.active !== false).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input label={t('tender.location')} value={f.location} onChange={(e) => set('location', e.target.value)} error={errors.location} />
        <Input label={t('tender.duration')} type="number" min={1} className="ltr text-start" value={f.durationMonths} onChange={(e) => set('durationMonths', e.target.value)} error={errors.durationMonths} />
        <Input label={t('tender.deadline')} type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} error={errors.deadline} />
        <Input label={`${t('tender.budget')} ${t('common.optional')}`} type="number" min={0} className="ltr text-start" value={f.budget} onChange={(e) => set('budget', e.target.value)} error={errors.budget} />
      </div>
      <Textarea label={`${t('tender.requirements')} ${t('common.optional')}`} rows={4} value={f.requirements} onChange={(e) => set('requirements', e.target.value)} error={errors.requirements} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {withStatus ? t('tender.publish') : t('common.save')}
        </Button>
        {withStatus && (
          <Button variant="outline" disabled={busy} onClick={() => onSubmit(body('DRAFT'))}>
            {t('tender.saveDraft')}
          </Button>
        )}
      </div>
    </form>
  );
}

/** رفع مرفقات إلى مسار (عطاء أو عرض) */
export function AttachmentsUpload({ path, onDone }: { path: string; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline">
      {busy ? '…' : t('common.upload')}
      <input
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          const fd = new FormData();
          files.forEach((f) => fd.append('files', f));
          setBusy(true);
          setError(undefined);
          try {
            await api.post(path, fd);
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'error');
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
      {error && <span className="text-danger">{error}</span>}
    </label>
  );
}

export function AttachmentList({ items }: { items: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a, i) => (
        <li key={i}>
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-sm hover:border-ink">
            {a.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
