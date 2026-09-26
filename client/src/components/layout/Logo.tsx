import { Link } from 'react-router-dom';
import { cx } from '../../lib/format';

/** شعار فيرجار: حرف V هندسي + الاسم */
export function Logo({ className, to = '/', light = false }: { className?: string; to?: string; light?: boolean }) {
  return (
    <Link to={to} className={cx('flex items-center gap-2.5', className)} aria-label="فيرجار — الصفحة الرئيسية">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="10" className={light ? 'fill-sand-200' : 'fill-brand-700 dark:fill-brand-500'} />
        <path d="M10 11h5.6l4.4 12.6L24.4 11H30l-7.4 18h-5.2z" className={light ? 'fill-brand-800' : 'fill-sand-200'} />
      </svg>
      <span className="leading-none">
        <span className={cx('block text-xl font-bold', light ? 'text-white' : 'text-ink')}>فيرجار</span>
        <span className={cx('block text-[11px] tracking-wide', light ? 'text-sand-200/80' : 'text-muted')}>VERJAR</span>
      </span>
    </Link>
  );
}
