import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AwardBadge, SupplierLine, VerifiedMark, PlanBadge, activeAward } from '../../components/market/Badges';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton, productImage } from '../../components/store/ProductCard';
import { ButtonLink, Icon, SectionHeading, Skeleton } from '../../components/ui';
import type { IconName } from '../../components/ui/Icon';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import type { Category, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type AdVendor = { id: string; name: string; slug: string; logoUrl: string | null; verified: boolean; city: string | null; isHouse: boolean; description?: string; plan: { code: string; badge: string | null } | null; awardTitle?: string | null; awardUntil?: string | null };
type Ad = { id: string; type: string; title: string | null; vendor: AdVendor; product: Product | null };
type SupplierCard = AdVendor & { businessField: string | null; productCount: number };
type Home = {
  ads: { featuredProducts: Ad[]; featuredSuppliers: Ad[]; deals: Ad[]; productOfWeek: Ad | null; supplierOfMonth: Ad | null };
  farjarProducts: Product[];
  latestProducts: Product[];
  suppliers: SupplierCard[];
  stats: { suppliers: number; products: number; rfqs: number };
};

const POPULAR = ['موتور', 'مضخة', 'سيور ناقلة', 'حساسات', 'عربات ستانلس', 'قطع غيار'];

/** أيقونة التصنيف من رمزه (التصنيفات ديناميكية؛ غير المعروف يأخذ أيقونة عامة) */
function categoryIcon(slug: string): IconName {
  if (/machine|line|motor|pump/.test(slug)) return 'gear';
  if (/spare|maintenance|tools|conveyor/.test(slug)) return 'wrench';
  if (/handling|trolley|cart/.test(slug)) return 'truck';
  if (/automation|sensor|electric/.test(slug)) return 'sliders';
  if (/safety/.test(slug)) return 'shield';
  if (/engineering|custom|fabrication|steel|stainless/.test(slug)) return 'ruler';
  if (/equipment|industrial/.test(slug)) return 'factory';
  if (/consumable/.test(slug)) return 'bag';
  return 'grid';
}

const click = (id: string) => void api.post(`/market/ads/${id}/click`).catch(() => undefined);

export default function MarketHome() {
  useDocumentTitle('السوق الصناعي');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const home = useAsync(() => api.get<Home>('/market/home'), [], 'market/home');
  const cats = useAsync(() => api.get<Category[]>('/store/categories'), [], 'store/categories');
  const h = home.data;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    navigate(v ? `/store?q=${encodeURIComponent(v)}` : '/store?view=all');
  };

  return (
    <>
      {/* ——— البحث ——— */}
      <section className="relative overflow-hidden bg-inverse text-inverse-fg">
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-inverse-fg opacity-[0.05]" aria-hidden>
          <defs>
            <pattern id="mk-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mk-grid)" />
        </svg>
        <div className="container relative py-12 md:py-20">
          <p className="eyebrow anim-rise !text-inverse-fg/60">FARJAR Industrial Marketplace</p>
          <h1 className="anim-rise mt-4 max-w-3xl text-[1.9rem] leading-[1.3] text-inverse-fg [animation-delay:60ms] sm:text-[2.6rem] lg:text-[3rem]">
            ابحث عن منتج أو قطعة أو معدات صناعية
          </h1>
          <p className="anim-rise mt-4 max-w-2xl text-[17px] leading-relaxed text-inverse-fg/65 [animation-delay:100ms]">
            قطع غيار، ماكينات، خطوط إنتاج، معدات مناولة، ستانلس، كهرباء وتحكم صناعي — من FARJAR وموردين معتمدين في الأردن.
          </p>
          <form onSubmit={submit} role="search" className="anim-rise mt-8 flex max-w-3xl flex-col gap-2 [animation-delay:140ms] sm:flex-row">
            <label htmlFor="market-q" className="sr-only">
              ابحث في السوق
            </label>
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input
                id="market-q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="اسم المنتج، رقم القطعة، SKU، الماركة أو المورد"
                className="h-14 w-full rounded-xl border-0 bg-white ps-12 pe-4 text-[16px] text-[#262627] shadow-lift outline-none ring-primary placeholder:text-[#6b7280] focus:ring-2"
                enterKeyHint="search"
                maxLength={100}
              />
            </div>
            <button type="submit" className="h-14 shrink-0 rounded-xl bg-primary px-8 text-[16px] font-bold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover">
              بحث
            </button>
          </form>
          <div className="anim-rise mt-4 flex flex-wrap items-center gap-2 text-sm [animation-delay:180ms]">
            <span className="text-inverse-fg/50">الأكثر بحثًا:</span>
            {POPULAR.map((p) => (
              <Link key={p} to={`/store?q=${encodeURIComponent(p)}`} className="rounded-full border border-inverse-fg/15 px-3 py-1 text-inverse-fg/80 transition-colors hover:border-inverse-fg/40 hover:text-inverse-fg">
                {p}
              </Link>
            ))}
          </div>
          <div className="anim-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:220ms]">
            <Link
              to="/rfq/new"
              className="inline-flex h-12 items-center gap-2 rounded-lg border-2 border-primary px-6 font-bold text-primary transition-colors hover:bg-primary hover:text-primary-fg"
            >
              <Icon name="file" className="h-5 w-5" /> اطلب عرض سعر
            </Link>
            <Link to="/store/suppliers" className="inline-flex h-12 items-center gap-2 rounded-lg px-4 font-semibold text-inverse-fg/80 hover:text-inverse-fg">
              دليل الموردين <Icon name="arrowLeft" className="h-4 w-4" />
            </Link>
          </div>
          {h && (
            <dl className="mt-10 grid max-w-xl grid-cols-3 gap-4 border-t border-inverse-fg/10 pt-6">
              {(
                [
                  ['مورد معتمد', h.stats.suppliers],
                  ['منتج', h.stats.products],
                  ['طلب عرض سعر', h.stats.rfqs],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <dd className="num font-display text-2xl font-semibold text-inverse-fg">{v}</dd>
                  <dt className="text-xs text-inverse-fg/55">{l}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* ——— التصنيفات ——— */}
      <section className="section pb-8" aria-labelledby="cats-title">
        <div className="container">
          <SectionHeading id="cats-title" eyebrow="التصنيفات" title="تصفح حسب التصنيف" link={{ to: '/store?view=all', label: 'كل المنتجات' }} />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cats.loading && !cats.data
              ? Array.from({ length: 10 }).map((_, i) => (
                  <li key={i}>
                    <Skeleton className="h-24 rounded-xl" />
                  </li>
                ))
              : cats.data?.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/store?category=${c.slug}`}
                      className="group flex h-full min-h-[6rem] flex-col justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-primary hover:shadow-lift"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
                        <Icon name={categoryIcon(c.slug)} className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold leading-snug">{c.name}</span>
                        <span className="text-xs text-muted">
                          <span className="num">{c.productCount ?? 0}</span> منتج
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>
        </div>
      </section>

      {/* ——— دعوة لطلب عرض سعر ——— */}
      <section className="container pb-4">
        <div className="flex flex-col gap-5 rounded-2xl bg-primary p-6 text-primary-fg sm:p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-xl font-bold md:text-2xl">لديك احتياج صناعي؟</p>
            <p className="mt-1 max-w-xl text-[15px] leading-relaxed opacity-85">أرسل طلبك وسنوصله بالموردين المناسبين. تستلم عدة عروض، تقارنها، وتختار الأنسب — بدون أي التزام.</p>
          </div>
          <Link to="/rfq/new" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-inverse px-6 font-bold text-inverse-fg transition-transform hover:-translate-y-0.5">
            أرسل طلب عرض سعر <Icon name="arrowLeft" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ——— منتج الأسبوع ومورد الشهر ——— */}
      {h && (h.ads.productOfWeek?.product || h.ads.supplierOfMonth) && (
        <section className="container grid gap-4 pt-10 md:grid-cols-2">
          {h.ads.productOfWeek?.product && <ProductOfWeek ad={h.ads.productOfWeek} />}
          {h.ads.supplierOfMonth && <SupplierOfMonth ad={h.ads.supplierOfMonth} />}
        </section>
      )}

      {h && h.ads.featuredProducts.length > 0 && (
        <ProductsRow title="منتجات مميزة" eyebrow="مميز" products={h.ads.featuredProducts} />
      )}
      {h && h.ads.deals.length > 0 && <ProductsRow title="عروض صناعية" eyebrow="عروض" products={h.ads.deals.filter((a) => a.product)} />}

      {/* ——— منتجات FARJAR ——— */}
      <section className="section" aria-labelledby="farjar-title">
        <div className="container">
          <SectionHeading id="farjar-title" eyebrow="من FARJAR" title="منتجات FARJAR" link={{ to: '/store?house=true', label: 'كل منتجات FARJAR' }} />
          <div className="mt-8">
            {home.loading && !h ? (
              <ProductGridSkeleton count={4} className={PRODUCT_GRID} />
            ) : h?.farjarProducts.length ? (
              <div className={PRODUCT_GRID} data-reveal-group>
                {h.farjarProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <p className="text-muted">تُضاف منتجات FARJAR قريبًا.</p>
            )}
          </div>
        </div>
      </section>

      {/* ——— الموردون ——— */}
      {h && (h.ads.featuredSuppliers.length > 0 || h.suppliers.length > 0) && (
        <section className="section bg-subtle" aria-labelledby="sup-title">
          <div className="container">
            <SectionHeading id="sup-title" eyebrow="الموردون" title="موردون معتمدون" link={{ to: '/store/suppliers', label: 'دليل الموردين' }} />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...h.ads.featuredSuppliers.map((a) => ({ ...a.vendor, featuredAd: a.id, businessField: null, productCount: -1 })), ...h.suppliers.filter((s) => !h.ads.featuredSuppliers.some((a) => a.vendor.id === s.id))]
                .slice(0, 8)
                .map((s) => (
                  <li key={s.id}>
                    <SupplierTile s={s} featured={'featuredAd' in s} onClick={'featuredAd' in s ? () => click(s.featuredAd as string) : undefined} />
                  </li>
                ))}
            </ul>
          </div>
        </section>
      )}

      {h && h.latestProducts.length > 0 && <ProductsRow title="أحدث المنتجات" eyebrow="جديد" products={h.latestProducts} link={{ to: '/store?sort=new', label: 'المزيد' }} />}

      {/* ——— كيف يعمل السوق ——— */}
      <section className="section border-t border-line" aria-labelledby="how-title">
        <div className="container">
          <SectionHeading id="how-title" eyebrow="كيف يعمل" title="من الاحتياج إلى التوريد" />
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['search', 'ابحث', 'عن المنتج أو القطعة أو المورد بالاسم أو رقم القطعة أو الماركة.'],
                ['file', 'اطلب عرض سعر', 'اكتب احتياجك بالكميات والمواصفات وأرفق الصور والملفات الفنية.'],
                ['sliders', 'قارن العروض', 'السعر، مدة التوريد، الضمان، المنشأ وشروط الدفع جنبًا إلى جنب.'],
                ['check', 'نفّذ الطلب', 'اختر العرض الأنسب وتواصل مع المورد عبر المنصة حتى التسليم.'],
              ] as const
            ).map(([icon, t, d], i) => (
              <li key={t} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-primary">
                    <Icon name={icon} className="h-5 w-5" />
                  </span>
                  <span className="num font-display text-3xl font-bold text-line-strong">{i + 1}</span>
                </div>
                <p className="mt-4 font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ——— انضم كمورد ——— */}
      <section className="bg-inverse text-inverse-fg">
        <div className="container flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between md:py-16">
          <div>
            <p className="eyebrow !text-inverse-fg/60">للموردين والمصنّعين</p>
            <h2 className="mt-3 text-2xl text-inverse-fg md:text-[2rem]">اعرض منتجاتك للمصانع والشركات</h2>
            <p className="mt-2 max-w-xl text-inverse-fg/65">سجّل شركتك مجانًا، أضف منتجاتك، واستقبل طلبات عروض الأسعار من الشركات مباشرة. باقات PRO وBUSINESS لظهور أوسع.</p>
          </div>
          <ButtonLink to="/suppliers/join" size="lg">
            انضم كمورد
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

function ProductsRow({ title, eyebrow, products, link }: { title: string; eyebrow: string; products: (Ad | Product)[]; link?: { to: string; label: string } }) {
  const items = products.map((x) => ('type' in x ? { ad: x.id, p: x.product! } : { ad: null, p: x as Product })).filter((x) => x.p);
  if (!items.length) return null;
  return (
    <section className="section pb-4">
      <div className="container">
        <SectionHeading eyebrow={eyebrow} title={title} link={link} />
        <div className={cx(PRODUCT_GRID, 'mt-8')} data-reveal-group>
          {items.slice(0, 8).map(({ ad, p }) => (
            <div key={p.id} onClickCapture={ad ? () => click(ad) : undefined}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductOfWeek({ ad }: { ad: Ad }) {
  const p = ad.product!;
  const img = productImage(p);
  return (
    <Link to={`/store/${p.slug}`} onClick={() => click(ad.id)} className="group grid grid-cols-[7rem_1fr] items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-3 transition-shadow hover:shadow-lift sm:grid-cols-[9rem_1fr]">
      <span className="aspect-square overflow-hidden rounded-xl bg-subtle">{img ? <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon name="image" className="m-auto mt-10 h-6 w-6 text-muted" />}</span>
      <span className="min-w-0">
        <span className="text-xs font-bold text-primary">منتج الأسبوع</span>
        <span className="mt-1 block font-display text-lg font-semibold leading-snug group-hover:underline">{p.name}</span>
        <span className="mt-1 block text-sm text-muted">
          <SupplierLine vendor={p.vendor} />
        </span>
        <span className="mt-2 block font-semibold">{p.priceOnRequest ? 'السعر عند الطلب' : formatJOD(p.finalPrice)}</span>
      </span>
    </Link>
  );
}

function SupplierOfMonth({ ad }: { ad: Ad }) {
  const v = ad.vendor;
  return (
    <Link to={`/store/vendor/${v.slug}`} onClick={() => click(ad.id)} className="flex items-center gap-4 rounded-2xl border border-ink bg-inverse p-5 text-inverse-fg transition-transform hover:-translate-y-0.5">
      <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">{v.logoUrl ? <img src={v.logoUrl} alt="" className="h-full w-full object-contain" /> : <Icon name="factory" className="h-8 w-8 text-[#262627]" />}</span>
      <span className="min-w-0">
        <span className="text-xs font-bold text-primary">مورد الشهر</span>
        <span className="mt-1 flex items-center gap-2 font-display text-lg font-semibold">
          {v.name} {v.verified && <VerifiedMark />}
        </span>
        {v.description && <span className="mt-1 line-clamp-2 block text-sm text-inverse-fg/65">{v.description}</span>}
      </span>
    </Link>
  );
}

export function SupplierTile({ s, featured, onClick }: { s: SupplierCard | (AdVendor & { businessField: string | null; productCount: number }); featured?: boolean; onClick?: () => void }) {
  return (
    <Link
      to={`/store/vendor/${s.slug}`}
      onClick={onClick}
      className={cx('flex h-full items-center gap-3 rounded-xl border bg-surface p-4 transition-shadow hover:shadow-lift', featured ? 'border-primary' : 'border-line')}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
        {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-full w-full object-contain" loading="lazy" /> : <Icon name="factory" className="h-6 w-6 text-muted" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="truncate">{s.isHouse ? 'FARJAR' : s.name}</span>
          {(s.verified || s.isHouse) && <VerifiedMark />}
          {!s.isHouse && (activeAward(s) ? <AwardBadge title={activeAward(s)!} /> : <PlanBadge plan={s.plan} />)}
        </span>
        <span className="block truncate text-xs text-muted">
          {[s.city, s.businessField].filter(Boolean).join(' · ') || (featured ? 'مورد مميز' : '')}
          {s.productCount >= 0 && (
            <>
              {' '}· <span className="num">{s.productCount}</span> منتج
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
