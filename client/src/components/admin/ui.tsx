import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';
import { Icon, Skeleton } from '../ui';
import { useDebounced } from './hooks';

/** رأس صفحة داخل لوحة التحكم */
export function AdminPage({
  title,
  description,
  actions,
  back,
  children,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <Icon name="chevronRight" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] leading-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** قسم بإطار وعنوان */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('card overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="font-sans text-[15px] font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** بطاقة رقم إحصائي (KPI): الرقم هو الأبرز، والنبرة نقطة لونية صغيرة فقط */
export function StatTile({
  label,
  value,
  sub,
  to,
  tone = 'neutral',
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  to?: string;
  tone?: 'neutral' | 'brand' | 'sand' | 'warn';
  loading?: boolean;
}) {
  const body = (
    <>
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span
          className={cx(
            'h-2 w-2 rounded-full',
            tone === 'neutral' && 'bg-line-strong',
            tone === 'brand' && 'bg-primary',
            tone === 'sand' && 'bg-ink',
            tone === 'warn' && 'bg-warn',
          )}
          aria-hidden
        />
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 font-display text-[1.75rem] font-semibold leading-tight tabular-nums text-ink">{value}</p>
      )}
      {sub && !loading && <p className="mt-1 text-xs text-muted">{sub}</p>}
      {to && <Icon name="arrowLeft" className="absolute end-4 top-4 h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
  const cls = cx('card group relative block px-5 py-4', to && 'card-hover');
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** قائمة مفتاح/قيمة */
export function DefList({ items, cols = 2 }: { items: ([ReactNode, ReactNode] | null | false | undefined | '' | 0)[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl
      className={cx(
        'grid gap-x-6 gap-y-3',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {items.filter(Boolean).map((it, i) => {
        const [k, v] = it as [ReactNode, ReactNode];
        return (
          <div key={i} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 break-words text-[15px]">{v ?? '—'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('ltr', className)}>{children}</span>;
}

// ───────────── الفلاتر ─────────────

export function FilterBar({ children, onClear, active }: { children: ReactNode; onClear?: () => void; active?: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-subtle p-3 sm:p-4">
      {children}
      {onClear && active && (
        <button type="button" onClick={onClear} className="anim-fade inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted hover:bg-surface hover:text-ink">
          <Icon name="close" className="h-3.5 w-3.5" />
          مسح الفلاتر
        </button>
      )}
    </div>
  );
}

const compactInput = 'input h-10 py-0 text-sm';

export function FilterSelect({
  label,
  className,
  children,
  ...rest
}: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cx('flex min-w-[9rem] flex-1 flex-col gap-1 sm:flex-none', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <select className={cx(compactInput, 'pe-2')} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function FilterInput({ label, className, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx('flex min-w-[9rem] flex-1 flex-col gap-1 sm:flex-none', className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <input className={compactInput} {...rest} />
    </label>
  );
}

/** بحث مع تأخير */
export function SearchInput({
  value,
  onChange,
  placeholder = 'بحث…',
  label = 'بحث',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [text, setText] = useState(value);
  const debounced = useDebounced(text);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  return (
    <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="relative block">
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          className={cx(compactInput, 'ps-9')}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
      </span>
    </label>
  );
}

// ───────────── أدوات صغيرة ─────────────

/** مفتاح تشغيل/إيقاف */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange(!checked);
      }}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? '-translate-x-[1.375rem]' : '-translate-x-0.5',
        )}
      />
    </button>
  );
}

/** هيكل تحميل لصفحة تفاصيل */
export function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label="جاري التحميل">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** نص قابل للطي للرسائل الطويلة */
export function Truncated({ text, lines = 2 }: { text: string; lines?: 1 | 2 | 3 }) {
  return (
    <span className={cx('block whitespace-pre-line', lines === 1 && 'line-clamp-1', lines === 2 && 'line-clamp-2', lines === 3 && 'line-clamp-3')} title={text}>
      {text}
    </span>
  );
}

/** حقل رقمي صغير */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-sm text-danger" role="alert">
      {message}
    </p>
  );
}
