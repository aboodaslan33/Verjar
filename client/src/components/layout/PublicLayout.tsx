import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { useReveal } from '../../lib/useReveal';
import { Icon, PageLoader } from '../ui';
import { SiteFooter } from './SiteFooter';
import { MobileTabBar, SiteHeader } from './SiteHeader';

export function PublicLayout() {
  const { pathname } = useLocation();
  const { settings } = useSite();
  const [main, setMain] = useState<HTMLElement | null>(null);
  useReveal(main, pathname);
  useScrollRestoration();
  // زر واتساب العائم لا يظهر في صفحات فيها شريط إجراءات سفلي (النماذج والسلة والمنتج)
  const showFab = !/^\/(bookings\/.+|corporate\/.+|store|cart|checkout)/.test(pathname);

  return (
    <div className="flex min-h-screen flex-col pb-[var(--tabbar-h)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        تخطَّ إلى المحتوى
      </a>
      <SiteHeader />
      <main id="main" ref={setMain} className="flex-1">
        {/* Suspense خارج المفتاح: عند الانتقال تبقى الصفحة الحالية ظاهرة حتى تجهز التالية (بدون وميض تحميل) */}
        <Suspense fallback={<PageLoader />}>
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <SiteFooter />
      <MobileTabBar />
      {/* زر واتساب ثابت للجوال — فوق الشريط السفلي */}
      {showFab && (
        <a
          href={`https://wa.me/${settings.whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          className="fixed start-4 z-30 grid h-12 w-12 place-items-center rounded-full bg-whatsapp text-white shadow-lift transition-transform active:scale-95 lg:hidden"
          style={{ bottom: 'calc(var(--tabbar-h) + 0.875rem)' }}
        >
          <Icon name="whatsapp" className="h-6 w-6" />
        </a>
      )}
    </div>
  );
}

const scrollPositions = new Map<string, number>();

/**
 * التمرير عند التنقل: صفحة جديدة تبدأ من الأعلى، والرجوع (زر الرجوع) يعيدك لنفس مكانك في الصفحة السابقة.
 * الروابط التي فيها # تنزل للقسم المطلوب (تتولاها الصفحة نفسها).
 */
function useScrollRestoration() {
  const location = useLocation();
  const nav = useNavigationType();
  const current = useRef(location.key);
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // يُحفظ الموضع باسم الصفحة الحالية دائمًا (المفتاح يتحدث قبل أي تمرير للصفحة الجديدة)
    const save = () => scrollPositions.set(current.current, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);
  useLayoutEffect(() => {
    current.current = location.key;
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    if (location.hash) return;
    const y = nav === 'POP' ? scrollPositions.get(location.key) : undefined;
    if (y == null) {
      // تغيير الفلاتر أو الصفحة داخل نفس الصفحة لا يقفز للأعلى
      if (samePage) return;
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    // المحتوى قد يحتاج لحظات ليأخذ ارتفاعه (صور، بيانات): نعيد المحاولة حتى نصل للموضع أو تمر ثانية
    let frame = 0;
    const started = performance.now();
    const attempt = () => {
      window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
      if (Math.abs(window.scrollY - y) > 2 && performance.now() - started < 1000) frame = requestAnimationFrame(attempt);
    };
    attempt();
    // لمسة من المستخدم توقف الاستعادة
    const stop = () => cancelAnimationFrame(frame);
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
  }, [location.key, location.pathname, location.hash, nav]);
}
