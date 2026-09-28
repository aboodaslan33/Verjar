import { useId, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { FILE_KIND_LABEL } from '../../lib/format';
import { tr } from '../../lib/i18n/lang';
import { Button, Checkbox, Input, Select } from '../ui';
import { useMutation } from './hooks';
import { FILE_KINDS } from './labels';
import { FieldError } from './ui';
import type { FileKind, QuoteFile, WaResult } from './types';
import { WhatsAppFallback } from './WhatsAppFallback';

export type FileTarget = {
  customerId?: string;
  bookingId?: string;
  orderId?: string;
  corporateRequestId?: string;
  contractId?: string;
};

/**
 * رفع ملف PDF للعميل (تقييم / عرض سعر / عقد / فاتورة)
 * POST /admin/files — multipart: file + حقول عادية
 */
export function FileUploadForm({
  target,
  kinds = FILE_KINDS,
  defaultKind = 'QUOTE',
  defaultTitle = '',
  showAmount = true,
  onUploaded,
}: {
  target: FileTarget;
  kinds?: FileKind[];
  defaultKind?: FileKind;
  defaultTitle?: string;
  showAmount?: boolean;
  onUploaded?: (file: QuoteFile) => void;
}) {
  const m = useMutation();
  const fid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind>(defaultKind);
  const [title, setTitle] = useState(defaultTitle || tr(FILE_KIND_LABEL[defaultKind]));
  const [amount, setAmount] = useState('');
  const [notify, setNotify] = useState(true);
  const [fileError, setFileError] = useState<string>();
  const [wa, setWa] = useState<WaResult>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFileError(undefined);
    if (!file) return setFileError('اختر ملف PDF');
    if (file.type && file.type !== 'application/pdf') return setFileError('الملف يجب أن يكون PDF');
    if (file.size > 15 * 1024 * 1024) return setFileError('الحد الأقصى لحجم الملف 15 ميغابايت');
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(target)) if (v) fd.append(k, v);
    fd.append('kind', kind);
    fd.append('title', title.trim());
    if (showAmount && amount.trim() !== '') fd.append('amount', amount.trim());
    fd.append('notify', notify ? 'true' : 'false');
    const r = await m.run('upload', () => api.post<{ file: QuoteFile; whatsapp: WaResult }>('/admin/files', fd), 'تم رفع الملف');
    if (r) {
      setWa(r.whatsapp);
      setFile(null);
      setAmount('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.(r.file);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div>
        <label className="label" htmlFor={fid}>
          ملف PDF
        </label>
        <input
          id={fid}
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:me-3 file:rounded-lg file:border-0 file:bg-subtle file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-brand-100"
        />
        <FieldError message={fileError} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.length > 1 && (
          <Select
            label="نوع الملف"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as FileKind;
              if (!title || title === tr(FILE_KIND_LABEL[kind])) setTitle(tr(FILE_KIND_LABEL[k]));
              setKind(k);
            }}
            error={m.fieldErrors.kind}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {FILE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
        <Input label="عنوان الملف" value={title} onChange={(e) => setTitle(e.target.value)} error={m.fieldErrors.title} />
        {showAmount && (
          <Input
            label="المبلغ (د.أ)"
            optional
            inputMode="decimal"
            type="number"
            min={0}
            step="0.001"
            className="ltr text-start"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={m.fieldErrors.amount}
            hint={kind === 'QUOTE' ? 'عرض سعر بمبلغ ينقل الطلب إلى "تم التسعير"' : undefined}
          />
        )}
      </div>
      <Checkbox label="إرسال رابط الملف للعميل عبر واتساب" checked={notify} onChange={setNotify} />
      {m.error && !Object.keys(m.fieldErrors).length && <p className="text-sm text-danger">{m.error}</p>}
      <Button type="submit" size="sm" loading={m.pending === 'upload'}>
        رفع الملف
      </Button>
      <WhatsAppFallback result={wa} onDismiss={() => setWa(null)} />
    </form>
  );
}
