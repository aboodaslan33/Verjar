import { useParams, useSearchParams } from 'react-router-dom';
import { AwardBadge, PlanBadge, VerifiedMark, activeAward } from '../../components/market/Badges';
import { Stars } from '../../components/market/Stars';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { ButtonLink, EmptyState, ErrorState, Icon, Pagination, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { MarketFile } from '../../lib/market';
import type { Paged, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const PAGE_SIZE = 12;

type Supplier = {
  awardTitle?: string | null;
  awardUntil?: string | null;
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  isHouse: boolean;
  verified: boolean;
  city: string | null;
  businessField: string | null;
  productTypes: string | null;
  createdAt: string;
  plan: { code: string; name: string; badge: string | null } | null;
  catalogFiles: MarketFile[];
  certificates: MarketFile[];
  categories: { id: string; name: string; slug: string }[];
  productCount: number;
  completedDeals: number;
  rating: { average: number; count: number } | null;
  reviews: { id: string; overall: number; comment: string | null; createdAt: string; by: string }[];
};

/** صفحة المورد: ملف الشركة، التوثيق، التقييم، الكتالوج والشهادات، ومنتجاته المعتمدة */
export default function VendorStore() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const store = useAsync(() => api.get<Supplier>(`/store/vendors/${slug}`), [slug], `vendor/${slug}`);
  const products = useAsync(() => api.get<Paged<Product>>('/store/products', { vendor: slug, page, pageSize: PAGE_SIZE }), [slug, page], `vendor/${slug}/products/${page}`);
  useDocumentTitle(store.data ? (store.data.isHouse ? 'FARJAR' : store.data.name) : 'المورد');

  if (store.error) {
    return (
      <div className="container max-w-xl py-16">
        {store.error.status === 404 ? (
          <EmptyState title="المورد غير موجود" description="ربما تغيّر الرابط أو لم يعد المورد متاحًا." action={<ButtonLink to="/store/suppliers">دليل الموردين</ButtonLink>} />
        ) : (
          <ErrorState message={store.error.message} onRetry={store.reload} />
        )}
      </div>
    );
  }
  const v = store.data;
  const files = v ? [...v.catalogFiles.map((f) => ({ ...f, group: 'الكتالوج' })), ...v.certificates.map((f) => ({ ...f, group: 'شهادة / اعتماد' }))] : [];

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container grid gap-8 py-10 md:py-14 lg:grid-cols-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start lg:col-span-8">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
              {!v ? (
                <Skeleton className="h-full w-full" />
              ) : v.logoUrl ? (
                <img src={v.logoUrl} alt={`شعار ${v.name}`} className="h-full w-full object-contain" />
              ) : (
                <Icon name="factory" className="h-9 w-9 text-[#6b7280]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="eyebrow">{v?.isHouse ? 'متجر FARJAR' : 'مورد في السوق الصناعي'}</p>
              {v ? (
                <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl md:text-4xl">
                  {v.isHouse ? 'FARJAR' : v.name}
                  {!v.isHouse && <PlanBadge plan={v.plan} className="h-6 text-xs" />}
                </h1>
              ) : (
                <Skeleton className="mt-3 h-9 w-56" />
              )}
              {v && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                  {(v.verified || v.isHouse) && <VerifiedMark label />}
                  {!v.isHouse && activeAward(v) && <AwardBadge title={activeAward(v)!} className="h-6 px-2.5 text-xs" />}
                  {v.city && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="pin" className="h-4 w-4" /> {v.city}
                    </span>
                  )}
                  {v.rating && (
                    <span className="inline-flex items-center gap-1.5">
                      <Stars value={v.rating.average} /> <span className="num">{v.rating.average}</span> (<span className="num">{v.rating.count}</span> تقييم)
                    </span>
                  )}
                  <span>
                    <span className="num">{v.productCount}</span> منتج
                  </span>
                  {v.completedDeals > 0 && (
                    <span>
                      <span className="num">{v.completedDeals}</span> صفقة منجزة
                    </span>
                  )}
                  <span>في السوق منذ {formatDate(v.createdAt)}</span>
                </div>
              )}
              {v?.description && <p className="mt-4 max-w-prose whitespace-pre-line text-muted">{v.description}</p>}
              {v && (v.businessField || v.productTypes) && (
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {v.businessField && (
                    <div>
                      <dt className="text-xs text-muted">مجال العمل</dt>
                      <dd>{v.businessField}</dd>
                    </div>
                  )}
                  {v.productTypes && (
                    <div>
                      <dt className="text-xs text-muted">المنتجات</dt>
                      <dd>{v.productTypes}</dd>
                    </div>
                  )}
                </dl>
              )}
              {v && v.categories.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {v.categories.map((c) => (
                    <li key={c.id}>
                      <a href={`/store?category=${c.slug}&vendor=${v.slug}`} className="rounded-full border border-line-strong bg-surface px-3 py-1 text-sm hover:border-ink">
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <aside className="space-y-3 lg:col-span-4">
            {v && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="font-semibold">تحتاج منتجًا من {v.isHouse ? 'FARJAR' : 'هذا المورد'}؟</p>
                <p className="mt-1 text-sm text-muted">أرسل طلب عرض سعر يصله مباشرة، وتابع الرد والمراسلة من حسابك.</p>
                <ButtonLink to={`/rfq/new?vendor=${v.slug}`} block className="mt-4">
                  <Icon name="file" className="h-4 w-4" /> اطلب عرض سعر
                </ButtonLink>
              </div>
            )}
            {files.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className="mb-3 font-semibold">الكتالوج والشهادات</p>
                <ul className="space-y-2 text-sm">
                  {files.map((f, i) => (
                    <li key={i}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                        <Icon name="file" className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 truncate">{f.name}</span>
                        <span className="ms-auto shrink-0 text-xs text-muted">{f.group}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </header>

      <section className="container py-8 md:py-10" aria-busy={products.loading}>
        <h2 className="mb-6 text-xl">المنتجات</h2>
        {products.error ? (
          <ErrorState message={products.error.message} onRetry={products.reload} />
        ) : products.loading ? (
          <ProductGridSkeleton count={8} className={PRODUCT_GRID} />
        ) : products.data && products.data.items.length > 0 ? (
          <>
            <div className={PRODUCT_GRID} data-reveal-group>
              {products.data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Pagination
              page={products.data.page}
              pages={products.data.pages}
              onChange={(p) => {
                const next = new URLSearchParams(params);
                if (p > 1) next.set('page', String(p));
                else next.delete('page');
                setParams(next);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        ) : (
          <EmptyState title="لا توجد منتجات حاليًا" description="يمكنك طلب عرض سعر مباشرة من المورد." action={v ? <ButtonLink to={`/rfq/new?vendor=${v.slug}`}>اطلب عرض سعر</ButtonLink> : undefined} />
        )}
      </section>

      {v && v.reviews.length > 0 && (
        <section className="container pb-12" aria-labelledby="rev-title">
          <h2 id="rev-title" className="mb-4 text-xl">
            تقييمات العملاء
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {v.reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <Stars value={r.overall} />
                  <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
                </div>
                {r.comment && <p className="mt-2 text-[15px] leading-relaxed">{r.comment}</p>}
                <p className="mt-2 text-xs text-muted">{r.by} · صفقة موثّقة عبر FARJAR</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
