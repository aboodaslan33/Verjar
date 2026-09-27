import type { ReactNode } from 'react';
import { cx } from '../../lib/format';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

/** كتلة هيكلية أثناء التحميل */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

/** هيكل تحميل لقائمة/جدول */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" role="status" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** حالة فارغة: رسم خطي بسيط (خط القياس من الشعار) بدل أيقونة كبيرة */
export function EmptyState({
  title,
  description,
  action,
  className,
  icon = 'search',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <div className={cx('rounded-xl border border-dashed border-line-strong px-6 py-14 text-center anim-fade', className)}>
      <div className="mx-auto mb-5 flex w-fit flex-col items-center gap-2 text-muted" aria-hidden>
        <Icon name={icon} className="h-6 w-6" />
        <span className="block h-[3px] w-8 rounded-full bg-primary" />
      </div>
      <h3 className="text-lg">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-md text-[15px] text-muted">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = 'تعذّر التحميل' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="rounded-xl border border-danger/25 bg-danger/[0.04] px-6 py-10 text-center anim-fade" role="alert">
      <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-danger/10 text-danger">
        <Icon name="alert" className="h-5 w-5" />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[15px] text-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

const ALERT_ICON: Record<'info' | 'warn' | 'error' | 'success', IconName> = { info: 'info', warn: 'alert', error: 'alert', success: 'check' };

/** تنبيه داخل الصفحة: شريط لوني جانبي + أيقونة، بدون خلفيات صارخة */
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
        'flex gap-3 rounded-lg border border-s-[3px] bg-surface px-4 py-3 text-[15px] anim-fade',
        tone === 'info' && 'border-line border-s-ink',
        tone === 'warn' && 'border-warn/30 border-s-warn bg-warn/[0.05]',
        tone === 'error' && 'border-danger/30 border-s-danger bg-danger/[0.04]',
        tone === 'success' && 'border-success/30 border-s-success bg-success/[0.05]',
        className,
      )}
    >
      <Icon
        name={ALERT_ICON[tone]}
        className={cx(
          'mt-0.5 h-5 w-5 shrink-0',
          tone === 'info' && 'text-ink',
          tone === 'warn' && 'text-warn',
          tone === 'error' && 'text-danger',
          tone === 'success' && 'text-success',
        )}
      />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
    </div>
  );
}

/** علامة نجاح متحركة (دائرة ثم صح) لشاشات التأكيد */
export function SuccessMark({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-grid h-16 w-16 place-items-center', className)} aria-hidden>
      <span className="success-ring absolute inset-0 rounded-full bg-primary/40" />
      <span className="absolute inset-0 rounded-full bg-primary" />
      <svg viewBox="0 0 52 52" className="success-mark relative h-16 w-16 text-primary-fg" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="26" cy="26" r="24" strokeOpacity="0.25" />
        <path d="M16 27l7 7 13-15" />
      </svg>
    </span>
  );
}

/** مؤشر تحميل للصفحة الكاملة (lazy routes) */
export function PageLoader() {
  return (
    <div className="container py-16" role="status" aria-label="جاري التحميل">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-4 h-9 w-2/5" />
      <Skeleton className="mb-10 h-4 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
