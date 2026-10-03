import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { loginPath } from '../../components/auth/RequireCustomer';
import { ButtonLink, EmptyState, PageLoader } from '../../components/ui';
import { isAdminUser, useAuth } from '../../context/Auth';
import { VendorLayout } from './VendorLayout';

const Home = lazy(() => import('./VendorHome'));
const Profile = lazy(() => import('./VendorProfile'));
const Products = lazy(() => import('./VendorProducts'));
const ProductEdit = lazy(() => import('./VendorProductEdit'));
const Orders = lazy(() => import('./VendorOrders'));
const OrderDetail = lazy(() => import('./VendorOrderDetail'));
const Earnings = lazy(() => import('./VendorEarnings'));
const Finance = lazy(() => import('./VendorFinance'));
const Tenders = lazy(() => import('./VendorTenders'));
const M = () => import('./VendorMarket');
const Rfqs = lazy(() => M().then((m) => ({ default: m.VendorRfqs })));
const RfqDetail = lazy(() => M().then((m) => ({ default: m.VendorRfqDetail })));
const Stats = lazy(() => M().then((m) => ({ default: m.VendorStats })));
const Subscription = lazy(() => M().then((m) => ({ default: m.VendorSubscription })));
const Ads = lazy(() => M().then((m) => ({ default: m.VendorAds })));
const Team = lazy(() => M().then((m) => ({ default: m.VendorTeam })));
const DeliveryList = lazy(() => import('./VendorDeliveryOrders').then((m) => ({ default: m.VendorDeliveryList })));
const DeliveryNew = lazy(() => import('./VendorDeliveryOrders').then((m) => ({ default: m.VendorDeliveryNew })));
const DeliveryDetail = lazy(() => import('./VendorDeliveryOrders').then((m) => ({ default: m.VendorDeliveryDetail })));

const s = (el: JSX.Element) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

/** لوحة المورد: لعميل لديه صلاحية مورد فعّالة (السيرفر يتحقق من كل طلب) */
export default function VendorApp() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={loginPath(location)} replace />;
  if (user.role !== 'CUSTOMER' || !user.vendor) {
    return (
      <div className="container max-w-xl py-20">
        <EmptyState
          title="لوحة الموردين"
          description={
            isAdminUser(user)
              ? 'أنت مسجّل الدخول بحساب الإدارة. الموردون يُدارون من لوحة التحكم.'
              : 'حسابك ليس لديه صلاحية مورد. تواصل مع الإدارة إذا أردت بيع منتجاتك في السوق.'
          }
          action={<ButtonLink to={isAdminUser(user) ? '/admin/vendors' : '/contact'}>{isAdminUser(user) ? 'الموردون' : 'تواصل معنا'}</ButtonLink>}
        />
      </div>
    );
  }
  const approved = user.vendor.status === undefined || user.vendor.status === 'APPROVED';
  const owner = user.vendor.role !== 'STAFF';
  return (
    <Routes>
      <Route element={<VendorLayout />}>
        <Route index element={s(<Home />)} />
        <Route path="profile" element={s(<Profile />)} />
        <Route path="products" element={s(<Products />)} />
        <Route path="products/new" element={s(<ProductEdit />)} />
        <Route path="products/:id" element={s(<ProductEdit />)} />
        <Route path="orders" element={s(<Orders />)} />
        <Route path="orders/:id" element={s(<OrderDetail />)} />
        <Route path="rfqs" element={s(<Rfqs />)} />
        <Route path="rfqs/:id" element={s(<RfqDetail approved={approved} />)} />
        <Route path="stats" element={s(<Stats />)} />
        <Route path="subscription" element={s(<Subscription owner={owner} />)} />
        <Route path="ads" element={s(<Ads approved={approved} />)} />
        <Route path="team" element={s(<Team owner={owner} />)} />
        <Route path="delivery" element={s(<DeliveryList />)} />
        <Route path="delivery/new" element={s(<DeliveryNew />)} />
        <Route path="delivery/:id" element={s(<DeliveryDetail />)} />
        <Route path="earnings" element={s(<Earnings />)} />
        <Route path="finance" element={s(<Finance />)} />
        <Route path="tenders" element={s(<Tenders />)} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Route>
    </Routes>
  );
}
