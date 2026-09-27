import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonA, ButtonLink, Icon } from '../../components/ui';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { useSite } from '../../context/SiteContext';
import { api } from '../../lib/api';
import { displayPhone, formatJOD, waLink } from '../../lib/format';
import type { Paged, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { BRAND } from '../../lib/brand';
import { SPECIALTIES, WORKS } from '../../lib/works';
import { WorkFigure } from '../../components/work/WorkFigure';

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
  const [heroWork, ...moreWorks] = WORKS;

  return (
    <>
      {/* ——— الواجهة ——— */}
      <section className="bg-bg">
        <div className="container grid gap-12 py-12 md:py-16 lg:grid-cols-12 lg:items-center lg:gap-16 lg:py-20">
          <div className="lg:col-span-6" data-reveal-group>
            <p className="eyebrow">{BRAND.ar} — تصميم ومقاولات وصيانة</p>
            <h1 className="mt-5 text-[2rem] leading-[1.25] sm:text-4xl md:text-5xl md:leading-[1.2]">{settings.heroTitle}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{settings.heroSubtitle}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/bookings/inspection" size="lg" className="sm:min-w-[11rem]">
                احجز كشفًا
              </ButtonLink>
              <ButtonLink to="/work" variant="outline" size="lg">
                شاهد أعمالنا
              </ButtonLink>
            </div>
            <p className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted">
              <a href={`tel:${settings.phone}`} className="inline-flex min-h-[44px] items-center gap-2 hover:text-ink">
                <Icon name="phone" className="h-4 w-4 text-accent" />
                <span className="ltr">{settings.phone}</span>
              </a>
              <span className="h-4 w-px bg-line" aria-hidden />
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 hover:text-ink">
                <Icon name="whatsapp" className="h-4 w-4 text-accent" />
                واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
              </a>
            </p>
          </div>

          <div className="lg:col-span-6" data-reveal>
            <div className="relative">
              <img
                src={heroWork.src}
                width={heroWork.width}
                height={heroWork.height}
                alt={heroWork.title}
                loading="eager"
                decoding="async"
                className="aspect-[5/4] w-full rounded-2xl bg-subtle object-cover sm:aspect-[4/3]"
              />
              <span className="absolute -bottom-3 start-8 h-1.5 w-24 rounded-full bg-primary" aria-hidden />
            </div>
            <p className="mt-6 flex items-baseline justify-between gap-4 text-sm text-muted">
              <span>{heroWork.title}</span>
              <Link to="/work" className="link shrink-0">
                كل الأعمال
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ——— رسوم الكشف ——— */}
      <section className="border-y border-line bg-subtle" aria-labelledby="fees-title">
        <div className="container grid gap-6 py-8 md:grid-cols-12 md:items-center md:py-10" data-reveal-group>
          <div className="md:col-span-4">
            <h2 id="fees-title" className="text-lg">رسوم الكشف الفني</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">ثابتة لكل المحافظات، وتستلم بعدها عرض سعر مكتوبًا. لا يبدأ أي عمل قبل موافقتك.</p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-x-reverse divide-line rounded-xl border border-line bg-surface md:col-span-8">
            {(
              [
                ['عادي', settings.inspectionFeeNormal],
                ['عاجل', settings.inspectionFeeUrgent],
                ['طارئ', settings.inspectionFeeEmergency],
              ] as const
            ).map(([label, fee]) => (
              <div key={label} className="px-3 py-4 text-center sm:px-6 sm:py-5">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-1 text-xl font-bold text-ink sm:text-2xl">{formatJOD(fee)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ——— الخدمات ——— */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="الخدمات" title="اختر نوع العمل واحجز موعدك" link={{ to: '/bookings', label: 'كل أنواع الحجز' }} />
          <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3" data-reveal-group>
            {SERVICES.map((s, i) => (
              <li key={s.slug} className="bg-bg">
                <Link to={`/bookings/${s.slug}`} className="group flex h-full flex-col p-6 transition-colors hover:bg-subtle md:p-8">
                  <span className="ltr text-sm font-semibold text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-4 text-xl">{s.title}</h3>
                  <p className="mt-2 flex-1 text-muted">{s.text}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                    احجز الآن
                    <Icon name="chevronLeft" className="h-4 w-4 transition-transform group-hover:-translate-x-1 motion-reduce:transition-none" />
                  </span>
                </Link>
              </li>
            ))}
            <li className="bg-inverse text-inverse-fg">
              <Link to="/corporate" className="group flex h-full flex-col p-6 md:p-8">
                <span className="text-sm font-semibold text-primary">للمصانع والشركات</span>
                <h3 className="mt-4 text-xl text-inverse-fg">عقود صيانة سنوية</h3>
                <p className="mt-2 flex-1 text-inverse-fg/70">زيارات مجدولة وتقارير مكتوبة وطلبات عاجلة عند الأعطال.</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  خدمات الشركات
                  <Icon name="chevronLeft" className="h-4 w-4 transition-transform group-hover:-translate-x-1 motion-reduce:transition-none" />
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* ——— أعمالنا ——— */}
      <section className="section border-t border-line bg-subtle" aria-labelledby="work-title">
        <div className="container">
          <SectionHead eyebrow="أعمالنا" title="من مشاريعنا المنفّذة" id="work-title" link={{ to: '/work', label: 'كل الأعمال' }} />
          <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-3" data-reveal-group>
            {moreWorks.slice(0, 3).map((w) => (
              <WorkFigure key={w.src} work={w} showText={false} />
            ))}
          </div>
          <ul className="mt-12 flex flex-wrap gap-2" aria-label="تخصصاتنا" data-reveal>
            {SPECIALTIES.map((t) => (
              <li key={t} className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— كيف نعمل ——— */}
      <section className="section">
        <div className="container">
          <SectionHead eyebrow="كيف نعمل" title="ثلاث خطوات واضحة قبل أي التزام" />
          <ol className="mt-10 grid gap-10 md:grid-cols-3" data-reveal-group>
            {[
              {
                t: 'كشف على الموقع',
                d: `فني يزورك في الموعد الذي تختاره ويعاين المشكلة. رسوم الكشف الفني ${formatJOD(settings.inspectionFeeNormal)} في كل المحافظات، والكشف على الدهان ${formatJOD(settings.paintingFeeInside)} داخل عمّان.`,
              },
              { t: 'عرض سعر مكتوب', d: 'تستلم السعر وتفاصيل العمل والمواد على صفحتك في الموقع وعلى واتساب، قبل أي التزام.' },
              { t: 'تنفيذ بمواعيد', d: 'بعد موافقتك نحدد تاريخ البدء والتسليم، ومسؤول واحد يتابع معك حتى نهاية العمل.' },
            ].map((s, i) => (
              <li key={s.t} className="border-t-2 border-line pt-6 first:border-primary">
                <span className="ltr text-sm font-semibold text-muted">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 text-lg">{s.t}</h3>
                <p className="mt-2 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ——— الشركات ——— */}
      <section className="bg-inverse text-inverse-fg">
        <div className="container grid gap-8 py-14 md:grid-cols-12 md:items-center md:py-20" data-reveal-group>
          <div className="md:col-span-7">
            <p className="eyebrow !text-inverse-fg/70">للمصانع والشركات</p>
            <h2 className="mt-4 text-2xl text-inverse-fg md:text-3xl">عقود صيانة سنوية للمصانع والمنشآت</h2>
            <p className="mt-4 max-w-prose text-inverse-fg/70">
              صيانة دورية للمباني والمرافق، أرضيات إيبوكسي، تجهيز المرافق حسب متطلبات GMP وISO، وطلبات عاجلة عند الأعطال.
              زيارات مجدولة وتقارير مكتوبة بعد كل زيارة.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm">
              {['GMP', 'ISO', 'أرضيات إيبوكسي', 'كهرباء ومرافق', 'دهانات صناعية', 'طلبات عاجلة'].map((t) => (
                <li key={t} className="rounded-full border border-inverse-fg/20 px-3 py-1 text-inverse-fg/85">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 md:col-span-5 md:items-end">
            <ButtonLink to="/corporate/annual" size="lg" className="w-full md:w-auto">
              اطلب عقد صيانة سنوي
            </ButtonLink>
            <ButtonLink
              to="/corporate/urgent"
              variant="outline"
              size="lg"
              className="w-full !border-inverse-fg/25 !bg-transparent !text-inverse-fg hover:!bg-inverse-fg/10 md:w-auto"
            >
              طلب صيانة عاجل لمنشأة
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ——— منتجات مختارة ——— */}
      {showFeatured && !featured.error && (
        <section className="section">
          <div className="container">
            <SectionHead eyebrow="المتجر" title="منتجات من ورشتنا" link={{ to: '/store', label: 'كل المنتجات' }} />
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
            </div>
          </div>
        </section>
      )}

      {/* ——— التواصل ——— */}
      <section className="border-t border-line bg-subtle">
        <div className="container grid gap-10 py-14 md:grid-cols-12 md:py-20" data-reveal-group>
          <div className="md:col-span-5">
            <p className="eyebrow">تواصل</p>
            <h2 className="mt-4 text-2xl md:text-3xl">عندك سؤال قبل الحجز؟</h2>
            <p className="mt-3 text-muted">أرسل صورة للمشكلة على واتساب ونرد عليك خلال ساعات العمل.</p>
            <ButtonA href={wa} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" className="mt-7 w-full sm:w-auto">
              <Icon name="whatsapp" /> راسلنا على واتساب
            </ButtonA>
          </div>
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 md:col-span-7">
            <ContactItem icon="phone" label="الهاتف">
              <a href={`tel:${settings.phone}`} className="ltr hover:text-accent">
                {settings.phone}
              </a>
            </ContactItem>
            <ContactItem icon="mail" label="البريد الإلكتروني">
              <a href={`mailto:${settings.email}`} className="ltr break-all hover:text-accent">
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

function SectionHead({ eyebrow, title, id, link }: { eyebrow: string; title: string; id?: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="mt-4 text-2xl md:text-[2rem]">
          {title}
        </h2>
      </div>
      {link && (
        <Link to={link.to} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-accent hover:underline">
          {link.label} <Icon name="chevronLeft" className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function ContactItem({ icon, label, children }: { icon: 'phone' | 'mail' | 'pin' | 'clock'; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon name={icon} className="mt-1 h-5 w-5 shrink-0 text-accent" />
      <div>
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
    </div>
  );
}
