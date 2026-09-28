import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { addDays, cx, todayAmman } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Button, Input, Select, Tag, Textarea } from '../ui';
import { CustomerPicker, type PickedCustomer } from './CustomerPicker';
import { useAdminQuery, useMutation } from './hooks';
import { isoToDateInput } from './labels';

export type ContractDisplay = 'DRAFT' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELLED';
type Service = { id: string; key: string; name: string; kind: 'ANNUAL' | 'URGENT'; active: boolean };
type Technician = { id: string; name: string; active: boolean };

export function ContractStatusTag({ status }: { status: ContractDisplay }) {
  const { t } = useI18n();
  const tone = status === 'ACTIVE' ? 'brand' : status === 'EXPIRING_SOON' ? 'dark' : status === 'CANCELLED' ? 'danger' : 'neutral';
  return <Tag tone={tone}>{t(`contract.status.${status}`)}</Tag>;
}

export type ContractFields = {
  title: string;
  type: 'MAINTENANCE' | 'ANNUAL_CORPORATE';
  startDate: string;
  endDate: string;
  value: number;
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  paymentMethod: string | null;
  serviceIds: string[];
  visitsIncluded: number | null;
  responseHours: number | null;
  technicianId: string | null;
  terms: string | null;
  renewalStatus: 'NONE' | 'PENDING' | 'RENEWED' | 'NOT_RENEWING';
  reminderDays: number;
  notes: string | null;
};

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/**
 * نموذج العقد الكامل (إنشاء مباشر أو تعديل): النوع، المدة، القيمة، طريقة الدفع،
 * الخدمات المشمولة (من كتالوج خدمات الشركات، ومنها مكافحة الآفات)، الزيارات، زمن الاستجابة، الفني، والشروط.
 */
export function ContractFieldsForm({
  initial,
  withCustomer,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
  errors,
}: {
  initial?: Partial<ContractFields>;
  withCustomer?: boolean;
  submitLabel: string;
  onSubmit: (body: Partial<ContractFields> & { customerId?: string }) => void;
  onCancel?: () => void;
  busy?: boolean;
  errors: Record<string, string>;
}) {
  const { t } = useI18n();
  const today = todayAmman();
  const services = useAdminQuery(() => api.get<Service[]>('/admin/corporate/services'), []);
  const techs = useAdminQuery(() => api.get<Technician[]>('/admin/technicians'), []);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [f, setF] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? 'ANNUAL_CORPORATE',
    startDate: initial?.startDate ? isoToDateInput(initial.startDate) : today,
    endDate: initial?.endDate ? isoToDateInput(initial.endDate) : addDays(today, 365),
    value: initial?.value != null ? String(initial.value) : '',
    status: initial?.status ?? 'ACTIVE',
    paymentMethod: initial?.paymentMethod ?? '',
    serviceIds: initial?.serviceIds ?? [],
    visitsIncluded: initial?.visitsIncluded != null ? String(initial.visitsIncluded) : '',
    responseHours: initial?.responseHours != null ? String(initial.responseHours) : '',
    technicianId: initial?.technicianId ?? '',
    terms: initial?.terms ?? '',
    renewalStatus: initial?.renewalStatus ?? 'NONE',
    reminderDays: initial?.reminderDays != null ? String(initial.reminderDays) : '30',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggleService = (id: string) => set('serviceIds', f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...(withCustomer ? { customerId: customer?.id } : {}),
      title: f.title.trim(),
      type: f.type,
      startDate: f.startDate,
      endDate: f.endDate,
      value: Number(f.value),
      status: f.status,
      paymentMethod: f.paymentMethod || null,
      serviceIds: f.serviceIds,
      visitsIncluded: numOrNull(f.visitsIncluded),
      responseHours: numOrNull(f.responseHours),
      technicianId: f.technicianId || null,
      terms: f.terms.trim() || null,
      renewalStatus: f.renewalStatus,
      reminderDays: Number(f.reminderDays) || 30,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {withCustomer && <CustomerPicker label={t('common.customer')} value={customer} onChange={setCustomer} error={errors.customerId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('contract.name')} value={f.title} onChange={(e) => set('title', e.target.value)} error={errors.title} wrapperClassName="sm:col-span-2" />
        <Select label={t('contract.type')} value={f.type} onChange={(e) => set('type', e.target.value as ContractFields['type'])}>
          <option value="ANNUAL_CORPORATE">{t('contract.type.ANNUAL_CORPORATE')}</option>
          <option value="MAINTENANCE">{t('contract.type.MAINTENANCE')}</option>
        </Select>
        <Select label={t('common.status')} value={f.status} onChange={(e) => set('status', e.target.value as ContractFields['status'])}>
          {(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`contract.status.${s}`)}
            </option>
          ))}
        </Select>
        <Input label={t('contract.start')} type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} error={errors.startDate} />
        <Input label={t('contract.end')} type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} error={errors.endDate} />
        <Input label={t('contract.value')} type="number" min={0} step="0.001" className="ltr text-start" value={f.value} onChange={(e) => set('value', e.target.value)} error={errors.value} />
        <Select label={t('pay.title')} value={f.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
          <option value="">—</option>
          {(['BANK_TRANSFER', 'CLIQ', 'CASH', 'CARD', 'OTHER'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`pay.${m}`)}
            </option>
          ))}
        </Select>
        <Input label={t('contract.visitsIncluded')} type="number" min={0} className="ltr text-start" value={f.visitsIncluded} onChange={(e) => set('visitsIncluded', e.target.value)} error={errors.visitsIncluded} />
        <Input label={t('contract.responseHours')} type="number" min={0} className="ltr text-start" value={f.responseHours} onChange={(e) => set('responseHours', e.target.value)} error={errors.responseHours} />
        <Select label={t('contract.technician')} value={f.technicianId} onChange={(e) => set('technicianId', e.target.value)}>
          <option value="">—</option>
          {techs.data?.filter((x) => x.active || x.id === f.technicianId).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <Select label={t('contract.renewal')} value={f.renewalStatus} onChange={(e) => set('renewalStatus', e.target.value as ContractFields['renewalStatus'])}>
          {(['NONE', 'PENDING', 'RENEWED', 'NOT_RENEWING'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`contract.renewal.${s}`)}
            </option>
          ))}
        </Select>
        <Input label={t('contract.reminderDays')} type="number" min={1} max={180} className="ltr text-start" value={f.reminderDays} onChange={(e) => set('reminderDays', e.target.value)} error={errors.reminderDays} />
      </div>
      <fieldset>
        <legend className="label">{t('contract.services')}</legend>
        <div className="flex flex-wrap gap-2">
          {services.data
            ?.filter((s) => s.active && s.kind === 'ANNUAL')
            .map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={f.serviceIds.includes(s.id)}
                onClick={() => toggleService(s.id)}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  f.serviceIds.includes(s.id) ? 'border-ink bg-ink text-bg' : 'border-line-strong hover:border-ink',
                )}
              >
                {s.name}
              </button>
            ))}
        </div>
      </fieldset>
      <Textarea label={t('contract.terms')} rows={4} value={f.terms} onChange={(e) => set('terms', e.target.value)} error={errors.terms} />
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

export function NewContractForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const m = useMutation();
  return (
    <ContractFieldsForm
      withCustomer
      submitLabel={t('contract.new')}
      busy={m.pending === 'create'}
      errors={m.fieldErrors}
      onCancel={onCancel}
      onSubmit={async (body) => {
        const r = await m.run('create', () => api.post<{ id: string }>('/admin/corporate/contracts', body), t('contract.created'));
        if (r) onCreated(r.id);
      }}
    />
  );
}
