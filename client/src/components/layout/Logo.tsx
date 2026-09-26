import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';

/** محتوى الشعار: حرف F هندسي + الاسم (يُستخدم أيضًا في شاشة البداية) */
export function LogoContent({ light = false }: { light?: boolean }) {
  return (
    <>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="10" className="fill-primary" />
        <path d="M12 10h17v5.2H17.6v3.6H26v5H17.6V30H12z" className="fill-primary-fg" />
      </svg>
      <span className="leading-none">
        <span className={cx('block text-xl font-bold', light ? 'text-inverse-fg' : 'text-ink')}>فرجار قروب</span>
        <span className={cx('block text-[11px] tracking-wide', light ? 'text-inverse-fg/70' : 'text-muted')}>FARJAR GROUP</span>
      </span>
    </>
  );
}

/** شعار فرجار قروب. splashAnchor: المكان الذي ينزلق إليه الشعار في شاشة البداية */
export function Logo({ className, to = '/', light = false, splashAnchor = false }: { className?: string; to?: string; light?: boolean; splashAnchor?: boolean }) {
  return (
    <Link
      to={to}
      className={cx('flex items-center gap-2.5', className)}
      aria-label="فرجار قروب — الصفحة الرئيسية"
      data-splash-anchor={splashAnchor ? '' : undefined}
    >
      <LogoContent light={light} />
    </Link>
  );
}
