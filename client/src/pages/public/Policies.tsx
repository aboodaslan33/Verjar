import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PolicyList } from '../../components/PolicyList';
import { Icon } from '../../components/ui';
import { useSite } from '../../context/SiteContext';
import { useDocumentTitle } from '../../lib/useAsync';

/** صفحة السياسات: سياسة الحجز وسياسة الطلب والتوصيل (نصوص تعدّلها الإدارة من الإعدادات) */
export default function Policies() {
  useDocumentTitle('السياسات');
  const { settings } = useSite();
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [hash, settings.bookingPolicy]);

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container py-8 md:py-12">
          <p className="eyebrow">السياسات</p>
          <h1 className="mt-3 text-[1.75rem] md:text-[2.25rem]">سياسة الحجز والطلب</h1>
          <p className="mt-2 max-w-2xl text-muted">كل ما تحتاج معرفته قبل الحجز أو الطلب، بوضوح ومن غير مفاجآت.</p>
          <nav className="mt-5 flex flex-wrap gap-2 text-sm" aria-label="أقسام الصفحة">
            <a href="#booking" className="rounded-full border border-line-strong bg-surface px-4 py-1.5 hover:border-ink">سياسة الحجز</a>
            <a href="#store" className="rounded-full border border-line-strong bg-surface px-4 py-1.5 hover:border-ink">سياسة الطلب والتوصيل</a>
          </nav>
        </div>
      </header>
      <div className="container py-10 md:py-14">
        <div className="grid max-w-3xl gap-10">
        <section id="booking" className="scroll-mt-28" aria-labelledby="booking-title">
          <h2 id="booking-title" className="flex items-center gap-2 text-xl md:text-2xl">
            <Icon name="calendar" className="h-6 w-6 text-primary" /> سياسة الحجز
          </h2>
          <PolicyList text={settings.bookingPolicy} className="mt-5" />
          <Link to="/bookings" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline dark:text-brand-200">
            احجز موعدًا <Icon name="arrowLeft" className="h-4 w-4" />
          </Link>
        </section>
        <section id="store" className="scroll-mt-28 border-t border-line pt-10" aria-labelledby="store-title">
          <h2 id="store-title" className="flex items-center gap-2 text-xl md:text-2xl">
            <Icon name="truck" className="h-6 w-6 text-primary" /> سياسة الطلب والتوصيل
          </h2>
          <PolicyList text={settings.storePolicy} className="mt-5" />
          <Link to="/store" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline dark:text-brand-200">
            تصفح السوق <Icon name="arrowLeft" className="h-4 w-4" />
          </Link>
        </section>
        <p className="rounded-xl bg-subtle p-4 text-sm text-muted">
          عندك سؤال عن أي بند؟ <Link to="/contact" className="font-semibold text-ink underline underline-offset-4">تواصل معنا</Link> وسنوضحه لك.
        </p>
        </div>
      </div>
    </>
  );
}
