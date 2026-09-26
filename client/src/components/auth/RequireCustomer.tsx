import { useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isAdminUser, useAuth } from '../../context/Auth';
import { ButtonLink, EmptyState, PageLoader } from '../ui';

/** رابط صفحة الدخول مع العودة لنفس الصفحة بعد الدخول */
export function loginPath(location: { pathname: string; search: string }) {
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/**
 * حماية صفحات الحجز والسلة والطلب وحساب العميل:
 * الزائر يُحوَّل إلى /login?next=<الصفحة نفسها>، والأدمن يرى تنبيهًا (هذه الصفحات لحسابات العملاء).
 */
export function RequireCustomer() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={loginPath(location)} replace />;
  if (isAdminUser(user)) {
    return (
      <div className="container max-w-xl py-16">
        <EmptyState
          title="هذه الصفحة لحسابات العملاء"
          description="أنت مسجّل الدخول بحساب الإدارة. الحجوزات والطلبات تُدار من لوحة التحكم."
          action={<ButtonLink to="/admin">لوحة التحكم</ButtonLink>}
        />
      </div>
    );
  }
  return <Outlet />;
}

/** يعيد دالة تتحقق أن المستخدم عميل مسجّل، وإلا تحوّله لصفحة الدخول وتعيد false */
export function useEnsureCustomer() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback(() => {
    if (user?.role === 'CUSTOMER') return true;
    if (isAdminUser(user)) navigate('/admin');
    else navigate(loginPath(location));
    return false;
  }, [user, location, navigate]);
}
