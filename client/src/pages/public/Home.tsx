import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonA, ButtonLink, Icon } from '../../components/ui';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { useSite } from '../../context/SiteContext';
import { api } from '../../lib/api';
import { displayPhone, formatJOD, waLink } from '../../lib/format';
import type { Paged, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const SERVICES = [
  {
    slug: 'inspection',
    title: 'كشف أعطال بناء',
    text: 'رطوبة، تسريب مياه، تشققات، مشاكل تمديدات. نحدد السبب ونكتب لك ما يلزم إصلاحه.',
  },
  {
    slug: 'painting',
    title: 'أعمال دهان',
    text: 'دهان داخلي وخارجي، تجديد شقق، معالجة جدران قبل الدهان، وديكورات.',
  },
  {
    slug: 'construction',
    title: 'أعمال بناء',
    text: 'بناء جديد، إضافات وملاحق، تعديلات داخلية، وتشطيبات للبيوت والفلل.',
  },
  {
    slug: 'metalwork',
    title: 'أعمال معدنية',
    text: 'أبواب وبوابات، درابزين، مظلات، حمايات شبابيك، وهياكل حديد حسب القياس.',
  },
  {
    slug: 'general',
    title: 'خدمات عامة',
    text: 'أعمال صيانة متفرقة: تركيب، فك ونقل، إصلاحات صغيرة لا تحتاج مشروعًا كاملًا.',
  },
];

export default function Home() {
  useDocumentTitle('');
  const { settings } = useSite();
  const featured = useAsync(() => api.get<Paged<Product>>('/store/products', { featured: true, pageSize: 4 }), []);
  const featuredItems = featured.data?.items ?? [];
  const showFeatured = featured.loading || featuredItems.length > 0;
  const wa = waLink(settings.whatsappNumber, 'مرحبًا، أريد الاستفسار عن خدمة');

  return (
    <>
      {/* ——— الواجهة ——— */}
      <section className="bg-brand-800 text-sand-50 dark:bg-brand-900">
        <div className="container grid gap-10 py-14 md:py-20 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="text-sm font-semibold text-sand-300">فيرجار — مقاولات وصيانة</p>
            <h1 className="mt-3 text-3xl leading-tight text-white sm:text-4xl md:text-5xl md:leading-tight">
              {settings.heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-sand-100/85">{settings.heroSubtitle}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/bookings/inspection" variant="secondary" size="lg" className="sm:min-w-[11rem]">
                احجز كشفًا
              </ButtonLink>
              <ButtonLink
                to="/corporate"
                variant="ghost"
                size="lg"
                className="border border-white/25 text-white hover:bg-white/10"
              >
                خدمات الشركات والمصانع
              </ButtonLink>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sand-100/85">
              <a href={`tel:${settings.phone}`} className="inline-flex min-h-[44px] items-center gap-2 hover:text-white">
                <Icon name="phone" className="h-4 w-4 text-sand-300" />
                <span className="ltr">{settings.phone}</span>
              </a>
              <span className="h-4 w-px bg-white/20" aria-hidden />
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 hover:text-white">
                <Icon name="whatsapp" className="h-4 w-4 text-sand-300" />
                واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
              </a>
            </p>
          </div>

          <aside className="lg:col-span-5" aria-label="رسوم الكشف">
            <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-6">
              <h2 className="text-base font-semibold text-white">رسوم الكشف على الموقع</h2>
              <dl className="mt-4 divide-y divide-white/10">
                <div className="flex items-baseline justify-between py-3">
                  <dt className="text-sand-100/85">داخل عمّان</dt>
                  <dd className="text-2xl font-bold text-white">{formatJOD(settings.inspectionFeeInside)}</dd>
                </div>
                <div className="flex items-baseline justify-between py-3">
                  <dt className="text-sand-100/85">خارج عمّان</dt>
                  <dd className="text-2xl font-bold text-white">{formatJOD(settings.inspectionFeeOutside)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-sm leading-relaxed text-sand-100/70">
                تدفع رسوم الكشف مرة واحدة، وتستلم بعدها عرض سعر مكتوبًا للعمل كاملًا. لا يبدأ أي عمل قبل موافقتك.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* ——— نبذة سريعة ——— */}
      <section className="border-b border-line bg-surface">
        <div className="container py-12 md:py-14">
          <h2 className="sr-only">نبذة سريعة: كيف نعمل</h2>
          <ol className="grid gap-8 md:grid-cols-3 md:gap-10">
            {[
              {
                t: 'كشف على الموقع',
                d: `فني يزورك في الموعد الذي تختاره ويعاين المشكلة. الرسوم ${formatJOD(settings.inspectionFeeInside)} داخل عمّان و${formatJOD(settings.inspectionFeeOutside)} خارجها.`,
              },
              { t: 'عرض سعر مكتوب', d: 'تستلم السعر وتفاصيل العمل والمواد على صفحتك في الموقع وعلى واتساب، قبل أي التزام.' },
              { t: 'تنفيذ بمواعيد', d: 'بعد موافقتك نحدد تاريخ البدء والتسليم، ومسؤول واحد يتابع معك حتى نهاية العمل.' },
            ].map((s, i) => (
              <li key={s.t} className="flex gap-4">
                <span className="ltr shrink-0 pt-0.5 text-sm font-bold text-sand-600 dark:text-sand-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-lg">{s.t}</h3>
                  <p className="mt-1 text-muted">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ——— الخدمات ——— */}
      <section className="section">
        <div className="container">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">الخدمات</p>
              <h2 className="mt-1 text-2xl md:text-3xl">اختر نوع العمل واحجز موعدك</h2>
            </div>
            <Link to="/bookings" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">
              كل أنواع الحجز <Icon name="chevronLeft" className="h-4 w-4" />
            </Link>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => (
              <li key={s.slug}>
                <Link
                  to={`/bookings/${s.slug}`}
                  className="card group flex h-full flex-col p-6 transition-colors hover:border-brand-300 dark:hover:border-brand-500"
                >
                  <span className="ltr text-sm font-bold text-sand-600 dark:text-sand-300">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mt-3 block h-px w-10 bg-sand-300 transition-all group-hover:w-16 dark:bg-sand-600" aria-hidden />
                  <h3 className="mt-4 text-xl">{s.title}</h3>
                  <p className="mt-2 flex-1 text-muted">{s.text}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 dark:text-brand-200">
                    احجز {s.title} <Icon name="chevronLeft" className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— الشركات ——— */}
      <section className="bg-sand-100 dark:bg-subtle">
        <div className="container grid gap-8 py-12 md:grid-cols-12 md:items-center md:py-16">
          <div className="md:col-span-7">
            <p className="eyebrow">للمصانع والشركات</p>
            <h2 className="mt-1 text-2xl md:text-3xl">عقود صيانة سنوية للمصانع والمنشآت</h2>
            <p className="mt-3 max-w-prose text-muted">
              صيانة دورية للمباني والمرافق، أرضيات إيبوكسي، تجهيز المرافق حسب متطلبات GMP وISO، وطلبات عاجلة عند الأعطال.
              زيارات مجدولة وتقارير مكتوبة بعد كل زيارة.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2 text-sm">
              {['GMP', 'ISO', 'أرضيات إيبوكسي', 'كهرباء ومرافق', 'دهانات صناعية', 'طلبات عاجلة'].map((t) => (
                <li key={t} className="rounded-full border border-sand-300 bg-surface px-3 py-1 text-ink dark:border-line">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 md:col-span-5 md:items-end">
            <ButtonLink to="/corporate" size="lg" className="w-full md:w-auto">
              اطلب عقد صيانة
            </ButtonLink>
            <ButtonA href={`tel:${settings.phone}`} variant="outline" size="lg" className="w-full md:w-auto">
              <Icon name="phone" className="h-4 w-4" /> عطل عاجل؟ اتصل مباشرة
            </ButtonA>
          </div>
        </div>
      </section>

      {/* ——— منتجات مختارة ——— */}
      {showFeatured && !featured.error && (
        <section className="section">
          <div className="container">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">المتجر</p>
                <h2 className="mt-1 text-2xl md:text-3xl">منتجات من ورشتنا</h2>
              </div>
              <Link to="/store" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">
                كل المنتجات <Icon name="chevronLeft" className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8">
              {featured.loading ? (
                <ProductGridSkeleton count={4} className={PRODUCT_GRID} />
              ) : (
                <div className={PRODUCT_GRID}>
                  {featuredItems.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ——— التواصل ——— */}
      <section className="border-t border-line bg-surface">
        <div className="container grid gap-10 py-12 md:grid-cols-12 md:py-16">
          <div className="md:col-span-5">
            <p className="eyebrow">تواصل</p>
            <h2 className="mt-1 text-2xl md:text-3xl">عندك سؤال قبل الحجز؟</h2>
            <p className="mt-3 text-muted">أرسل صورة للمشكلة على واتساب ونرد عليك خلال ساعات العمل.</p>
            <ButtonA href={wa} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" className="mt-6 w-full sm:w-auto">
              <Icon name="whatsapp" /> راسلنا على واتساب
            </ButtonA>
          </div>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 md:col-span-7">
            <ContactItem icon="phone" label="الهاتف">
              <a href={`tel:${settings.phone}`} className="ltr hover:text-brand-600 dark:hover:text-brand-200">
                {settings.phone}
              </a>
            </ContactItem>
            <ContactItem icon="mail" label="البريد الإلكتروني">
              <a href={`mailto:${settings.email}`} className="ltr break-all hover:text-brand-600 dark:hover:text-brand-200">
                {settings.email}
              </a>
            </ContactItem>
            <ContactItem icon="pin" label="العنوان">
              {settings.address}
            </ContactItem>
            <ContactItem icon="clock" label="ساعات العمل">
              {settings.workingHoursText}
            </ContactItem>
          </dl>
        </div>
      </section>
    </>
  );
}

function ContactItem({ icon, label, children }: { icon: 'phone' | 'mail' | 'pin' | 'clock'; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon name={icon} className="mt-1 h-5 w-5 shrink-0 text-sand-600 dark:text-sand-300" />
      <div>
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
    </div>
  );
}
