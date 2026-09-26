import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { useReveal } from '../../lib/useReveal';
import { Icon, PageLoader } from '../ui';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function PublicLayout() {
  const { pathname } = useLocation();
  const { settings } = useSite();
  const [main, setMain] = useState<HTMLElement | null>(null);
  useReveal(main, pathname);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        تخطَّ إلى المحتوى
      </a>
      <SiteHeader />
      <main id="main" ref={setMain} className="flex-1">
        <div key={pathname} className="page-enter">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
      {/* زر واتساب ثابت للجوال */}
      <a
        href={`https://wa.me/${settings.whatsappNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصل عبر واتساب"
        className="fixed bottom-4 start-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#1f7a4d] text-white shadow-lift transition-transform hover:scale-105 md:hidden"
      >
        <Icon name="whatsapp" className="h-7 w-7" />
      </a>
    </div>
  );
}
