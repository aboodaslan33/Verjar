import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';
import { Icon } from './Icon';

/** عنوان قسم موحّد: سطر صغير + عنوان، ورابط جانبي اختياري */
export function SectionHeading({
  eyebrow,
  title,
  id,
  link,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  id?: string;
  link?: { to: string; label: string };
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className={cx('text-2xl md:text-[2rem] md:leading-[1.35]', eyebrow && 'mt-4')}>
          {title}
        </h2>
        {description && <p className="mt-3 text-muted">{description}</p>}
      </div>
      {link && (
        <Link to={link.to} className="group inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-sm font-semibold text-ink">
          <span className="underline-offset-4 group-hover:underline">{link.label}</span>
          <Icon name="arrowLeft" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
        </Link>
      )}
    </div>
  );
}
