import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, SectionHeading } from '../../components/ui';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton, productImage } from '../../components/store/ProductCard';

import { WorkFigure } from '../../components/work/WorkFigure';
import { useSite } from '../../context/SiteContext';
import { api } from '../../lib/api';
import { BRAND } from '../../lib/brand';
import { cx, displayPhone, formatJOD, waLink } from '../../lib/format';
import type { Paged, Product, SiteSettings } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { SPECIALTIES, WORKS } from '../../lib/works';

type Service = { slug: string; title: string; short: string; text: string; fee?: (s: SiteSettings) => string };

const SERVICES: Service[] = [
  {
    slug: 'inspection',
    title: 'كشف أعطال بناء',
    short: 'كشف أعطال',
    text: 'رطوبة، تسريب مياه، تشققات، مشاكل تمديدات. نحدد السبب ونكتب لك ما يلزم إصلاحه.',
    fee: (s) => `رسوم الكشف ${formatJOD(s.inspectionFeeNormal)} لكل المحافظات`,
  },
  {
    slug: 'painting',
    title: 'أعمال دهان وديكور',
    short: 'دهان وديكور',
    text: 'دهان داخلي وخارجي، تجديد شقق، معالجة جدران قبل الدهان، وديكورات وجدران ثلاثية الأبعاد.',
    fee: (s) => `كشف ${formatJOD(s.paintingFeeInside)} داخل عمّان`,
  },
  {
    slug: 'construction',
    title: 'بناء وتشطيب',
    short: 'بناء وتشطيب',
    text: 'بناء جديد، إضافات وملاحق، تعديلات داخلية، وتشطيب كامل للبيوت والفلل من الهيكل حتى التسليم.',
  },
  {
    slug: 'metalwork',
    title: 'أعمال معدنية',
    short: 'أعمال معدنية',
    text: 'أبواب وبوابات، درابزين، مظلات، حمايات شبابيك، وهياكل حديد حسب القياس أو تصميمك.',
  },
  {
    slug: 'general',
    title: 'صيانة عامة',
    short: 'صيانة عامة',
    text: 'أعمال صيانة متفرقة: تركيب، فك ونقل، وإصلاحات صغيرة لا تحتاج مشروعًا كاملًا.',
  },
];

export default function Home() {
  useDocumentTitle('');
  const { settings } = useSite();
  const featured = useAsync(() => api.get<Paged<Product>>('/store/products', { featured: true, pageSize: 4 }), [], 'home/featured');
  const featuredItems = featured.data?.items ?? [];
  const showFeatured = featured.loading || featuredItems.length > 0;

  return (
    <>
      <Hero />

      {/* ——— للمصانع: الصيانة الصناعية أساس النشاط ——— */}
      <section className="section border-b border-line" aria-labelledby="corp-title">
        <div className="container grid gap-10 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5" data-reveal>
            <p className="eyebrow">للمصانع والشركات</p>
            <h2 id="corp-title" className="mt-4 text-2xl md:text-[2rem]">
              صيانة الماكينات والمرافق الصناعية
            </h2>
            <p className="mt-4 max-w-prose leading-relaxed text-muted">
              نصون الماكينات وخطوط الإنتاج والمرافق بعقود سنوية أو عند العطل، ونورّد المنتجات والتجهيزات الصناعية التي يحتاجها مصنعك. زيارات مجدولة، تقرير مكتوب بعد كل زيارة، وأولوية حسب أثر العطل على الإنتاج.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/corporate/annual"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover"
              >
                اطلب عقد صيانة سنوي
              </Link>
              <Link to="/corporate/urgent" className="inline-flex h-12 items-center rounded-lg border border-line-strong px-5 font-semibold transition-colors hover:border-ink">
                طلب صيانة عاجل
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7" data-reveal-group>
            {(
              [
                ['wrench', 'صيانة الماكينات وخطوط الإنتاج', 'تشخيص الأعطال وإصلاحها، وصيانة وقائية دورية تقلل التوقف.'],
                ['factory', 'منتجات وتجهيزات صناعية', 'طاولات عمل، رفوف تخزين، ملصقات أرضية ومستلزمات للمصانع والمستودعات.'],
                ['gear', 'كهرباء ومرافق', 'صيانة دورية للتمديدات والمرافق والأنظمة المساندة للإنتاج.'],
                ['shield', 'مطابقة GMP وISO', 'تجهيز المرافق والأرضيات الإيبوكسي حسب متطلبات التدقيق.'],
                ['alert', 'استجابة عاجلة', 'فريق يصل بسرعة عند توقف خط إنتاج أو عطل مفاجئ.'],
                ['file', 'تقارير مكتوبة', 'تقرير بعد كل زيارة وسجل كامل لعقدك على صفحتك في الموقع.'],
              ] as const
            ).map(([icon, t, d]) => (
              <li key={t} className="card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={icon} className="h-5 w-5" />
                </span>
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— من السوق ——— */}
      {showFeatured && !featured.error && (
        <section className="section" aria-labelledby="store-title">
          <div className="container">
            <SectionHeading id="store-title" eyebrow="السوق" title="منتجات مختارة من السوق" link={{ to: '/store', label: 'تصفح السوق' }} />
            <div className="mt-10">
              {featured.loading ? (
                <ProductGridSkeleton count={4} className={PRODUCT_GRID} />
              ) : (
                <div className={PRODUCT_GRID} data-reveal-group>
                  {featuredItems.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}

      {/* ——— كيف نعمل: شريط خطوات أفقي على خط قياس ——— */}
      <section className="border-b border-line bg-bg" aria-labelledby="process-title">
        <div className="container py-14 md:py-20">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4" data-reveal>
              <p className="eyebrow">كيف نعمل</p>
              <h2 id="process-title" className="mt-4 text-2xl md:text-[2rem]">
                سعر مكتوب قبل أي التزام
              </h2>
              <p className="mt-3 text-muted">ثلاث خطوات واضحة من أول اتصال حتى التسليم، ومسؤول واحد يتابع معك.</p>
            </div>
            <ol className="relative grid gap-8 sm:grid-cols-3 lg:col-span-8" data-reveal-group>
              <span className="absolute inset-x-0 top-[15px] hidden h-px bg-line sm:block" aria-hidden />
              {[
                {
                  t: 'كشف على الموقع',
                  d: `فني يزورك في الموعد الذي تختاره. الكشف الفني ${formatJOD(settings.inspectionFeeNormal)} لكل المحافظات.`,
                },
                { t: 'عرض سعر مكتوب', d: 'السعر والمواد ومدة التنفيذ على صفحتك في الموقع وعلى واتساب.' },
                { t: 'تنفيذ بمواعيد', d: 'بعد موافقتك نحدد البدء والتسليم، ونلتزم بهما.' },
              ].map((s, i) => (
                <li key={s.t} className="relative">
                  <span
                    className={cx(
                      'num relative grid h-8 w-8 place-items-center rounded-full text-sm font-bold ring-4 ring-bg',
                      i === 0 ? 'bg-primary text-primary-fg' : 'bg-ink text-bg',
                    )}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg">{s.t}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ——— الخدمات: قائمة تحريرية بدل بطاقات، والرسوم في العمود الثابت ——— */}
      <section className="section" aria-labelledby="services-title">
        <div className="container grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-32" data-reveal>
              <SectionHeading id="services-title" eyebrow="خدمات المباني" title="بناء وصيانة ودهان للبيوت والمنشآت" />
              <p className="mt-3 text-muted">تختار اليوم والساعة بنفسك، ويصلنا الحجز مباشرة.</p>
              <dl className="mt-8 divide-y divide-line border-y border-line text-[15px]">
                <p className="py-3 text-sm font-semibold">رسوم الكشف الفني — ثابتة لكل المحافظات</p>
                {(
                  [
                    ['عادي', settings.inspectionFeeNormal],
                    ['عاجل', settings.inspectionFeeUrgent],
                    ['طارئ', settings.inspectionFeeEmergency],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between py-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-display text-lg font-semibold">{formatJOD(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <ul className="border-t border-line lg:col-span-8" data-reveal-group>
            {SERVICES.map((s, i) => (
              <li key={s.slug} className="border-b border-line">
                <Link to={`/bookings/${s.slug}`} className="group grid grid-cols-[2.5rem_1fr_auto] items-start gap-4 py-6 transition-colors md:grid-cols-[3.5rem_1fr_auto] md:py-8">
                  <span className="num pt-1 text-sm font-semibold text-muted transition-colors group-hover:text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="block font-display text-xl font-semibold md:text-2xl">{s.title}</span>
                    <span className="mt-2 block max-w-xl text-[15px] leading-relaxed text-muted">{s.text}</span>
                    {s.fee && <span className="mt-3 inline-block rounded-md bg-subtle px-2 py-1 text-xs font-medium text-ink">{s.fee(settings)}</span>}
                  </span>
                  <span className="mt-1 grid h-11 w-11 place-items-center rounded-full border border-line-strong transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-fg">
                    <Icon name="arrowLeft" className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— أعمالنا: شبكة غير متماثلة ——— */}
      <section className="section bg-subtle" aria-labelledby="work-title">
        <div className="container">
          <SectionHeading id="work-title" eyebrow="أعمالنا" title="من مشاريعنا المنفّذة" link={{ to: '/work', label: 'كل الأعمال' }} />
          <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-12" data-reveal-group>
            <WorkFigure work={WORKS[2]} ratio="aspect-[4/3] lg:aspect-[5/4]" className="md:col-span-7" showText={false} />
            <div className="grid content-start gap-10 md:col-span-5">
              <WorkFigure work={WORKS[1]} ratio="aspect-[16/10]" showText={false} />
              <WorkFigure work={WORKS[3]} ratio="aspect-[16/10]" showText={false} />
            </div>
          </div>
          <ul className="mt-12 flex flex-wrap gap-2" aria-label="تخصصاتنا" data-reveal>
            {SPECIALTIES.map((t) => (
              <li key={t} className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm text-ink">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

            </div>
          </div>
        </section>
      )}
    </>
  );
}

type Need = { key: string; short: string; icon: 'gear' | 'wrench' | 'factory' | 'home'; text: string; cta: string; to: string };

/** ماذا يحتاج الزائر؟ الجانب الصناعي أولًا لأنه أساس النشاط */
const NEEDS: Need[] = [
  {
    key: 'products',
    short: 'منتجات صناعية',
    icon: 'factory',
    text: 'تجهيزات ومستلزمات للمصانع والمستودعات والورش: طاولات عمل، رفوف تخزين، ملصقات أرضية إرشادية ومنتجات صناعية أخرى، مع التوصيل.',
    cta: 'تصفح المنتجات الصناعية',
    to: '/store?category=industrial',
  },
  {
    key: 'machines',
    short: 'صيانة ماكينات',
    icon: 'wrench',
    text: 'صيانة وإصلاح الماكينات وخطوط الإنتاج عند العطل، بفنيين يصلون بسرعة وأولوية حسب أثر العطل على الإنتاج، وتقرير مكتوب بعد كل زيارة.',
    cta: 'اطلب صيانة عاجلة',
    to: '/corporate/urgent',
  },
  {
    key: 'contracts',
    short: 'عقود صيانة للمصانع',
    icon: 'gear',
    text: 'زيارات دورية مجدولة للماكينات والمرافق والكهرباء، وتجهيز المنشأة لمتطلبات GMP وISO، مع أولوية الاستجابة عند الأعطال.',
    cta: 'اطلب عقد صيانة سنوي',
    to: '/corporate/annual',
  },
  {
    key: 'buildings',
    short: 'بناء وصيانة مباني',
    icon: 'home',
    text: 'كشف أعطال البناء، دهان وديكور، بناء وتشطيب، أعمال معدنية وصيانة عامة للبيوت والمنشآت.',
    cta: 'احجز موعدًا',
    to: '/bookings',
  },
];

/**
 * الواجهة: فحمية كمربع الشعار. على اليمين سؤال "ماذا تحتاج؟" يبدأ بالجانب الصناعي،
 * وعلى اليسار لوحة صناعية: منتجات من السوق الصناعي وما نقدمه للمصانع.
 */
function Hero() {
  const { settings } = useSite();
  const [picked, setPicked] = useState(0);
  const need = NEEDS[picked];
  const industrial = useAsync(() => api.get<Paged<Product>>('/store/products', { category: 'industrial', pageSize: 3 }), [], 'home/industrial');
  const items = industrial.data?.items ?? [];

  return (
    <section className="relative overflow-hidden bg-inverse text-inverse-fg">
      {/* شبكة رسم هندسي خافتة (ورقة المهندس) */}
      <svg className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-1/2 text-inverse-fg opacity-[0.06] lg:block" aria-hidden>
        <defs>
          <pattern id="hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <div className="container relative grid gap-12 py-12 md:py-16 lg:grid-cols-12 lg:gap-10 lg:py-20">
        <div className="min-w-0 lg:col-span-6 xl:col-span-6">
          <p className="eyebrow anim-rise !text-inverse-fg/60">{BRAND.ar} — حلول صناعية ومقاولات</p>
          <h1 className="anim-rise mt-5 text-[2rem] leading-[1.3] text-inverse-fg [animation-delay:60ms] sm:text-[2.5rem] xl:text-[3rem]">
            {settings.heroTitle}
          </h1>
          <p className="anim-rise mt-5 max-w-lg text-[17px] leading-relaxed text-inverse-fg/65 [animation-delay:120ms]">{settings.heroSubtitle}</p>

          {/* اختيار سريع */}
          <div className="anim-rise mt-9 rounded-xl border border-inverse-fg/10 bg-inverse-2 p-4 [animation-delay:180ms] sm:p-5">
            <p id="need-label" className="text-sm font-semibold text-inverse-fg">
              ماذا تحتاج؟
            </p>
            <div role="radiogroup" aria-labelledby="need-label" className="scroll-x -mx-4 mt-3 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {NEEDS.map((n, i) => (
                <button
                  key={n.key}
                  type="button"
                  role="radio"
                  aria-checked={picked === i}
                  onClick={() => setPicked(i)}
                  className={cx(
                    'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-200',
                    picked === i ? 'border-primary bg-primary text-primary-fg' : 'border-inverse-fg/15 text-inverse-fg/80 hover:border-inverse-fg/40',
                  )}
                >
                  <Icon name={n.icon} className="h-4 w-4" />
                  {n.short}
                </button>
              ))}
            </div>
            <div key={need.key} className="anim-fade mt-4 flex flex-col gap-4 border-t border-inverse-fg/10 pt-4 sm:flex-row sm:items-end sm:justify-between ltr:sm:flex-col ltr:sm:items-start">
              <p className="min-w-0 text-[15px] leading-relaxed text-inverse-fg/70">{need.text}</p>
              <Link
                to={need.to}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover active:translate-y-px"
              >
                {need.cta} <Icon name="arrowLeft" className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <p className="anim-rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-inverse-fg/60 [animation-delay:240ms]">
            <a href={`tel:${settings.phone}`} className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-inverse-fg">
              <Icon name="phone" className="h-4 w-4 text-primary" />
              <span className="ltr">{settings.phone}</span>
            </a>
            <a
              href={waLink(settings.whatsappNumber, 'مرحبًا، أريد الاستفسار عن منتجاتكم وخدماتكم')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 transition-colors hover:text-inverse-fg"
            >
              <Icon name="whatsapp" className="h-4 w-4 text-primary" />
              واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
            </a>
          </p>
        </div>

        {/* اللوحة الصناعية */}
        <div className="anim-rise relative min-w-0 [animation-delay:120ms] lg:col-span-6 xl:ps-6">
          <div className="relative overflow-hidden rounded-2xl border border-inverse-fg/10 bg-inverse-2 p-5 sm:p-7">
            {/* ترس زخرفي */}
            <svg viewBox="0 0 24 24" className="hero-gear pointer-events-none absolute -end-10 -top-10 h-44 w-44 text-primary/15" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <p className="relative text-xs font-semibold uppercase tracking-wide text-primary">للمصانع والمنشآت الصناعية</p>
            <ul className="relative mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
              {(
                [
                  ['factory', 'منتجات صناعية', 'تجهيزات ومستلزمات مع التوصيل'],
                  ['wrench', 'صيانة ماكينات', 'إصلاح الأعطال وخطوط الإنتاج'],
                  ['gear', 'عقود سنوية', 'زيارات دورية وتقارير مكتوبة'],
                ] as const
              ).map(([icon, t, d]) => (
                <li key={t} className="flex items-center gap-3 rounded-xl border border-inverse-fg/10 bg-inverse p-3 sm:block sm:p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Icon name={icon} className="h-5 w-5" />
                  </span>
                  <span className="block min-w-0 sm:mt-3">
                    <span className="block font-semibold">{t}</span>
                    <span className="mt-0.5 block text-sm leading-snug text-inverse-fg/60 sm:mt-1">{d}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="relative mt-6 border-t border-inverse-fg/10 pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">من السوق الصناعي</p>
                <Link to="/store?category=industrial" className="inline-flex items-center gap-1 text-sm text-inverse-fg/60 transition-colors hover:text-inverse-fg">
                  كل المنتجات <Icon name="arrowLeft" className="h-4 w-4" />
                </Link>
              </div>
              {industrial.loading ? (
                <div className="mt-3 space-y-2" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-inverse" />
                  ))}
                </div>
              ) : items.length ? (
                <ul className="mt-3 space-y-2">
                  {items.map((p) => {
                    const img = productImage(p);
                    return (
                      <li key={p.id}>
                        <Link to={`/store/${p.slug}`} className="flex items-center gap-3 rounded-xl bg-inverse p-2.5 transition-colors hover:bg-inverse/60">
                          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
                            {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon name="factory" className="h-5 w-5 text-muted" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.name}</span>
                          <span className="shrink-0 font-display font-semibold text-primary">{formatJOD(p.finalPrice)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Link to="/store" className="mt-3 flex items-center justify-between rounded-xl bg-inverse p-4 text-sm text-inverse-fg/70 hover:text-inverse-fg">
                  تصفح السوق <Icon name="arrowLeft" className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
          {/* مسطرة القياس */}
          <svg className="absolute -bottom-8 end-0 hidden w-[58%] text-inverse-fg/30 sm:block" viewBox="0 0 300 16" fill="none" aria-hidden>
            <line x1="0" y1="8" x2="300" y2="8" stroke="currentColor" />
            {Array.from({ length: 31 }).map((_, i) => (
              <line key={i} x1={i * 10} x2={i * 10} y1={i % 5 === 0 ? 1 : 5} y2="8" stroke="currentColor" />
            ))}
            <rect x="0" y="6.5" width="48" height="3" rx="1.5" className="fill-primary" />
          </svg>
        </div>
      </div>
      <div className="h-10 lg:h-12" aria-hidden />
    </section>
  );
}
