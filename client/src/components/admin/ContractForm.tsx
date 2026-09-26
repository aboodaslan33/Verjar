import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { addDays, todayAmman } from '../../lib/format';
import { Button, Input, Select, Textarea } from '../ui';
import { useMutation } from './hooks';
import { CONTRACT_STATUS_LABEL, isoToDateInput } from './labels';
import type { Contract, ContractStatus } from './types';

/**
 * إنشاء عقد من طلب شركة (POST /admin/corporate/requests/:id/contract)
 * أو تعديل عقد قائم (PATCH /admin/corporate/contracts/:id)
 */
export function ContractForm({
  requestId,
  contract,
  defaultTitle = '',
  defaultValue,
  onSaved,
  onCancel,
}: {
  requestId?: string;
  contract?: Contract;
  defaultTitle?: string;
  defaultValue?: number | null;
  onSaved: (c: Contract) => void;
  onCancel?: () => void;
}) {
  const m = useMutation();
  const today = todayAmman();
  const [title, setTitle] = useState(contract?.title ?? defaultTitle);
  const [startDate, setStartDate] = useState(contract ? isoToDateInput(contract.startDate) : today);
  const [endDate, setEndDate] = useState(contract ? isoToDateInput(contract.endDate) : addDays(today, 365));
  const [value, setValue] = useState(contract ? String(contract.value) : defaultValue != null ? String(defaultValue) : '');
  const [reminderDays, setReminderDays] = useState(contract ? String(contract.reminderDays) : '');
  const [status, setStatus] = useState<ContractStatus>(contract?.status ?? 'ACTIVE');
  const [notes, setNotes] = useState(contract?.notes ?? '');
  const [local, setLocal] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (title.trim().length < 2) errs.title = 'عنوان العقد مطلوب';
    if (!startDate) errs.startDate = 'حدد تاريخ البداية';
    if (!endDate) errs.endDate = 'حدد تاريخ النهاية';
    else if (startDate && endDate <= startDate) errs.endDate = 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية';
    if (value.trim() === '' || Number(value) < 0) errs.value = 'أدخل قيمة العقد';
    if (reminderDays !== '' && (Number(reminderDays) < 1 || Number(reminderDays) > 180)) errs.reminderDays = 'بين 1 و 180 يوم';
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, unknown> = {
      title: title.trim(),
      startDate,
      endDate,
      value: value === '' ? undefined : Number(value),
      notes: notes.trim() || null,
    };
    if (reminderDays !== '') body.reminderDays = Number(reminderDays);
    if (contract) body.status = status;
    const r = await m.run(
      'save',
      () =>
        contract
          ? api.patch<Contract>(`/admin/corporate/contracts/${contract.id}`, body)
          : api.post<Contract>(`/admin/corporate/requests/${requestId}/contract`, body),
      contract ? 'تم حفظ العقد' : 'تم إنشاء العقد',
    );
    if (r) onSaved(r);
  };

  const fe = { ...m.fieldErrors, ...local } as Record<string, string>;
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input label="عنوان العقد" value={title} onChange={(e) => setTitle(e.target.value)} error={fe.title} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="تاريخ البداية" type="date" className="ltr text-start" value={startDate} onChange={(e) => setStartDate(e.target.value)} error={fe.startDate} />
        <Input label="تاريخ النهاية" type="date" className="ltr text-start" value={endDate} onChange={(e) => setEndDate(e.target.value)} error={fe.endDate} />
        <Input
          label="قيمة العقد (د.أ)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          className="ltr text-start"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={fe.value}
        />
        <Input
          label="التذكير قبل الانتهاء (يوم)"
          optional={!contract}
          type="number"
          inputMode="numeric"
          min={1}
          max={180}
          className="ltr text-start"
          value={reminderDays}
          onChange={(e) => setReminderDays(e.target.value)}
          error={fe.reminderDays}
          hint={!contract ? 'يُستخدم الافتراضي من الإعدادات إن تُرك فارغًا' : undefined}
        />
        {contract && (
          <Select label="حالة العقد" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}>
            {(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => (
              <option key={s} value={s}>
                {CONTRACT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </div>
      <Textarea label="ملاحظات" optional rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} error={fe.notes} />
      {m.error && !Object.keys(m.fieldErrors).length && <p className="text-sm text-danger">{m.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={m.pending === 'save'}>
          {contract ? 'حفظ العقد' : 'إنشاء العقد'}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        )}
      </div>
    </form>
  );
}
