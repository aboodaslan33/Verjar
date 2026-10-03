import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { AdminPage } from '../../components/admin/ui';
import { ButtonLink, EmptyState, Skeleton } from '../../components/ui';
import { AdminAuthProvider, useAdmin } from '../../context/AdminAuth';
import { hasPerm, isDriverUser, useAuth } from '../../context/Auth';
import { usePrefetchRoutes } from '../../lib/prefetch';

const P = {
  Login: () => import('./Login'),
  Dashboard: () => import('./Dashboard'),
  Bookings: () => import('./Bookings'),
  BookingDetail: () => import('./BookingDetail'),
  Orders: () => import('./Orders'),
  OrderDetail: () => import('./OrderDetail'),
  Products: () => import('./Products'),
  ProductEditor: () => import('./ProductEditor'),
  Categories: () => import('./Categories'),
  Corporate: () => import('./Corporate'),
  CorporateDetail: () => import('./CorporateDetail'),
  Contracts: () => import('./Contracts'),
  Finance: () => import('./Finance'),
  Customers: () => import('./Customers'),
  CustomerDetail: () => import('./CustomerDetail'),
  Technicians: () => import('./Technicians'),
  Settings: () => import('./Settings'),
  Logs: () => import('./Logs'),
  Newsletter: () => import('./Newsletter'),
  Vendors: () => import('./Vendors'),
  VendorDetail: () => import('./VendorDetail'),
  ContractDetail: () => import('./ContractDetail'),
  Tenders: () => import('./Tenders'),
  TenderDetail: () => import('./TenderDetail'),
  Delivery: () => import('./Delivery'),
  Reports: () => import('./Reports'),
  Users: () => import('./Users'),
  DeliveryOrderDetail: () => import('./DeliveryOrderDetail'),
  DeliveryOrderNew: () => import('./DeliveryOrderNew'),
  MarketOverview: () => import('./market/MarketOverview'),
  InsightsPerformance: () => import('./insights/Performance'),
  InsightsRecognition: () => import('./insights/Recognition'),
  InsightsRewards: () => import('./insights/Rewards'),
  InsightsArchive: () => import('./insights/Archive'),
  MarketSuppliers: () => import('./market/MarketSuppliers').then((m) => ({ default: m.MarketSuppliers })),
  MarketSupplierDetail: () => import('./market/MarketSuppliers').then((m) => ({ default: m.MarketSupplierDetail })),
  MarketRfqs: () => import('./market/MarketRfqs').then((m) => ({ default: m.MarketRfqs })),
  MarketRfqDetail: () => import('./market/MarketRfqs').then((m) => ({ default: m.MarketRfqDetail })),
  MarketPlans: () => import('./market/MarketConfig').then((m) => ({ default: m.MarketPlans })),
  MarketCommissions: () => import('./market/MarketConfig').then((m) => ({ default: m.MarketCommissions })),
  MarketAds: () => import('./market/MarketConfig').then((m) => ({ default: m.MarketAds })),
  MarketInvoices: () => import('./market/MarketConfig').then((m) => ({ default: m.MarketInvoices })),
  MarketReviews: () => import('./market/MarketConfig').then((m) => ({ default: m.MarketReviews })),
};

const Login = lazy(P.Login);
const Dashboard = lazy(P.Dashboard);
const Bookings = lazy(P.Bookings);
const BookingDetail = lazy(P.BookingDetail);
const Orders = lazy(P.Orders);
const OrderDetail = lazy(P.OrderDetail);
const Products = lazy(P.Products);
const ProductEditor = lazy(P.ProductEditor);
const Categories = lazy(P.Categories);
const Corporate = lazy(P.Corporate);
const CorporateDetail = lazy(P.CorporateDetail);
const Contracts = lazy(P.Contracts);
const Finance = lazy(P.Finance);
const Customers = lazy(P.Customers);
const CustomerDetail = lazy(P.CustomerDetail);
const Technicians = lazy(P.Technicians);
const Settings = lazy(P.Settings);
const Logs = lazy(P.Logs);
const Newsletter = lazy(P.Newsletter);
const Vendors = lazy(P.Vendors);
const VendorDetail = lazy(P.VendorDetail);
const ContractDetail = lazy(P.ContractDetail);
const Tenders = lazy(P.Tenders);
const TenderDetail = lazy(P.TenderDetail);
const Delivery = lazy(P.Delivery);
const Reports = lazy(P.Reports);
const Users = lazy(P.Users);
const DeliveryOrderDetail = lazy(P.DeliveryOrderDetail);
const DeliveryOrderNew = lazy(P.DeliveryOrderNew);
const MarketOverview = lazy(P.MarketOverview);
const InsightsPerformance = lazy(P.InsightsPerformance);
const InsightsRecognition = lazy(P.InsightsRecognition);
const InsightsRewards = lazy(P.InsightsRewards);
const InsightsArchive = lazy(P.InsightsArchive);
const MarketSuppliers = lazy(P.MarketSuppliers);
const MarketSupplierDetail = lazy(P.MarketSupplierDetail);
const MarketRfqs = lazy(P.MarketRfqs);
const MarketRfqDetail = lazy(P.MarketRfqDetail);
const MarketPlans = lazy(P.MarketPlans);
const MarketCommissions = lazy(P.MarketCommissions);
const MarketAds = lazy(P.MarketAds);
const MarketInvoices = lazy(P.MarketInvoices);
const MarketReviews = lazy(P.MarketReviews);

/** هيكل تحميل بشكل لوحة التحكم (أثناء التحقق من الجلسة) */
function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-bg" role="status" aria-label="جاري التحميل">
      <div className="fixed inset-y-0 start-0 hidden w-64 border-e border-line bg-surface p-5 lg:block">
        <Skeleton className="mb-8 h-9 w-32" />
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-8 w-full" />
        ))}
      </div>
      <div className="lg:ps-64">
        <div className="h-16 border-b border-line bg-surface" />
        <div className="p-6">
          <Skeleton className="mb-6 h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label="جاري التحميل">
      <Skeleton className="mb-6 h-8 w-48" />
      <Skeleton className="mb-4 h-16 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

function WarmAdmin() {
  usePrefetchRoutes(ADMIN_PREFETCH);
  return null;
}

function Protected() {
  const { admin, loading } = useAdmin();
  const { user } = useAuth();
  const location = useLocation();
  if (loading) return <ShellSkeleton />;
  // موظف التوصيل له لوحته الخاصة
  if (isDriverUser(user)) return <Navigate to="/driver" replace />;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <>
      <WarmAdmin />
      <AdminLayout />
    </>
  );
}

function NotFound() {
  return (
    <AdminPage title="الصفحة غير موجودة">
      <EmptyState title="لم نجد هذه الصفحة" description="ربما تغيّر الرابط." action={<ButtonLink to="/admin">العودة للوحة التحكم</ButtonLink>} />
    </AdminPage>
  );
}

const s = (el: JSX.Element) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

/** الصفحة الأولى: لوحة التحكم لمن يملك صلاحيتها، وإلا لوحة التوصيل */
function Home() {
  const { admin } = useAdmin();
  if (!hasPerm(admin, 'dashboard.view')) return <Navigate to="/admin/delivery" replace />;
  return s(<Dashboard />);
}

/** تحميل مسبق لصفحات اللوحة (عند المرور على الروابط، وصفحات القوائم بعد الدخول) */
const ADMIN_PREFETCH: [RegExp, () => Promise<unknown>, boolean][] = [
  [/^\/admin\/bookings\/?$/, P.Bookings, true],
  [/^\/admin\/bookings\/[^/]+\/?$/, P.BookingDetail, false],
  [/^\/admin\/orders\/?$/, P.Orders, true],
  [/^\/admin\/orders\/[^/]+\/?$/, P.OrderDetail, false],
  [/^\/admin\/products\/?$/, P.Products, true],
  [/^\/admin\/products\/new\/?$/, P.ProductEditor, false],
  [/^\/admin\/products\/[^/]+\/?$/, P.ProductEditor, false],
  [/^\/admin\/categories\/?$/, P.Categories, true],
  [/^\/admin\/corporate\/?$/, P.Corporate, true],
  [/^\/admin\/corporate\/[^/]+\/?$/, P.CorporateDetail, false],
  [/^\/admin\/contracts\/?$/, P.Contracts, true],
  [/^\/admin\/contracts\/[^/]+\/?$/, P.ContractDetail, false],
  [/^\/admin\/tenders\/?$/, P.Tenders, true],
  [/^\/admin\/tenders\/[^/]+\/?$/, P.TenderDetail, false],
  [/^\/admin\/delivery\/?$/, P.Delivery, true],
  [/^\/admin\/delivery\/new\/?$/, P.DeliveryOrderNew, false],
  [/^\/admin\/delivery\/orders\/[^/]+\/?$/, P.DeliveryOrderDetail, false],
  [/^\/admin\/users\/?$/, P.Users, true],
  [/^\/admin\/reports\/?$/, P.Reports, true],
  [/^\/admin\/finance\/?$/, P.Finance, true],
  [/^\/admin\/customers\/?$/, P.Customers, true],
  [/^\/admin\/customers\/[^/]+\/?$/, P.CustomerDetail, false],
  [/^\/admin\/technicians\/?$/, P.Technicians, true],
  [/^\/admin\/settings\/?$/, P.Settings, true],
  [/^\/admin\/logs\/?$/, P.Logs, true],
  [/^\/admin\/newsletter\/?$/, P.Newsletter, false],
  [/^\/admin\/vendors\/?$/, P.Vendors, true],
  [/^\/admin\/vendors\/[^/]+\/?$/, P.VendorDetail, false],
  [/^\/admin\/market\/?$/, P.MarketOverview, true],
  [/^\/admin\/insights\/?$/, P.InsightsPerformance, true],
  [/^\/admin\/insights\/recognition\/?$/, P.InsightsRecognition, true],
  [/^\/admin\/insights\/rewards\/?$/, P.InsightsRewards, true],
  [/^\/admin\/insights\/archive\/?$/, P.InsightsArchive, false],
  [/^\/admin\/market\/suppliers\/?$/, P.MarketSuppliers, true],
  [/^\/admin\/market\/suppliers\/[^/]+\/?$/, P.MarketSupplierDetail, false],
  [/^\/admin\/market\/rfqs\/?$/, P.MarketRfqs, true],
  [/^\/admin\/market\/rfqs\/[^/]+\/?$/, P.MarketRfqDetail, false],
  [/^\/admin\/market\/plans\/?$/, P.MarketPlans, true],
  [/^\/admin\/market\/commissions\/?$/, P.MarketCommissions, true],
  [/^\/admin\/market\/ads\/?$/, P.MarketAds, true],
  [/^\/admin\/market\/invoices\/?$/, P.MarketInvoices, true],
  [/^\/admin\/market\/reviews\/?$/, P.MarketReviews, true],
];

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route
          path="login"
          element={
            <Suspense fallback={<ShellSkeleton />}>
              <Login />
            </Suspense>
          }
        />
        <Route element={<Protected />}>
          <Route index element={<Home />} />
          <Route path="bookings" element={s(<Bookings />)} />
          <Route path="bookings/:id" element={s(<BookingDetail />)} />
          <Route path="orders" element={s(<Orders />)} />
          <Route path="orders/:id" element={s(<OrderDetail />)} />
          <Route path="products" element={s(<Products />)} />
          <Route path="products/new" element={s(<ProductEditor />)} />
          <Route path="products/:id" element={s(<ProductEditor />)} />
          <Route path="categories" element={s(<Categories />)} />
          <Route path="corporate" element={s(<Corporate />)} />
          <Route path="corporate/:id" element={s(<CorporateDetail />)} />
          <Route path="contracts" element={s(<Contracts />)} />
          <Route path="contracts/:id" element={s(<ContractDetail />)} />
          <Route path="tenders" element={s(<Tenders />)} />
          <Route path="tenders/:id" element={s(<TenderDetail />)} />
          <Route path="delivery" element={s(<Delivery />)} />
          <Route path="delivery/new" element={s(<DeliveryOrderNew />)} />
          <Route path="delivery/orders/:id" element={s(<DeliveryOrderDetail />)} />
          <Route path="users" element={s(<Users />)} />
          <Route path="reports" element={s(<Reports />)} />
          <Route path="finance" element={s(<Finance />)} />
          <Route path="customers" element={s(<Customers />)} />
          <Route path="customers/:id" element={s(<CustomerDetail />)} />
          <Route path="technicians" element={s(<Technicians />)} />
          <Route path="settings" element={s(<Settings />)} />
          <Route path="logs" element={s(<Logs />)} />
          <Route path="newsletter" element={s(<Newsletter />)} />
          <Route path="vendors" element={s(<Vendors />)} />
          <Route path="vendors/:id" element={s(<VendorDetail />)} />
          <Route path="market" element={s(<MarketOverview />)} />
          <Route path="insights" element={s(<InsightsPerformance />)} />
          <Route path="insights/recognition" element={s(<InsightsRecognition />)} />
          <Route path="insights/rewards" element={s(<InsightsRewards />)} />
          <Route path="insights/archive" element={s(<InsightsArchive />)} />
          <Route path="market/suppliers" element={s(<MarketSuppliers />)} />
          <Route path="market/suppliers/:id" element={s(<MarketSupplierDetail />)} />
          <Route path="market/rfqs" element={s(<MarketRfqs />)} />
          <Route path="market/rfqs/:id" element={s(<MarketRfqDetail />)} />
          <Route path="market/plans" element={s(<MarketPlans />)} />
          <Route path="market/commissions" element={s(<MarketCommissions />)} />
          <Route path="market/ads" element={s(<MarketAds />)} />
          <Route path="market/invoices" element={s(<MarketInvoices />)} />
          <Route path="market/reviews" element={s(<MarketReviews />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
