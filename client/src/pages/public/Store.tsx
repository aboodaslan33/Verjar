import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRODUCT_GRID, ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
import { Button, EmptyState, ErrorState, Icon, PageHeader, Pagination, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import type { Category, Paged, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const SORTS = [
  { value: 'new', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'discount', label: 'الأعلى خصمًا' },
] as const;

const PAGE_SIZE = 12;

export default function Store() {
  useDocumentTitle('المتجر');
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const sortParam = params.get('sort') ?? 'new';
  const sort = SORTS.some((s) => s.value === sortParam) ? sortParam : 'new';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const update = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || (k === 'sort' && v === 'new') || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    // أي تغيير في التصفية يعيد إلى الصفحة الأولى
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: 'page' in patch ? false : true });
  };

  // بحث تلقائي بعد التوقف عن الكتابة
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const cats = useAsync(() => api.get<Category[]>('/store/categories'), []);
  const products = useAsync(
    () => api.get<Paged<Product>>('/store/products', { category, q, sort, page, pageSize: PAGE_SIZE }),
    [category, q, sort, page],
  );

  const totalCount = cats.data?.reduce((s, c) => s + (c.productCount ?? 0), 0);
  const activeCat = cats.data?.find((c) => c.slug === category);
  const hasFilters = Boolean(category || q);

  return (
    <>
      <PageHeader
        eyebrow="المتجر"
        title="منتجات من ورشتنا"
        description="أثاث داخلي وخارجي، قطع ديكور معدنية، ومنتجات للمصانع والمستودعات. اطلب من الموقع، ونتواصل معك على واتساب لتأكيد الطلب وموعد التوصيل."
      />

      <div className="container py-8 md:py-10">
        {/* التصنيفات */}
        <nav aria-label="تصنيفات المنتجات" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {cats.loading && !cats.data ? (
            <div className="flex gap-2" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
              ))}
            </div>
          ) : (
            <ul className="flex gap-2 pb-1">
              <CatTab active={!category} onClick={() => update({ category: null })} label="الكل" count={totalCount} />
              {cats.data?.map((c) => (
                <CatTab
                  key={c.id}
                  active={category === c.slug}
                  onClick={() => update({ category: c.slug })}
                  label={c.name}
                  count={c.productCount}
                />
              ))}
            </ul>
          )}
        </nav>

        {/* البحث والترتيب */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            role="search"
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: search.trim() });
            }}
          >
            <label htmlFor="store-search" className="sr-only">
              ابحث في المنتجات
            </label>
            <Icon name="search" className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              id="store-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم المنتج أو وصفه"
              className="input ps-11"
              enterKeyHint="search"
              maxLength={100}
            />
          </form>
          <div className="flex items-center gap-2 sm:w-56">
            <label htmlFor="store-sort" className="shrink-0 text-sm text-muted">
              الترتيب
            </label>
            <select
              id="store-sort"
              value={sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="input py-2.5"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* النتائج */}
        <div className="mt-6 min-h-[40vh]" aria-live="polite" aria-busy={products.loading}>
          {products.data && !products.loading && (
            <p className="mb-4 text-sm text-muted">
              {products.data.total === 0 ? 'لا نتائج' : <><span className="ltr">{products.data.total}</span> منتج</>}
              {activeCat && <> في «{activeCat.name}»</>}
              {q && <> عن «{q}»</>}
            </p>
          )}

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
                  update({ page: p });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          ) : (
            <EmptyState
              title={hasFilters ? 'لا توجد منتجات تطابق بحثك' : 'لا توجد منتجات حاليًا'}
              description={
                hasFilters
                  ? 'جرّب كلمة أخرى أو تصنيفًا مختلفًا.'
                  : 'نضيف منتجات جديدة من الورشة باستمرار. تابعنا قريبًا.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    عرض كل المنتجات
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>
    </>
  );
}

function CatTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cx(
          'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[15px] transition-colors',
          active
            ? 'border-primary bg-primary font-semibold text-primary-fg'
            : 'border-line bg-surface text-ink hover:border-brand-300',
        )}
      >
        {label}
        {count !== undefined && (
          <span
            className={cx(
              'ltr rounded-full px-1.5 text-xs',
              active ? 'bg-primary-fg/15 text-primary-fg' : 'bg-subtle text-muted',
            )}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  );
}
