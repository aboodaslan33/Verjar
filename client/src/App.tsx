import { lazy, Suspense, useCallback, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireCustomer } from './components/auth/RequireCustomer';
import { PublicLayout } from './components/layout/PublicLayout';
import { Splash, shouldShowSplash } from './components/layout/Splash';
import { PageLoader } from './components/ui';
import { usePrefetchRoutes } from './lib/prefetch';
import Home from './pages/public/Home';

// كل الصفحات تُحمَّل عند الطلب؛ نفس الدوال تُستخدم للتحميل المسبق (lib/prefetch)
const pages = {
  Bookings: () => import('./pages/public/Bookings'),
  BookingForm: () => import('./pages/public/BookingForm'),
  Corporate: () => import('./pages/public/Corporate'),
  CorporateForm: () => import('./pages/public/CorporateForm'),
  Store: () => import('./pages/public/Store'),
  ProductPage: () => import('./pages/public/ProductPage'),
  Cart: () => import('./pages/public/Cart'),
  Checkout: () => import('./pages/public/Checkout'),
  About: () => import('./pages/public/About'),
  Work: () => import('./pages/public/Work'),
  Contact: () => import('./pages/public/Contact'),
  NotFound: () => import('./pages/public/NotFound'),
  Login: () => import('./pages/auth/Login'),
  Register: () => import('./pages/auth/Register'),
  Unsubscribe: () => import('./pages/public/Unsubscribe'),
  Track: () => import('./pages/public/Track'),
  Policies: () => import('./pages/public/Policies'),
  ForgotPassword: () => import('./pages/auth/ForgotPassword'),
  ResetPassword: () => import('./pages/auth/ResetPassword'),
  Account: () => import('./pages/account/Account'),
  VendorStore: () => import('./pages/public/VendorStore'),
  VendorApp: () => import('./pages/vendor/VendorApp'),
  AdminApp: () => import('./pages/admin/AdminApp'),
  DriverApp: () => import('./pages/driver/DriverApp'),
};

// الصفحات العامة — تحميل عند الطلب
const Bookings = lazy(pages.Bookings);
const BookingForm = lazy(pages.BookingForm);
const Corporate = lazy(pages.Corporate);
const CorporateForm = lazy(pages.CorporateForm);
const Store = lazy(pages.Store);
const ProductPage = lazy(pages.ProductPage);
const Cart = lazy(pages.Cart);
const Checkout = lazy(pages.Checkout);
const About = lazy(pages.About);
const Work = lazy(pages.Work);
const Contact = lazy(pages.Contact);
const NotFound = lazy(pages.NotFound);
const Login = lazy(pages.Login);
const Register = lazy(pages.Register);
const Unsubscribe = lazy(pages.Unsubscribe);
const Track = lazy(pages.Track);
const Policies = lazy(pages.Policies);
const ForgotPassword = lazy(pages.ForgotPassword);
const ResetPassword = lazy(pages.ResetPassword);
const Account = lazy(pages.Account);

const VendorStore = lazy(pages.VendorStore);
// لوحة المورد — حزمة منفصلة
const VendorApp = lazy(pages.VendorApp);

// لوحة الأدمن — حزمة منفصلة لا تُحمّل للزوار
const AdminApp = lazy(pages.AdminApp);
// لوحة موظف التوصيل — حزمة منفصلة
const DriverApp = lazy(pages.DriverApp);

/** مسار ← صفحته: يُحمَّل كود الصفحة عند مرور المؤشر أو لمس الرابط، والصفحات الأساسية بعد أول تحميل */
const ROUTE_PREFETCH: [RegExp, () => Promise<unknown>, boolean][] = [
  [/^\/store\/vendor\//, pages.VendorStore, false],
  [/^\/store\/[^/]+$/, pages.ProductPage, true],
  [/^\/store\/?$/, pages.Store, true],
  [/^\/bookings\/[^/]+$/, pages.BookingForm, true],
  [/^\/bookings\/?$/, pages.Bookings, true],
  [/^\/corporate\/[^/]+$/, pages.CorporateForm, false],
  [/^\/corporate\/?$/, pages.Corporate, true],
  [/^\/cart/, pages.Cart, true],
  [/^\/checkout/, pages.Checkout, false],
  [/^\/about/, pages.About, true],
  [/^\/work/, pages.Work, true],
  [/^\/contact/, pages.Contact, true],
  [/^\/track/, pages.Track, false],
  [/^\/policies/, pages.Policies, false],
  [/^\/login/, pages.Login, true],
  [/^\/register/, pages.Register, false],
  [/^\/account/, pages.Account, true],
  [/^\/vendor/, pages.VendorApp, false],
  [/^\/admin/, pages.AdminApp, false],
  [/^\/driver/, pages.DriverApp, false],
];

export default function App() {
  const { pathname } = useLocation();
  const [splash, setSplash] = useState(() => shouldShowSplash(pathname));
  const endSplash = useCallback(() => setSplash(false), []);
  usePrefetchRoutes(ROUTE_PREFETCH);
  return (
    <>
      {splash && <Splash onDone={endSplash} />}
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route
          path="/driver/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <DriverApp />
            </Suspense>
          }
        />
        <Route
          path="/vendor/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <VendorApp />
            </Suspense>
          }
        />
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          {/* التصفح مفتوح للجميع */}
          <Route path="bookings" element={<Bookings />} />
          <Route path="corporate" element={<Corporate />} />
          <Route path="store" element={<Store />} />
          <Route path="store/vendor/:slug" element={<VendorStore />} />
          <Route path="store/:slug" element={<ProductPage />} />
          <Route path="work" element={<Work />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="unsubscribe" element={<Unsubscribe />} />
          <Route path="track" element={<Track />} />
          <Route path="policies" element={<Policies />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="account/login" element={<Navigate to="/login" replace />} />
          {/* الحجز والطلب والحساب للعملاء المسجّلين فقط */}
          <Route element={<RequireCustomer />}>
            <Route path="bookings/:type" element={<BookingForm />} />
            <Route path="corporate/:type" element={<CorporateForm />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
          </Route>
          {/* صفحة الحساب لها حماية خاصة: الأدمن يُحوَّل للوحة التحكم */}
          <Route path="account" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
