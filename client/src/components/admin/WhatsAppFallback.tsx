import { ButtonA, Icon } from '../ui';
import type { WaResult } from './types';

/**
 * بعد أي إشعار للعميل: إن لم يُرسل تلقائيًا (وضع الروابط) يظهر زر يفتح واتساب برسالة جاهزة.
 */
export function WhatsAppFallback({
  result,
  onDismiss,
  label = 'إرسال للعميل عبر واتساب',
}: {
  result: WaResult;
  onDismiss?: () => void;
  label?: string;
}) {
  if (!result) return null;
  if (result.sent) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm" role="status">
        <span className="flex items-center gap-2">
          <Icon name="check" className="h-4 w-4 text-success" />
          أُرسلت رسالة واتساب تلقائيًا.
        </span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-muted hover:text-ink" aria-label="إخفاء">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-300 bg-sand-50 px-4 py-3 text-sm dark:border-sand-700 dark:bg-sand-700/15" role="status">
      <span>الرسالة جاهزة ولم تُرسل تلقائيًا. افتح واتساب لإرسالها.</span>
      <span className="flex items-center gap-2">
        <ButtonA href={result.link} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm" onClick={onDismiss}>
          <Icon name="whatsapp" className="h-4 w-4" />
          {label}
        </ButtonA>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="p-1 text-muted hover:text-ink" aria-label="إخفاء">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  );
}
