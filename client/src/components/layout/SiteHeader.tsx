import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../../context/Auth';
import { useCart } from '../../context/CartContext';
import { useSite } from '../../context/SiteContext';
import { useTheme } from '../../context/ThemeContext';
import { cx, displayPhone } from '../../lib/format';
import { Icon, type IconName } from '../ui';
import { Logo } from './Logo';
import { LangSwitch, useI18n, type MessageKey } from '../../lib/i18n';

export const NAV: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/bookings', key: 'nav.bookings' },
  { to: '/store', key: 'nav.store' },
  { to: '/work', key: 'nav.work' },
  { to: '/corporate', key: 'nav.corporate' },
  { to: '/about', key: 'nav.about' },
  { to: '/contact', key: 'nav.contact' },
];

/** عدّاد السلة — يقفز قليلًا عند كل إضافة */
function CartCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      key={count}
      className={cx(
        'anim-bump absolute grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-fg ring-2 ring-bg',
        className,
      )}
    >
      <span className="num">{count > 99 ? '99+' : count}</span>
    </span>
  );
}

/**
 * الهيدر:
 * - سطح المكتب (xl): الشعار، القائمة، الحساب، السلة، والإجراء الرئيسي "احجز موعدًا"
 * - الجوال والتابلت: الشعار وزر الحجز فقط، والتنقل في الشريط السفلي (MobileTabBar)
 */
export function SiteHeader() {
  const { settings } = useSite();
  const { count } = useCart();
  const { theme, toggle } = useTheme();
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMenu(false), [location.pathname]);

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
    <>
      <header className={cx('sticky top-0 z-40 bg-bg/100 transition-shadow duration-300', scrolled ? 'shadow-[0_1px_0_rgb(var(--c-line)),0_10px_30px_-20px_rgb(var(--c-shadow)/0.35)]' : 'shadow-[0_1px_0_rgb(var(--c-line))]')}>
        {/* شريط التواصل العلوي — فحمي كخلفية الشعار */}
        <div className="hidden bg-inverse text-inverse-fg/70 lg:block">
          <div className="container flex h-9 items-center justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <Icon name="clock" className="h-3.5 w-3.5 text-primary" />
              {settings.workingHoursText}
            </span>
            <div className="flex items-center gap-6">
              <a href={`tel:${settings.phone}`} className="flex items-center gap-1.5 transition-colors hover:text-inverse-fg">
                <Icon name="phone" className="h-3.5 w-3.5" />
                <span className="ltr">{settings.phone}</span>
              </a>
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-inverse-fg"
              >
                <Icon name="whatsapp" className="h-3.5 w-3.5" />
                <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
              </a>
              <a href={`mailto:${settings.email}`} className="flex items-center gap-1.5 transition-colors hover:text-inverse-fg">
                <Icon name="mail" className="h-3.5 w-3.5" />
                <span className="ltr">{settings.email}</span>
              </a>
            </div>
          </div>
        </div>

        <div className="container flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
          <Logo splashAnchor />

          <nav className="hidden xl:block" aria-label={t('nav.menu')}>
            <ul className="flex items-center">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      cx(
                        'relative block whitespace-nowrap px-3.5 py-2 text-[15px] font-medium transition-colors ltr:px-2.5 ltr:2xl:px-3.5',
                        'after:absolute after:inset-x-3.5 ltr:after:inset-x-2.5 after:-bottom-[15px] after:h-[3px] after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-out',
                        isActive ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
                      )
                    }
                  >
                    {t(n.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-1">
            <LangSwitch />
            <button
              type="button"
              onClick={toggle}
              className="grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
              aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>

            {/* الحساب والسلة — على الشاشات الكبيرة فقط (على الجوال في الشريط السفلي) */}
            <div className="hidden items-center gap-1 lg:flex">
              {authLoading ? (
                <span className="w-24" aria-hidden />
              ) : user ? (
                <>
                  {user.role === 'CUSTOMER' && user.vendor && (
                    <Link to="/vendor" title={t('nav.myStore')} className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle">
                      <Icon name="store" className="h-4 w-4 text-muted" /> <span className="ltr:hidden ltr:2xl:inline">{t('nav.myStore')}</span>
                    </Link>
                  )}
                  <Link
                    to={homeFor(user)}
                    className="flex h-10 max-w-[11rem] items-center gap-2 ltr:max-w-[8rem] ltr:2xl:max-w-[11rem] rounded-lg px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle"
                    title={user.role === 'CUSTOMER' ? t('nav.account') : t('nav.dashboard')}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-bg">{user.name.slice(0, 1)}</span>
                    <span className="truncate">{user.name}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
                    aria-label={t('nav.logout')}
                    title={t('nav.logout')}
                  >
                    <Icon name="logout" className="h-[18px] w-[18px]" />
                  </button>
                </>
              ) : (
                <Link to="/login" className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle">
                  <Icon name="user" className="h-[18px] w-[18px] text-muted" /> {t('nav.login')}
                </Link>
              )}
              <Link
                to="/cart"
                className="relative grid h-10 w-10 place-items-center rounded-lg text-ink transition-colors hover:bg-subtle"
                aria-label={`${t('nav.cart')} (${count})`}
              >
                <Icon name="bag" />
                <CartCount count={count} className="-top-0.5 end-0" />
              </Link>
            </div>

            <Link
              to="/bookings"
              className="ms-1 inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover active:translate-y-px"
            >
              <Icon name="calendar" className="hidden h-4 w-4 sm:block" />
              <span className="ltr:max-sm:hidden">{t('nav.book')}</span>
              <span className="hidden ltr:max-sm:inline">{t('nav.bookShort')}</span>
            </Link>

            {/* بين الجوال وسطح المكتب (1024–1279): قائمة كاملة */}
            <button
              type="button"
              className="ms-1 hidden h-10 w-10 place-items-center rounded-lg transition-colors hover:bg-subtle lg:grid xl:hidden"
              aria-expanded={menu}
              aria-label={t('nav.menu')}
              onClick={() => setMenu(true)}
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </header>
      <MenuSheet open={menu} onClose={() => setMenu(false)} />
    </>
  );
}

type TabItem = { to: string; key: MessageKey; icon: IconName; end?: boolean; match?: (p: string) => boolean };

const TABS: TabItem[] = [
  { to: '/', key: 'nav.home', icon: 'home', end: true },
  { to: '/bookings', key: 'nav.bookShort', icon: 'calendar', match: (p) => p.startsWith('/bookings') },
  { to: '/store', key: 'nav.store', icon: 'store', match: (p) => p.startsWith('/store') },
  { to: '/cart', key: 'nav.cart', icon: 'bag', match: (p) => p.startsWith('/cart') || p.startsWith('/checkout') },
];

/**
 * الشريط السفلي للجوال والتابلت: أهم أربع وجهات (الحجز والسوق والسلة) في متناول الإبهام،
 * و"المزيد" يفتح بقية الصفحات والحساب.
 */
export function MobileTabBar() {
  const { count } = useCart();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const inMore = ['/work', '/corporate', '/about', '/contact', '/account', '/login', '/register', '/vendor'].some((p) => pathname.startsWith(p));

  const item = 'relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors';
  return (
    <>
      <nav
        aria-label={t('nav.quick')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-saturate-150 lg:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-lg">
          {TABS.map((tab) => {
            const active = tab.match ? tab.match(pathname) : pathname === tab.to;
            return (
              <li key={tab.to} className="flex flex-1">
                <Link to={tab.to} aria-current={active ? 'page' : undefined} className={cx(item, active ? 'text-ink' : 'text-muted')}>
                  <span className={cx('absolute top-0 h-[3px] w-8 rounded-b-full bg-primary transition-transform duration-300 ease-out', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden />
                  <span className="relative">
                    <Icon name={tab.icon} className="h-[22px] w-[22px]" />
                    {tab.to === '/cart' && <CartCount count={count} className="-end-2.5 -top-1.5" />}
                  </span>
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={cx(item, inMore ? 'text-ink' : 'text-muted')}>
              <span className={cx('absolute top-0 h-[3px] w-8 rounded-b-full bg-primary transition-transform duration-300', inMore ? 'scale-x-100' : 'scale-x-0')} aria-hidden />
              <Icon name="grid" className="h-[22px] w-[22px]" />
              {t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      <MenuSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}

/** ورقة القائمة الكاملة: الصفحات، الحساب، والتواصل */
function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { settings } = useSite();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const link = 'flex min-h-[3.25rem] items-center justify-between gap-3 px-1 text-[16px] font-medium';
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
      <div className="anim-fade absolute inset-0 bg-[rgb(20_20_21/0.5)]" onClick={onClose} aria-hidden />
      <div className="anim-sheet absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-overlay lg:inset-x-auto lg:end-4 lg:top-4 lg:bottom-auto lg:w-96 lg:rounded-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <Logo className="[&_svg]:h-8" />
          <div className="flex items-center gap-1">
            <LangSwitch />
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle" aria-label={t('nav.close')}>
              <Icon name="close" />
            </button>
          </div>
        </div>
        <nav className="px-5 pt-2" aria-label={t('nav.menu')}>
          <ul className="divide-y divide-line">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} onClick={onClose} className={({ isActive }) => cx(link, isActive ? 'text-ink' : 'text-ink/80')}>
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-3">
                        <span className={cx('h-5 w-[3px] rounded-full', isActive ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                        {t(n.key)}
                      </span>
                      <Icon name="chevronLeft" className="h-4 w-4 text-muted" />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-5 mt-4 rounded-xl bg-subtle p-4">
          {user ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-bold text-bg">{user.name.slice(0, 1)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{user.name}</span>
                  <span className="text-sm text-muted">{user.role === 'CUSTOMER' ? t('nav.customerAccount') : t('nav.adminAccount')}</span>
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link to={homeFor(user)} onClick={onClose} className="flex h-11 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-bg">
                  {user.role === 'CUSTOMER' ? t('nav.account') : t('nav.dashboard')}
                </Link>
                {user.role === 'CUSTOMER' && user.vendor ? (
                  <Link to="/vendor" onClick={onClose} className="flex h-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-sm font-semibold">
                    {t('nav.myStore')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      onClose();
                      navigate('/', { replace: true });
                    }}
                    className="h-11 rounded-lg border border-line-strong bg-surface text-sm font-semibold"
                  >
                    {t('nav.logout')}
                  </button>
                )}
              </div>
              {user.role === 'CUSTOMER' && user.vendor && (
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    onClose();
                    navigate('/', { replace: true });
                  }}
                  className="mt-3 w-full text-center text-sm text-muted underline-offset-4 hover:underline"
                >
                  {t('nav.logout')}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{t('nav.signedInHint')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link to="/login" onClick={onClose} className="flex h-11 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-bg">
                  {t('nav.loginFull')}
                </Link>
                <Link to="/register" onClick={onClose} className="flex h-11 items-center justify-center rounded-lg border border-line-strong bg-surface text-sm font-semibold">
                  {t('nav.register')}
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="mx-5 mt-4 grid grid-cols-2 gap-2 text-sm">
          <a href={`tel:${settings.phone}`} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line font-medium">
            <Icon name="phone" className="h-4 w-4" /> {t('nav.call')}
          </a>
          <a
            href={`https://wa.me/${settings.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-whatsapp font-medium text-white"
          >
            <Icon name="whatsapp" className="h-4 w-4" /> {t('nav.whatsapp')}
          </a>
        </div>
      </div>
    </div>
  );
}
