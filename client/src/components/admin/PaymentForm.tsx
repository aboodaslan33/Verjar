import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { PAYMENT_METHOD_LABEL, todayAmman } from '../../lib/format';
import { Button, Input, Select } from '../ui';
import { useMutation } from './hooks';
import { PAYMENT_METHODS } from './labels';
import type { FinanceSummary, Payment, PaymentMethod } from './types';

/** تسجيل دفعة — POST /admin/finance/payments */
export function PaymentForm({
  customerId,
  bookingId,
  orderId,
  contractId,
  onSaved,
  onCancel,
}: {
  customerId: string;
  bookingId?: string;
  orderId?: string;
  contractId?: string;
  onSaved?: (payment: Payment, summary: FinanceSummary) => void;
  onCancel?: () => void;
}) {
  const m = useMutation();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [paidAt, setPaidAt] = useState(todayAmman());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run(
      'pay',
      () =>
        api.post<{ payment: Payment; summary: FinanceSummary }>('/admin/finance/payments', {
          customerId,
          bookingId: bookingId ?? null,
          orderId: orderId ?? null,
          contractId: contractId ?? null,
          amount: amount === '' ? 0 : Number(amount),
          method,
          paidAt: paidAt || undefined,
          reference: reference.trim() || null,
          note: note.trim() || null,
        }),
      'تم تسجيل الدفعة',
    );
    if (r) {
      setAmount('');
      setReference('');
      setNote('');
      onSaved?.(r.payment, r.summary);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="المبلغ (د.أ)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          className="ltr text-start"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={m.fieldErrors.amount}
          required
        />
        <Select label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((k) => (
            <option key={k} value={k}>
              {PAYMENT_METHOD_LABEL[k]}
            </option>
          ))}
        </Select>
        <Input label="تاريخ الدفع" type="date" className="ltr text-start" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} error={m.fieldErrors.paidAt} />
        <Input label="رقم مرجعي" optional value={reference} onChange={(e) => setReference(e.target.value)} error={m.fieldErrors.reference} />
      </div>
      <Input label="ملاحظة" optional value={note} onChange={(e) => setNote(e.target.value)} error={m.fieldErrors.note} />
      {m.error && !Object.keys(m.fieldErrors).length && <p className="text-sm text-danger">{m.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={m.pending === 'pay'}>
          حفظ الدفعة
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            إلغاء
          </Button>
        )}
      </div>
    </form>
  );
}
