import { STATUS_LABEL, cx } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';

const styles: Record<RequestStatus, string> = {
  NEW: 'bg-sand-100 text-sand-700 ring-sand-300 dark:bg-sand-700/20 dark:text-sand-200 dark:ring-sand-600',
  UNDER_REVIEW: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-700',
  PRICED: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-700',
  CONFIRMED: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-100 dark:ring-brand-600',
  IN_PROGRESS: 'bg-brand-100 text-brand-800 ring-brand-300 dark:bg-brand-500/25 dark:text-brand-50 dark:ring-brand-500',
  COMPLETED: 'bg-brand-700 text-white ring-brand-700',
  CANCELLED: 'bg-subtle text-muted ring-line line-through decoration-1',
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        styles[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** شارة عامة */
export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'sand' | 'danger' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-subtle text-muted',
        tone === 'brand' && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100',
        tone === 'sand' && 'bg-sand-100 text-sand-700 dark:bg-sand-700/20 dark:text-sand-200',
        tone === 'danger' && 'bg-danger/10 text-danger',
      )}
    >
      {children}
    </span>
  );
}
