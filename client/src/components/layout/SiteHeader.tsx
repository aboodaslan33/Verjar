import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../../context/Auth';
import { useCart } from '../../context/CartContext';
import { useSite } from '../../context/SiteContext';
import { useTheme } from '../../context/ThemeContext';
import { cx, displayPhone } from '../../lib/format';
import { Icon } from '../ui';
import { Logo } from './Logo';

export const NAV = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/bookings', label: 'الحجوزات' },
  { to: '/corporate', label: 'عقود الشركات' },
  { to: '/store', label: 'المتجر' },
  { to: '/about', label: 'نبذة عنا' },
  { to: '/contact', label: 'تواصل' },
];

export function SiteHeader() {
  const { settings } = useSite();
  const { count } = useCart();
  const { theme, toggle } = useTheme();
  const { user, loading: authLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  // ظل خفيف للهيدر بعد بدء التمرير
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function onLogout() {
    await logout();
    if (location.pathname.startsWith('/account')) navigate('/', { replace: true });
  }

  return (
    <header className={cx('sticky top-0 z-40 border-b border-line bg-bg transition-shadow duration-300', scrolled && 'shadow-[0_6px_20px_-14px_rgb(17_24_39/0.35)]')}>
      {/* شريط التواصل العلوي */}
      <div className="hidden border-b border-line bg-subtle text-muted md:block">
        <div className="container flex h-9 items-center justify-between text-[13px]">
          <span>{settings.workingHoursText}</span>
          <div className="flex items-center gap-5">
            <a href={`tel:${settings.phone}`} className="flex items-center gap-1.5 hover:text-ink">
              <Icon name="phone" className="h-3.5 w-3.5" />
              <span className="ltr">{settings.phone}</span>
            </a>
            <a href={`mailto:${settings.email}`} className="flex items-center gap-1.5 hover:text-ink">
              <Icon name="mail" className="h-3.5 w-3.5" />
              <span className="ltr">{settings.email}</span>
            </a>
          </div>
        </div>
      </div>

      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo splashAnchor />

        <nav className="hidden lg:block" aria-label="القائمة الرئيسية">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
                      isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'text-ink/80 hover:text-ink',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
            aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {authLoading ? (
            <span className="hidden w-16 sm:block" aria-hidden />
          ) : user ? (
            <div className="hidden items-center sm:flex">
              <Link
                to={homeFor(user)}
                className="flex h-10 max-w-[10rem] items-center rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-subtle"
                title={user.role === 'CUSTOMER' ? 'حسابي' : 'لوحة التحكم'}
              >
                <span className="truncate">{user.name}</span>
              </Link>
              <button type="button" onClick={onLogout} className="flex h-10 items-center rounded-lg px-2.5 text-sm text-muted hover:bg-subtle hover:text-ink">
                خروج
              </button>
            </div>
          ) : (
            <Link to="/login" className="hidden h-10 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-subtle sm:flex">
              دخول
            </Link>
          )}
          <Link to="/cart" className="relative grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink" aria-label={`السلة (${count})`}>
            <Icon name="cart" />
            {count > 0 && (
              <span className="absolute -top-0.5 end-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-fg">
                {count}
              </span>
            )}
          </Link>
          <Link
            to="/bookings"
            className="ms-2 hidden h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover sm:inline-flex"
          >
            احجز موعد
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg hover:bg-subtle lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="القائمة"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="animate-fade-up border-t border-line bg-bg lg:hidden" aria-label="القائمة">
          <ul className="container space-y-1 py-3">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx('block rounded-xl px-4 py-3 text-base font-medium', isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-100' : 'hover:bg-subtle')
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2 border-t border-line pt-3">
              {user ? (
                <div className="flex items-center justify-between gap-3 px-4">
                  <Link to={homeFor(user)} className="min-w-0 py-2 font-medium">
                    <span className="block truncate">{user.name}</span>
                    <span className="block text-sm text-muted">{user.role === 'CUSTOMER' ? 'حسابي' : 'لوحة التحكم'}</span>
                  </Link>
                  <button type="button" onClick={onLogout} className="h-11 shrink-0 rounded-xl border border-line px-4 text-sm font-medium">
                    تسجيل الخروج
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="flex h-12 items-center justify-center rounded-xl border border-line font-medium">
                    تسجيل الدخول
                  </Link>
                  <Link to="/register" className="flex h-12 items-center justify-center rounded-xl border border-line font-medium">
                    إنشاء حساب
                  </Link>
                </div>
              )}
            </li>
            <li className="grid grid-cols-2 gap-2 pt-2">
              <a href={`tel:${settings.phone}`} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line font-medium">
                <Icon name="phone" className="h-4 w-4" /> <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
              </a>
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1f7a4d] font-medium text-white"
              >
                <Icon name="whatsapp" className="h-4 w-4" /> واتساب
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
