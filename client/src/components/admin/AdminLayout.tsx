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
import { LangSwitch, useI18n, type MessageKey } from '../../lib/i18n';
import { hasPerm } from '../../context/Auth';
import { NotificationsBell } from '../NotificationsBell';

type NavItem = { to: string; label: string; k?: MessageKey; end?: boolean; badge?: (s: DashboardStats) => number; perm: string[] };

const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ to: '/admin', label: 'لوحة التحكم', end: true, perm: ['dashboard.view'] }] },
  {
    group: 'أداء المنصة والتميز',
    items: [
      { to: '/admin/insights', label: 'أداء المنصة', end: true, perm: ['insights.view'] },
      { to: '/admin/insights/recognition', label: 'التميز الشهري', perm: ['insights.view'] },
      { to: '/admin/insights/rewards', label: 'المكافآت والكوبونات', perm: ['insights.view'] },
      { to: '/admin/insights/archive', label: 'أرشيف التميز', perm: ['insights.view'] },
    ],
  },
  {
    group: 'العمليات',
    items: [
      { to: '/admin/bookings', label: 'الحجوزات', badge: (s) => s.newBookings, perm: ['bookings.manage'] },
      { to: '/admin/orders', label: 'طلبات المتجر', badge: (s) => s.newOrders, perm: ['orders.view'] },
      { to: '/admin/corporate', label: 'طلبات الشركات', badge: (s) => s.pendingCorporate, perm: ['corporate.manage'] },
      { to: '/admin/contracts', label: 'عقود الشركات', k: 'admin.contracts', badge: (s) => s.expiringContracts, perm: ['corporate.manage'] },
      { to: '/admin/tenders', label: 'العطاءات', k: 'admin.tenders', perm: ['corporate.manage'] },
      { to: '/admin/delivery', label: 'التوصيل والتحصيل', k: 'admin.delivery', perm: ['orders.view', 'delivery.manage', 'collections.view'] },
    ],
  },
  {
    group: 'السوق الصناعي',
    items: [
      { to: '/admin/market', label: 'لوحة السوق', end: true, perm: ['market.view', 'market.manage'] },
      { to: '/admin/market/rfqs', label: 'طلبات الأسعار / Leads', perm: ['market.view', 'market.manage'] },
      { to: '/admin/market/suppliers', label: 'الموردون والاعتماد', badge: (s) => s.pendingSuppliers ?? 0, perm: ['market.view', 'market.manage'] },
      { to: '/admin/market/plans', label: 'الباقات', perm: ['market.view', 'market.finance'] },
      { to: '/admin/market/commissions', label: 'العمولات', perm: ['market.view', 'market.finance'] },
      { to: '/admin/market/ads', label: 'الإعلانات', perm: ['market.view', 'market.manage'] },
      { to: '/admin/market/invoices', label: 'الفواتير', badge: (s) => s.paymentProofs ?? 0, perm: ['market.view', 'market.finance'] },
      { to: '/admin/market/reviews', label: 'التقييمات', perm: ['market.view', 'market.manage'] },
    ],
  },
  {
    group: 'المنتجات والكتالوج',
    items: [
      { to: '/admin/products', label: 'المنتجات', badge: (s) => s.pendingProducts ?? 0, perm: ['catalog.manage'] },
      { to: '/admin/categories', label: 'الأقسام', perm: ['catalog.manage'] },
      { to: '/admin/vendors', label: 'الموردون', perm: ['suppliers.view', 'suppliers.manage'] },
    ],
  },
  {
    group: 'الحسابات',
    items: [
      { to: '/admin/finance', label: 'المالية', perm: ['payments.view'] },
      { to: '/admin/reports', label: 'التقارير', k: 'admin.reports', perm: ['reports.view'] },
      { to: '/admin/customers', label: 'العملاء', perm: ['customers.view'] },
      { to: '/admin/newsletter', label: 'النشرة البريدية', perm: ['newsletter.manage'] },
      { to: '/admin/technicians', label: 'الفنيون', perm: ['bookings.manage'] },
    ],
  },
  {
    group: 'النظام',
    items: [
      { to: '/admin/users', label: 'المستخدمون والصلاحيات', perm: ['users.manage'] },
      { to: '/admin/settings', label: 'الإعدادات', perm: ['settings.manage'] },
      { to: '/admin/logs', label: 'السجلات', perm: ['audit.view'] },
    ],
  },
];

function Sidebar({ stats, onNavigate }: { stats: DashboardStats | null; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { admin } = useAdmin();
  // القائمة حسب صلاحيات المستخدم (RBAC)؛ المجموعة الفارغة لا تظهر
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((n) => hasPerm(admin, ...n.perm)) })).filter((g) => g.items.length);
  return (
    <nav aria-label="قائمة لوحة التحكم" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g, gi) => (
        <div key={gi} className={cx(gi > 0 && 'mt-5')}>
          {g.group && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-inverse-fg/40">{g.group}</p>}
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
                        'relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors',
                        isActive
                          ? 'bg-inverse-2 font-semibold text-inverse-fg before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-primary'
                          : 'text-inverse-fg/70 hover:bg-inverse-2/60 hover:text-inverse-fg',
                      )
                    }
                  >
                    <span>{n.k ? t(n.k) : n.label}</span>
                    {count > 0 && (
                      <span className="min-w-[1.5rem] rounded-full bg-primary px-1.5 text-center text-xs font-bold tabular-nums text-primary-fg">{count}</span>
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
  const canDashboard = hasPerm(admin, 'dashboard.view');
  const { data: stats } = useAdminQuery(
    () => (canDashboard ? api.get<DashboardStats>('/admin/dashboard/stats') : Promise.resolve(null as unknown as DashboardStats)),
    [location.pathname, canDashboard],
    { live: true, keep: true },
  );

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
    <div className="min-h-screen bg-subtle/50">
      {/* الشريط الجانبي — سطح المكتب (يمين الشاشة في RTL) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col bg-inverse lg:flex print:!hidden">
        <div className="flex h-16 items-center border-b border-inverse-fg/10 px-5">
          <Logo to="/admin" light className="[&_svg]:h-9" />
        </div>
        <Sidebar stats={stats} />
      </aside>

      {/* درج الجوال */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة">
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} aria-hidden />
          <aside className="anim-fade absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-inverse shadow-overlay">
            <div className="flex h-16 items-center justify-between border-b border-inverse-fg/10 px-4">
              <Logo to="/admin" light className="[&_svg]:h-9" />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-inverse-fg/70 hover:bg-inverse-2" aria-label="إغلاق القائمة">
                <Icon name="close" />
              </button>
            </div>
            <Sidebar stats={stats} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:ps-64 print:!ps-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface px-3 sm:px-5 print:hidden">
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
                unseen > 0 ? 'bg-brand-100 font-semibold text-brand-900 dark:bg-brand-500/20 dark:text-brand-200' : 'text-muted hover:bg-subtle',
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
            <NotificationsBell hrefFor={(n) => (n.orderId ? `/admin/delivery/orders/${n.orderId}` : null)} />
            <LangSwitch className="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold text-muted hover:bg-subtle hover:text-ink" />
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
