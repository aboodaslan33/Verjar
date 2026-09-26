import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminAuth';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { Logo } from '../layout/Logo';
import { Icon } from '../ui';
import { useAdminQuery } from './hooks';
import { LiveProvider, useLive } from './live';
import type { DashboardStats } from './types';

type NavItem = { to: string; label: string; end?: boolean; badge?: (s: DashboardStats) => number };

const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ to: '/admin', label: 'لوحة التحكم', end: true }] },
  {
    group: 'العمليات',
    items: [
      { to: '/admin/bookings', label: 'الحجوزات', badge: (s) => s.newBookings },
      { to: '/admin/orders', label: 'طلبات المتجر', badge: (s) => s.newOrders },
      { to: '/admin/corporate', label: 'طلبات الشركات', badge: (s) => s.pendingCorporate },
      { to: '/admin/contracts', label: 'عقود الشركات', badge: (s) => s.expiringContracts },
    ],
  },
  {
    group: 'المتجر',
    items: [
      { to: '/admin/products', label: 'المنتجات' },
      { to: '/admin/categories', label: 'التصنيفات' },
    ],
  },
  {
    group: 'الحسابات',
    items: [
      { to: '/admin/finance', label: 'المالية' },
      { to: '/admin/customers', label: 'العملاء' },
      { to: '/admin/technicians', label: 'الفنيون' },
    ],
  },
  {
    group: 'النظام',
    items: [
      { to: '/admin/settings', label: 'الإعدادات' },
      { to: '/admin/logs', label: 'السجلات' },
    ],
  },
];

function Sidebar({ stats, onNavigate }: { stats: DashboardStats | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="قائمة لوحة التحكم" className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((g, gi) => (
        <div key={gi} className={cx(gi > 0 && 'mt-5')}>
          {g.group && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-muted">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((n) => {
              const count = stats && n.badge ? n.badge(stats) : 0;
              return (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors',
                        isActive
                          ? 'bg-brand-700 font-semibold text-white dark:bg-brand-500'
                          : 'text-ink/85 hover:bg-subtle hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span>{n.label}</span>
                        {count > 0 && (
                          <span
                            className={cx(
                              'min-w-[1.5rem] rounded-full px-1.5 text-center text-xs font-bold tabular-nums',
                              isActive ? 'bg-white/20 text-white' : 'bg-sand-200 text-brand-900',
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Shell() {
  const { admin, logout } = useAdmin();
  const { theme, toggle } = useTheme();
  const { unseen, clearUnseen, connected } = useLive();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: stats } = useAdminQuery(() => api.get<DashboardStats>('/admin/dashboard/stats'), [location.pathname], { live: true, keep: true });

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (location.pathname === '/admin' || location.pathname === '/admin/') clearUnseen();
  }, [location.pathname, clearUnseen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const onLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* الشريط الجانبي — سطح المكتب (يمين الشاشة في RTL) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-line bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Logo to="/admin" />
        </div>
        <Sidebar stats={stats} />
      </aside>

      {/* درج الجوال */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] animate-fade-up flex-col bg-surface shadow-lift">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Logo to="/admin" />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-subtle" aria-label="إغلاق القائمة">
                <Icon name="close" />
              </button>
            </div>
            <Sidebar stats={stats} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink lg:hidden"
            aria-label="فتح القائمة"
          >
            <Icon name="menu" />
          </button>
          <span className="text-sm font-semibold lg:hidden">لوحة التحكم</span>

          <div className="ms-auto flex items-center gap-1">
            <Link
              to="/admin"
              onClick={clearUnseen}
              className={cx(
                'flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm',
                unseen > 0 ? 'bg-sand-200 font-semibold text-brand-900' : 'text-muted hover:bg-subtle',
              )}
              title={connected ? 'الإشعارات اللحظية متصلة' : 'الإشعارات اللحظية غير متصلة'}
            >
              <span className={cx('h-2 w-2 rounded-full', connected ? 'bg-success' : 'bg-line')} aria-hidden />
              {unseen > 0 ? (
                <>
                  جديد <span className="tabular-nums">{unseen}</span>
                </>
              ) : (
                <span className="hidden sm:inline">مباشر</span>
              )}
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-subtle hover:text-ink sm:flex"
            >
              <Icon name="external" className="h-4 w-4" /> عرض الموقع
            </a>
            <button
              type="button"
              onClick={toggle}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
              aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-5 w-5" />
            </button>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{admin?.name}</span>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted hover:bg-subtle hover:text-ink"
            >
              <Icon name="logout" className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </header>
        <main id="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  );
}
