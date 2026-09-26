import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cx } from '../../lib/format';
import { Icon } from '../ui';
import { MB, PHOTO_EXT, PHOTO_TYPES } from './formUtils';

type Props = {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  /** أقصى عدد ملفات */
  max: number;
  /** السماح بملفات PDF (ملفات التصميم والوثائق) */
  allowPdf?: boolean;
  maxImageMB?: number;
  maxPdfMB?: number;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** اسم الحقل لاستخدامه في التنقل لأول خطأ */
  field?: string;
};

function extOf(f: File) {
  return (f.name.split('.').pop() ?? '').toLowerCase();
}

function isPdf(f: File) {
  return f.type === 'application/pdf' || extOf(f) === 'pdf';
}

function isImage(f: File) {
  return PHOTO_TYPES.includes(f.type) || (!f.type && PHOTO_EXT.includes(extOf(f))) || PHOTO_EXT.includes(extOf(f));
}

/** هل يستطيع المتصفح عرض الصورة؟ (HEIC لا يُعرض في أغلب المتصفحات) */
function canPreview(f: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(f.type);
}

function sizeLabel(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * اختيار صور/ملفات مع معاينة مصغرة وحذف وعداد وتحقق من النوع والحجم.
 * accept="image/*" يعطي على الجوال خيار الكاميرا أو المعرض.
 */
export function FilePicker({
  label,
  files,
  onChange,
  max,
  allowPdf,
  maxImageMB = 5,
  maxPdfMB = 10,
  optional,
  hint,
  error,
  field,
}: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);

  const previews = useMemo(() => files.map((f) => (canPreview(f) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const accept = allowPdf ? 'image/*,application/pdf,.pdf,.heic,.heif' : 'image/*,.heic,.heif';
  const full = files.length >= max;

  function add(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    const errs: string[] = [];
    for (const f of Array.from(list)) {
      if (next.length >= max) {
        errs.push(`الحد الأقصى ${max} ${max === 1 ? 'ملف' : 'ملفات'} — لم يُضف "${f.name}"`);
        continue;
      }
      const pdf = allowPdf && isPdf(f);
      if (!pdf && !isImage(f)) {
        errs.push(`"${f.name}" نوع غير مدعوم. المسموح: صور JPG أو PNG أو WEBP أو HEIC${allowPdf ? ' أو ملف PDF' : ''}`);
        continue;
      }
      const limit = (pdf ? maxPdfMB : maxImageMB) * MB;
      if (f.size > limit) {
        errs.push(`"${f.name}" حجمه ${sizeLabel(f.size)} — الحد ${pdf ? maxPdfMB : maxImageMB} ميغابايت`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setRejected(errs);
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(i: number) {
    setRejected([]);
    onChange(files.filter((_, idx) => idx !== i));
  }

  return (
    <div data-field={field}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label mb-0">
          {label}
          {optional && <span className="ms-1 text-xs font-normal text-muted">(اختياري)</span>}
        </label>
        <span className={cx('text-sm tabular-nums', full ? 'font-semibold text-brand-700 dark:text-brand-200' : 'text-muted')}>
          <span className="ltr">
            {files.length}/{max}
          </span>
        </span>
      </div>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={max > 1}
        className="sr-only"
        onChange={(e) => add(e.target.files)}
        disabled={full}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {files.map((f, i) => (
          <div key={`${f.name}-${f.size}-${i}`} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-subtle">
            {previews[i] ? (
              <img src={previews[i]!} alt={f.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                <Icon name={isPdf(f) ? 'file' : 'image'} className="h-7 w-7 text-muted" />
                <span className="line-clamp-2 break-all text-[11px] leading-tight text-muted">{f.name}</span>
              </div>
            )}
            <span className="absolute bottom-1 start-1 rounded bg-black/55 px-1.5 text-[10px] text-white">
              <span className="ltr">{sizeLabel(f.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute end-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-danger"
              aria-label={`حذف ${f.name}`}
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!full && (
          <label
            htmlFor={id}
            className={cx(
              'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-colors',
              error ? 'border-danger/60' : 'border-line hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/20',
            )}
          >
            <Icon name={files.length ? 'plus' : 'upload'} className="h-6 w-6 text-brand-700 dark:text-brand-200" />
            <span className="px-1 text-xs font-medium text-ink">{files.length ? 'إضافة' : allowPdf ? 'رفع ملف' : 'إضافة صور'}</span>
          </label>
        )}
      </div>

      {rejected.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-danger" role="alert">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint ??
            (allowPdf
              ? `صور حتى ${maxImageMB} ميغابايت أو PDF حتى ${maxPdfMB} ميغابايت.`
              : `حتى ${max} صور، كل صورة حتى ${maxImageMB} ميغابايت. يمكنك التصوير مباشرة من الجوال.`)}
        </p>
      )}
    </div>
  );
}
