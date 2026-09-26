import { useState } from 'react';
import { api } from '../../lib/api';
import { FILE_KIND_LABEL, PAYMENT_METHOD_LABEL, cx, displayPhone, formatDate, formatJOD } from '../../lib/format';
import { Icon, Tag } from '../ui';
import { ConfirmDialog } from './ConfirmDialog';
import { useMutation } from './hooks';
import { WA_CHANNEL_LABEL, WA_STATUS_LABEL } from './labels';
import type { FinanceSummary, Payment, QuoteFile, WhatsAppLog } from './types';
import { Truncated } from './ui';

/** قائمة الملفات المرفوعة للعميل */
export function FilesList({ files, onDeleted }: { files: QuoteFile[]; onDeleted?: (id: string) => void }) {
  const m = useMutation();
  const [confirm, setConfirm] = useState<QuoteFile | null>(null);
  if (!files.length) return <p className="text-sm text-muted">لا توجد ملفات مرفوعة بعد.</p>;
  return (
    <>
      <ul className="divide-y divide-line">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
              <Icon name="file" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:text-brand-700 dark:hover:text-brand-200">
                {f.title}
              </a>
              <p className="text-xs text-muted">
                {FILE_KIND_LABEL[f.kind]} · {formatDate(f.createdAt)}
                {f.amount != null && <> · {formatJOD(f.amount)}</>}
              </p>
            </div>
            <a href={f.url} target="_blank" rel="noopener noreferrer" download className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink" aria-label="تحميل">
              <Icon name="download" className="h-4 w-4" />
            </a>
            {onDeleted && (
              <button type="button" onClick={() => setConfirm(f)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label="حذف الملف">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        title="حذف الملف"
        confirmLabel="حذف"
        loading={m.pending === 'del'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          const r = await m.run('del', () => api.del(`/admin/files/${confirm.id}`), 'تم حذف الملف');
          if (r) {
            onDeleted?.(confirm.id);
            setConfirm(null);
          }
        }}
      >
        سيُحذف الملف «{confirm?.title}» ولن يظهر للعميل.
      </ConfirmDialog>
    </>
  );
}

/** قائمة الدفعات */
export function PaymentsList({
  payments,
  onDeleted,
  showLink,
}: {
  payments: Payment[];
  onDeleted?: (id: string, summary: FinanceSummary) => void;
  showLink?: boolean;
}) {
  const m = useMutation();
  const [confirm, setConfirm] = useState<Payment | null>(null);
  if (!payments.length) return <p className="text-sm text-muted">لا توجد دفعات مسجلة.</p>;
  return (
    <>
      <ul className="divide-y divide-line">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold tabular-nums">{formatJOD(p.amount)}</p>
              <p className="text-xs text-muted">
                {PAYMENT_METHOD_LABEL[p.method]} · {formatDate(p.paidAt)}
                {p.reference && (
                  <>
                    {' '}
                    · مرجع <span className="ltr">{p.reference}</span>
                  </>
                )}
                {showLink && p.booking && <> · حجز #{p.booking.number}</>}
                {showLink && p.order && <> · طلب #{p.order.number}</>}
                {showLink && p.contract && <> · عقد #{p.contract.number}</>}
                {p.recordedBy && <> · {p.recordedBy.name}</>}
              </p>
              {p.note && <p className="mt-0.5 text-xs text-muted">{p.note}</p>}
            </div>
            {onDeleted && (
              <button type="button" onClick={() => setConfirm(p)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label="حذف الدفعة">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        title="حذف الدفعة"
        confirmLabel="حذف"
        loading={m.pending === 'del'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          const r = await m.run('del', () => api.del<{ summary: FinanceSummary }>(`/admin/finance/payments/${confirm.id}`), 'تم حذف الدفعة');
          if (r) {
            onDeleted?.(confirm.id, r.summary);
            setConfirm(null);
          }
        }}
      >
        حذف دفعة بقيمة {confirm ? formatJOD(confirm.amount) : ''}؟ سيُعاد حساب المتبقي على العميل.
      </ConfirmDialog>
    </>
  );
}

/** سجل رسائل واتساب لعنصر */
export function WhatsAppLogList({ logs }: { logs: WhatsAppLog[] }) {
  if (!logs.length) return <p className="text-sm text-muted">لا توجد رسائل مسجلة.</p>;
  return (
    <ul className="divide-y divide-line">
      {logs.map((l) => (
        <li key={l.id} className="py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={l.status === 'SENT' ? 'brand' : l.status === 'FAILED' ? 'danger' : 'sand'}>{WA_STATUS_LABEL[l.status]}</Tag>
            <span className="text-xs text-muted">{WA_CHANNEL_LABEL[l.channel]}</span>
            <span className="ltr text-xs text-muted">{displayPhone(l.to)}</span>
            <span className="ms-auto text-xs text-muted">{formatDate(l.createdAt, true)}</span>
          </div>
          <div className="mt-1 text-muted">
            <Truncated text={l.message} />
          </div>
          {l.error && <p className="mt-1 text-xs text-danger">{l.error}</p>}
          {l.link && (
            <a href={l.link} target="_blank" rel="noopener noreferrer" className={cx('mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-200')}>
              <Icon name="external" className="h-3.5 w-3.5" /> فتح الرابط
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
