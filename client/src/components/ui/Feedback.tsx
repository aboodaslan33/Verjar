import type { ReactNode } from 'react';
import { cx } from '../../lib/format';
import { Button } from './Button';
import { Icon } from './Icon';

/** كتلة هيكلية أثناء التحميل */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

/** هيكل تحميل لقائمة/جدول */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-7 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center', className)}>
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-subtle">
        <span className="block h-3 w-3 rounded-sm bg-sand-400" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-md text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/5 px-6 py-10 text-center" role="alert">
      <Icon name="alert" className="mx-auto mb-3 h-8 w-8 text-danger" />
      <p className="font-medium text-ink">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cx(
        'rounded-xl border px-4 py-3 text-[15px]',
        tone === 'info' && 'border-sand-300 bg-sand-50 text-ink dark:border-sand-700 dark:bg-sand-700/15',
        tone === 'warn' && 'border-warn/40 bg-warn/10 text-ink',
        tone === 'error' && 'border-danger/40 bg-danger/10 text-ink',
        tone === 'success' && 'border-success/40 bg-success/10 text-ink',
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && 'mt-0.5', 'text-muted')}>{children}</div>}
    </div>
  );
}

/** مؤشر تحميل للصفحة الكاملة (lazy routes) */
export function PageLoader() {
  return (
    <div className="container py-16" role="status" aria-label="جاري التحميل">
      <Skeleton className="mb-4 h-8 w-1/3" />
      <Skeleton className="mb-8 h-4 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
