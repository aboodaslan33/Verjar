import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo';
import { NotificationsBell } from '../../components/NotificationsBell';
import { Icon } from '../../components/ui';
import { useAuth } from '../../context/Auth';
import { useTheme } from '../../context/ThemeContext';
import { cx } from '../../lib/format';
import { LangSwitch } from '../../lib/i18n';

const NAV = [
  { to: '/vendor', label: 'الرئيسية', end: true },
  { to: '/vendor/orders', label: 'الطلبات' },
  { to: '/vendor/delivery', label: 'طلبات التوصيل' },
  { to: '/vendor/products', label: 'المنتجات' },
  { to: '/vendor/earnings', label: 'الأرباح' },
  { to: '/vendor/tenders', label: 'العطاءات' },
  { to: '/vendor/profile', label: 'ملف المتجر' },
];

export function VendorLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const vendor = user?.role === 'CUSTOMER' ? user.vendor : null;

  return (
    <div className="min-h-screen bg-subtle/50">
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo to="/vendor" />
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
          <span className="hidden min-w-0 truncate text-sm font-semibold sm:block">لوحة المورد · {vendor?.name}</span>
          <div className="ms-auto flex items-center gap-1">
            {vendor && (
              <a
                href={`/store/vendor/${vendor.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-subtle hover:text-ink sm:flex"
              >
                <Icon name="external" className="h-4 w-4" /> صفحة متجري
              </a>
            )}
            <NotificationsBell hrefFor={(n) => (n.orderId && n.recipientType === 'VENDOR' ? `/vendor/delivery/${n.orderId}` : n.orderId ? `/account?tab=orders` : null)} />
            <LangSwitch className="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold text-muted hover:bg-subtle hover:text-ink" />
            <button
              type="button"
              onClick={toggle}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
              aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/', { replace: true });
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-subtle hover:text-ink"
            >
              <Icon name="logout" className="h-4 w-4" /> <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
        <nav aria-label="قائمة لوحة المورد" className="mx-auto max-w-7xl overflow-x-auto px-2 sm:px-4 lg:px-6">
          <ul className="flex min-w-max gap-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'relative block px-3 py-3 text-[15px] font-medium transition-colors',
                      'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
                      isActive ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="page-enter">
        <Outlet />
      </main>
    </div>
  );
}
