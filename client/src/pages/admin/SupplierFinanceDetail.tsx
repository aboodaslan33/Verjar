import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { PAYMENT_METHODS } from '../../components/admin/labels';
import type { PaymentMethod } from '../../components/admin/types';
import { AdminPage, DetailSkeleton, Panel, StatTile } from '../../components/admin/ui';
import { ActivityPanel, FeeStatement, FeeStatusFilter } from '../../components/finance/FeeFinance';
import { Button, ErrorState, Input, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { PAYMENT_METHOD_LABEL, formatDate, formatJOD } from '../../lib/format';
import { rateLabel, type Activity, type FeePayment, type FeeRate, type FeeStatus, type FeeSummary, type StatementRow } from '../../lib/supplierFinance';
import { useDocumentTitle } from '../../lib/useAsync';

type Detail = {
  vendor: { id: string; name: string; slug: string; active: boolean; status: string; phone: string | null; email: string | null; platformFeePercent: number | null };
  summary: FeeSummary;
  rate: FeeRate;
  statement: { rows: StatementRow[]; total: number };
  payments: FeePayment[];
  activity: Activity[];
};

/** تفاصيل مالية مورد: الملخص، تسجيل الدفعات اليدوية، كشف الحساب والنزاعات */
export default function SupplierFinanceDetail() {
  const { id } = useParams();
  const f = useFilters(['status'] as const);
  const status = f.values.status as FeeStatus | '';
  const q = useAdminQuery(() => api.get<Detail>(`/admin/supplier-finance/${id}`, status ? { status } : {}), [id, status], { keep: true });
  useDocumentTitle(q.data?.vendor.name ?? 'مالية المورد');
  const m = useMutation();
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<FeePayment | null>(null);

  if (q.loading && !q.data) return <DetailSkeleton />;
  if (q.error || !q.data)
    return (
      <AdminPage title="مالية المورد" back={{ to: '/admin/supplier-finance', label: 'مالية الموردين' }}>
        <ErrorState message={q.error?.message ?? 'غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );
  const { vendor, summary: s, rate } = q.data;

  const toggleDispute = async (r: StatementRow, disputed: boolean, note: string) => {
    setBusy(r.id);
    const ok = await m.run('dispute', () => api.post(`/admin/supplier-finance/vendor-orders/${r.id}/dispute`, { disputed, note: note || null }), disputed ? 'تم فتح النزاع' : 'تم إغلاق النزاع');
    setBusy(null);
    if (ok) q.reload();
    return !!ok;
  };

  const removePayment = async () => {
    if (!del) return;
    const ok = await m.run('del', () => api.del(`/admin/supplier-finance/payments/${del.id}`), 'تم حذف الدفعة وإرجاع المبالغ للطلبات');
    setDel(null);
    if (ok) q.reload();
  };

  return (
    <AdminPage
      title={vendor.name}
      description="Supplier Financial Summary"
      back={{ to: '/admin/supplier-finance', label: 'مالية الموردين' }}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="إجمالي المبيعات" value={formatJOD(s.customerSales)} sub={`${s.orders} طلب · قبل النسبة ${formatJOD(s.supplierBase)}`} />
        <StatTile label="نسبة فرجار" value={<span dir="ltr">{rateLabel(rate)}</span>} sub={vendor.platformFeePercent != null ? 'نسبة خاصة بالمورد' : 'الافتراضي العام'} />
        <StatTile label="إجمالي عمولة فرجار" value={formatJOD(s.fees)} tone="brand" />
        <StatTile label="إجمالي المدفوع" value={formatJOD(s.paid)} tone="sand" />
        <StatTile label="إجمالي المتبقي" value={formatJOD(s.outstanding)} tone="warn" />
        <StatTile label="معلّق" value={formatJOD(s.pending)} sub="طلبات قيد التنفيذ" />
        <StatTile label="مستحق الآن" value={formatJOD(s.due)} sub="طلبات مكتملة أو مسلّمة" tone="brand" />
        <StatTile label="متنازع عليه" value={formatJOD(s.disputed)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PaymentForm vendorId={vendor.id} available={Math.max(0, s.outstanding - s.disputed)} onSaved={q.reload} />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Panel title="الدفعات المسجّلة" bodyClassName="p-0 sm:p-0">
            {!q.data.payments.length ? (
              <p className="p-4 text-sm text-muted sm:p-5">لا توجد دفعات بعد.</p>
            ) : (
              <ul className="divide-y divide-line">
                {q.data.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatJOD(p.amount)} · {formatDate(p.paidAt)}
                      </span>
                      <span className="text-xs text-muted">
                        {PAYMENT_METHOD_LABEL[p.method]}
                        {p.reference && (
                          <>
                            {' · '}
                            <span dir="ltr">{p.reference}</span>
                          </>
                        )}
                        {p.recordedBy && ` · سجّلها ${p.recordedBy}`}
                        {p.orders.length > 0 && ` · طلبات ${p.orders.map((o) => `#${o.number}`).join('، ')}`}
                      </span>
                      {p.note && <span className="block text-xs text-muted">{p.note}</span>}
                    </span>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDel(p)}>
                      حذف
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <ActivityPanel items={q.data.activity} />
        </div>
      </div>

      <div className="mt-6">
        <Panel title="كشف حساب فرجار" bodyClassName="p-0 sm:p-0">
          <div className="border-b border-line p-4 sm:p-5">
            <FeeStatusFilter value={status} onChange={(x) => f.set({ status: x })} />
          </div>
          <FeeStatement rows={q.data.statement.rows} orderHref={(r) => `/admin/orders/${r.orderId}`} onToggleDispute={toggleDispute} busyId={busy} />
        </Panel>
      </div>

      <ConfirmDialog
        open={!!del}
        title="حذف الدفعة؟"
        confirmLabel="حذف الدفعة"
        tone="danger"
        loading={m.pending === 'del'}
        onConfirm={removePayment}
        onClose={() => setDel(null)}
      >
        {del ? `سيتم حذف دفعة ${formatJOD(del.amount)} وإرجاع المبلغ كمتبقٍ على الطلبات.` : ''}
      </ConfirmDialog>
    </AdminPage>
  );
}

/** تسجيل دفعة يدوية من المورد لفرجار */
function PaymentForm({ vendorId, available, onSaved }: { vendorId: string; available: number; onSaved: () => void }) {
  const m = useMutation();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  const n = Number(amount) || 0;
  const after = Math.round((available - n) * 1000) / 1000;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run(
      'pay',
      () => api.post(`/admin/supplier-finance/${vendorId}/payments`, { amount: n, method, reference: reference.trim() || null, note: note.trim() || null, ...(paidAt ? { paidAt } : {}) }),
      'تم تسجيل الدفعة',
    );
    if (r) {
      setAmount('');
      setReference('');
      setNote('');
      setPaidAt('');
      onSaved();
    }
  };

  return (
    <Panel title="تسجيل دفعة من المورد">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="rounded-xl bg-subtle/60 p-3 text-sm">
          المتاح للسداد: <b className="tabular-nums">{formatJOD(available)}</b>
          <span className="block text-xs text-muted">المبالغ المتنازع عليها لا تُسدَّد حتى يُغلق النزاع.</span>
        </p>
        <Input label="المبلغ (د.أ)" type="number" inputMode="decimal" min={0} step="0.001" className="ltr text-start" value={amount} onChange={(e) => setAmount(e.target.value)} error={m.fieldErrors.amount} />
        {n > 0 && (
          <p className="text-sm">
            بعد الدفعة: المدفوع يزيد {formatJOD(n)} والمتبقي <b className="tabular-nums">{formatJOD(Math.max(0, after))}</b>
            {after < 0 && <span className="block text-xs text-danger">المبلغ أكبر من المتاح</span>}
          </p>
        )}
        <Select label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((x) => (
            <option key={x} value={x}>
              {PAYMENT_METHOD_LABEL[x]}
            </option>
          ))}
        </Select>
        <Input label="رقم المرجع / الإيصال" optional dir="ltr" className="text-start" value={reference} onChange={(e) => setReference(e.target.value)} error={m.fieldErrors.reference} />
        <Input label="تاريخ الدفع" optional type="date" className="ltr text-start" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} hint="فارغ = اليوم" />
        <Textarea label="ملاحظات الأدمن" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" block loading={m.pending === 'pay'} disabled={n <= 0 || after < 0}>
          تسجيل الدفعة
        </Button>
      </form>
    </Panel>
  );
}
