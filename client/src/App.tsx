import { lazy, Suspense, useCallback, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireCustomer } from './components/auth/RequireCustomer';
import { PublicLayout } from './components/layout/PublicLayout';
import { Splash, shouldShowSplash } from './components/layout/Splash';
import { PageLoader } from './components/ui';
import Home from './pages/public/Home';

// الصفحات العامة — تحميل عند الطلب
const Bookings = lazy(() => import('./pages/public/Bookings'));
const BookingForm = lazy(() => import('./pages/public/BookingForm'));
const Corporate = lazy(() => import('./pages/public/Corporate'));
const CorporateForm = lazy(() => import('./pages/public/CorporateForm'));
const Store = lazy(() => import('./pages/public/Store'));
const ProductPage = lazy(() => import('./pages/public/ProductPage'));
const Cart = lazy(() => import('./pages/public/Cart'));
const Checkout = lazy(() => import('./pages/public/Checkout'));
const About = lazy(() => import('./pages/public/About'));
const Contact = lazy(() => import('./pages/public/Contact'));
const NotFound = lazy(() => import('./pages/public/NotFound'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Account = lazy(() => import('./pages/account/Account'));

// لوحة الأدمن — حزمة منفصلة لا تُحمّل للزوار
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

export default function App() {
  const { pathname } = useLocation();
  const [splash, setSplash] = useState(() => shouldShowSplash(pathname));
  const endSplash = useCallback(() => setSplash(false), []);
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
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          {/* التصفح مفتوح للجميع */}
          <Route path="bookings" element={<Bookings />} />
          <Route path="corporate" element={<Corporate />} />
          <Route path="store" element={<Store />} />
          <Route path="store/:slug" element={<ProductPage />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
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
