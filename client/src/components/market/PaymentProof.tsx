import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '../admin/hooks';
import { Alert, Button, Icon, Input, Modal, Tag, Textarea } from '../ui';
import { api, toFormData } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { INVOICE_PURPOSE_LABEL } from '../../lib/market';

export type PaymentAccount = { bankName: string; accountName: string; cliq: string; iban: string; instructions: string };
export type PayableInvoice = {
  id: string;
  number: string;
  purpose: string;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
  dueAt?: string | null;
  proofUrl?: string | null;
  proofName?: string | null;
  proofStatus?: string | null;
  proofSubmittedAt?: string | null;
  payerReference?: string | null;
  reviewNote?: string | null;
};

/** حالة الدفع اليدوي للفاتورة كما يراها المورد */
export function paymentState(i: PayableInvoice): { label: string; tone: 'success' | 'brand' | 'sand' | 'danger' | 'neutral' } {
  if (i.status === 'PAID') return { label: 'مدفوعة', tone: 'success' };
  if (i.status === 'CANCELLED') return { label: 'ملغاة', tone: 'neutral' };
  if (i.status !== 'PENDING') return { label: i.status, tone: 'neutral' };
  if (i.proofStatus === 'SUBMITTED') return { label: 'قيد مراجعة الدفع', tone: 'sand' };
  if (i.proofStatus === 'REJECTED') return { label: 'أعد رفع إثبات الدفع', tone: 'danger' };
  return { label: 'بانتظار الدفع', tone: 'brand' };
}

function CopyRow({ label, value, ltr = true }: { label: string; value: string; ltr?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* المتصفح منع النسخ — القيمة ظاهرة للنسخ اليدوي */
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className={ltr ? 'ltr block break-all font-bold tabular-nums' : 'block font-bold'}>{value}</span>
      </span>
      <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold hover:border-ink" aria-label={`نسخ ${label}`}>
        <Icon name={done ? 'check' : 'copy'} className="h-3.5 w-3.5" /> {done ? 'تم النسخ' : 'نسخ'}
      </button>
    </div>
  );
}

/**
 * الدفع اليدوي: بيانات الحساب (بنك الاتحاد / CliQ) والمبلغ ورقم الفاتورة،
 * ثم يرفع المورد صورة أو PDF لإيصال الحوالة مع رقم المرجع — يصل للإدارة لتأكيده فتُفعَّل الخدمة.
 */
export function PaymentProofModal({ invoice, account, onClose, onDone }: { invoice: PayableInvoice | null; account: PaymentAccount; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={Boolean(invoice)} onClose={onClose} title="الدفع وإرفاق الإيصال" size="lg">
      {invoice && <PaymentProofForm key={invoice.id} invoice={invoice} account={account} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function PaymentProofForm({ invoice, account, onClose, onDone }: { invoice: PayableInvoice; account: PaymentAccount; onClose: () => void; onDone: () => void }) {
  const m = useMutation();
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState(invoice.payerReference ?? '');
  const [note, setNote] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type) && f.type !== 'application/pdf') return setLocal('الملف يجب أن يكون صورة أو PDF');
    if (f.size > 10 * 1024 * 1024) return setLocal('حجم الملف أكبر من 10MB');
    setLocal(null);
    setFile(f);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setLocal('أرفق صورة أو PDF لإيصال الدفع');
    const r = await m.run('proof', () => api.post(`/vendor/market/invoices/${invoice.id}/proof`, toFormData({ reference: reference.trim() || null, note: note.trim() || null }, { file })), 'تم إرسال إثبات الدفع للإدارة');
    if (r) onDone();
  };
  const fe = m.fieldErrors;
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="rounded-2xl bg-ink p-4 text-white sm:p-5">
        <p className="text-sm text-white/70">{INVOICE_PURPOSE_LABEL[invoice.purpose] ?? invoice.purpose} — {invoice.description}</p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums">{formatJOD(invoice.amount)}</p>
        <p className="mt-1 text-xs text-white/70">
          فاتورة <span className="ltr font-semibold text-white">{invoice.number}</span>
          {invoice.dueAt && <> · يُفضّل الدفع قبل {formatDate(invoice.dueAt)}</>}
        </p>
      </div>

      {invoice.proofStatus === 'REJECTED' && invoice.reviewNote && (
        <Alert tone="error" title="لم يُقبل إثبات الدفع السابق">
          {invoice.reviewNote}
        </Alert>
      )}

      <section>
        <h3 className="mb-1 text-base font-bold">1. حوّل المبلغ</h3>
        <div className="divide-y divide-line rounded-xl border border-line px-4">
          {account.bankName && <CopyRow label="البنك" value={account.bankName} ltr={false} />}
          {account.accountName && <CopyRow label="اسم المستفيد" value={account.accountName} ltr={false} />}
          {account.cliq && <CopyRow label="CliQ (رقم / Alias)" value={account.cliq} />}
          {account.iban && <CopyRow label="رقم الحساب / IBAN" value={account.iban} />}
          <CopyRow label="اكتب في ملاحظة التحويل رقم الفاتورة" value={invoice.number} />
        </div>
        {account.instructions && <p className="mt-2 whitespace-pre-line text-sm text-muted">{account.instructions}</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-bold">2. أرفق إيصال الدفع</h3>
        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong p-5 text-center hover:border-ink"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name={file ? 'check' : 'upload'} className="h-6 w-6 text-muted" />
          <span className="text-sm font-semibold">{file ? file.name : 'صورة شاشة (Screenshot) أو PDF لإيصال التحويل'}</span>
          <span className="text-xs text-muted">{file ? 'اضغط لتغيير الملف' : 'JPG أو PNG أو PDF — حتى 10MB'}</span>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {(local || fe.file) && <p className="text-sm text-danger">{local ?? fe.file}</p>}
        <Input label="رقم الحوالة / المرجع" optional className="ltr text-start" value={reference} onChange={(e) => setReference(e.target.value)} error={fe.reference} hint="يظهر في إيصال CliQ أو التحويل البنكي" />
        <Textarea label="ملاحظة للإدارة" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} error={fe.note} />
      </section>

      {m.error && !Object.keys(fe).length && <Alert tone="error">{m.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={m.pending === 'proof'}>
          <Icon name="upload" className="h-4 w-4" /> إرسال للمراجعة
        </Button>
        <Button variant="ghost" onClick={onClose}>
          لاحقًا
        </Button>
      </div>
      <p className="text-xs text-muted">تراجع الإدارة الإيصال وتفعّل الخدمة بعد التأكد من وصول المبلغ، ويصلك إشعار وبريد بالنتيجة.</p>
    </form>
  );
}

export function ProofTag({ invoice }: { invoice: PayableInvoice }) {
  const s = paymentState(invoice);
  return <Tag tone={s.tone}>{s.label}</Tag>;
}
