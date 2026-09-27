import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { AdminPage } from '../../components/admin/ui';
import { ButtonLink, EmptyState, Skeleton } from '../../components/ui';
import { AdminAuthProvider, useAdmin } from '../../context/AdminAuth';

const Login = lazy(() => import('./Login'));
const Dashboard = lazy(() => import('./Dashboard'));
const Bookings = lazy(() => import('./Bookings'));
const BookingDetail = lazy(() => import('./BookingDetail'));
const Orders = lazy(() => import('./Orders'));
const OrderDetail = lazy(() => import('./OrderDetail'));
const Products = lazy(() => import('./Products'));
const ProductEditor = lazy(() => import('./ProductEditor'));
const Categories = lazy(() => import('./Categories'));
const Corporate = lazy(() => import('./Corporate'));
const CorporateDetail = lazy(() => import('./CorporateDetail'));
const Contracts = lazy(() => import('./Contracts'));
const Finance = lazy(() => import('./Finance'));
const Customers = lazy(() => import('./Customers'));
const CustomerDetail = lazy(() => import('./CustomerDetail'));
const Technicians = lazy(() => import('./Technicians'));
const Settings = lazy(() => import('./Settings'));
const Logs = lazy(() => import('./Logs'));
const Newsletter = lazy(() => import('./Newsletter'));
const Vendors = lazy(() => import('./Vendors'));
const VendorDetail = lazy(() => import('./VendorDetail'));

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

function Protected() {
  const { admin, loading } = useAdmin();
  const location = useLocation();
  if (loading) return <ShellSkeleton />;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  return <AdminLayout />;
}

function NotFound() {
  return (
    <AdminPage title="الصفحة غير موجودة">
      <EmptyState title="لم نجد هذه الصفحة" description="ربما تغيّر الرابط." action={<ButtonLink to="/admin">العودة للوحة التحكم</ButtonLink>} />
    </AdminPage>
  );
}

const s = (el: JSX.Element) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

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
          <Route index element={s(<Dashboard />)} />
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
          <Route path="finance" element={s(<Finance />)} />
          <Route path="customers" element={s(<Customers />)} />
          <Route path="customers/:id" element={s(<CustomerDetail />)} />
          <Route path="technicians" element={s(<Technicians />)} />
          <Route path="settings" element={s(<Settings />)} />
          <Route path="logs" element={s(<Logs />)} />
          <Route path="newsletter" element={s(<Newsletter />)} />
          <Route path="vendors" element={s(<Vendors />)} />
          <Route path="vendors/:id" element={s(<VendorDetail />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
