import { useParams, useSearchParams } from 'react-router-dom';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { ButtonLink, EmptyState, ErrorState, Pagination, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Paged, Product, VendorStore as Store } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const PAGE_SIZE = 12;

/** صفحة متجر مورد: ملفه ومنتجاته المعتمدة */
export default function VendorStore() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const store = useAsync(() => api.get<Store>(`/store/vendors/${slug}`), [slug]);
  const products = useAsync(() => api.get<Paged<Product>>('/store/products', { vendor: slug, page, pageSize: PAGE_SIZE }), [slug, page]);
  useDocumentTitle(store.data?.name ?? 'متجر');

  if (store.error) {
    return (
      <div className="container max-w-xl py-16">
        {store.error.status === 404 ? (
          <EmptyState title="المتجر غير موجود" description="ربما تغيّر الرابط أو لم يعد المتجر متاحًا." action={<ButtonLink to="/store">تصفح السوق</ButtonLink>} />
        ) : (
          <ErrorState message={store.error.message} onRetry={store.reload} />
        )}
      </div>
    );
  }
  const v = store.data;

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container flex flex-col gap-6 py-10 sm:flex-row sm:items-center md:py-14">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-surface">
            {!v ? (
              <Skeleton className="h-full w-full" />
            ) : v.logoUrl ? (
              <img src={v.logoUrl} alt={`شعار ${v.name}`} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-ink">{v.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="eyebrow">{v?.isHouse ? 'متجر الشركة' : 'مورد في السوق'}</p>
            {v ? <h1 className="mt-3 text-3xl md:text-4xl">{v.name}</h1> : <Skeleton className="mt-3 h-9 w-56" />}
            {v?.description && <p className="mt-3 max-w-prose whitespace-pre-line text-muted">{v.description}</p>}
            {v && (
              <p className="mt-3 text-sm text-muted">
                {v.productCount} منتج · في السوق منذ {formatDate(v.createdAt)}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="container py-8 md:py-10" aria-busy={products.loading}>
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
          <EmptyState title="لا توجد منتجات حاليًا" description="هذا المتجر يضيف منتجاته قريبًا." action={<ButtonLink to="/store" variant="outline">تصفح السوق</ButtonLink>} />
        )}
      </section>
    </>
  );
}
