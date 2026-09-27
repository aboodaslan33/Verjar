import type { ReactNode } from 'react';
import { STATUS_LABEL, cx } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';

/**
 * حالة الطلب: نقطة ملوّنة + نص على خلفية محايدة.
 * اللون في النقطة فقط، فتبقى الجداول هادئة ومقروءة.
 */
const DOT: Record<RequestStatus, string> = {
  NEW: 'bg-info',
  UNDER_REVIEW: 'bg-warn',
  PRICED: 'bg-brand-600',
  CONFIRMED: 'bg-brand-500',
  IN_PROGRESS: 'bg-ink',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-muted',
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink',
        status === 'CANCELLED' && 'text-muted',
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', DOT[status], status === 'NEW' && 'animate-pulse motion-reduce:animate-none')} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** شارة عامة */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'sand' | 'danger' | 'success' | 'dark' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-subtle text-muted',
        tone === 'brand' && 'bg-brand-100 text-brand-900 dark:bg-brand-500/15 dark:text-brand-100',
        tone === 'sand' && 'bg-sand-100 text-sand-700 dark:bg-sand-700/30 dark:text-sand-200',
        tone === 'danger' && 'bg-danger/10 text-danger',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'dark' && 'bg-ink text-bg',
      )}
    >
      {children}
    </span>
  );
}
