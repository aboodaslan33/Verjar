import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';

export type Crumb = { to?: string; label: string };

/** مسار التصفح */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="مسار التصفح" className={cx('text-[13px] text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-line-strong">/</span>}
            {c.to ? (
              <Link to={c.to} className="transition-colors hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * رأس الصفحات الداخلية — تحريري: عنوان قوي، وصف بعرض قراءة مريح،
 * وخط القياس من الشعار كفاصل سفلي. aside: محتوى جانبي اختياري على الشاشات الكبيرة.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  crumbs,
  aside,
  tone = 'light',
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  crumbs?: Crumb[];
  aside?: ReactNode;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <header className={cx('relative overflow-hidden', dark ? 'bg-inverse text-inverse-fg' : 'bg-subtle')}>
      <div className="container grid gap-8 pb-10 pt-8 md:pb-14 md:pt-12 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          {crumbs && <Breadcrumbs items={crumbs} className={cx('mb-6', dark && '[&_a:hover]:text-inverse-fg [&_*]:text-inverse-fg/60')} />}
          {eyebrow && <p className={cx('eyebrow mb-4', dark && '!text-inverse-fg/70')}>{eyebrow}</p>}
          <h1 className={cx('text-[1.875rem] leading-[1.3] md:text-[2.625rem]', dark && 'text-inverse-fg')}>{title}</h1>
          {description && <p className={cx('mt-4 max-w-prose text-[17px] leading-relaxed', dark ? 'text-inverse-fg/70' : 'text-muted')}>{description}</p>}
          {children && <div className="mt-6">{children}</div>}
        </div>
        {aside && <div className="lg:col-span-4">{aside}</div>}
      </div>
      <div className="container">
        <div className={cx('measure', dark && '!bg-inverse-fg/15')} aria-hidden />
      </div>
    </header>
  );
}
