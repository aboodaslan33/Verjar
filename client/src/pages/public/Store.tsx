import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProductCard, ProductGridSkeleton } from '../../components/store/ProductCard';
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
  useDocumentTitle('السوق');
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

  const cats = useAsync(() => api.get<Category[]>('/store/categories'), [], 'store/categories');
  const products = useAsync(
    () => api.get<Paged<Product>>('/store/products', { category, q, sort, page, pageSize: PAGE_SIZE }),
    [category, q, sort, page],
    `store/products?${category}|${q}|${sort}|${page}`,
  );

  const totalCount = cats.data?.reduce((s, c) => s + (c.productCount ?? 0), 0);
  // القسم الرئيسي النشط (سواء اختير هو أو أحد أقسامه الفرعية)
  const activeTop = cats.data?.find((c) => c.slug === category || c.children?.some((k) => k.slug === category));
  const activeCat = activeTop?.slug === category ? activeTop : activeTop?.children?.find((k) => k.slug === category);
  const hasFilters = Boolean(category || q);

  const pickCategory = (slug: string | null) => update({ category: slug });

  return (
    <>
      <PageHeader
        eyebrow="السوق"
        title="منتجات من ورشتنا ومن موردين معتمدين"
        description="أقسام متنوعة من متاجر مختلفة في سلة واحدة. كل منتج تراجعه الإدارة قبل عرضه، وكل مورد يجهّز طلبه ويتابعه معك."
      />

      <div className="container py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
          {/* الأقسام — عمود جانبي على سطح المكتب */}
          <aside className="hidden lg:block" aria-label="أقسام السوق">
            <div className="sticky top-32">
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted">الأقسام</p>
              {cats.loading && !cats.data ? (
                <div className="space-y-2" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="space-y-0.5 text-[15px]">
                  <SideItem active={!category} onClick={() => pickCategory(null)} label="كل المنتجات" count={totalCount} />
                  {cats.data?.map((c) => (
                    <li key={c.id}>
                      <SideItem as="div" active={category === c.slug} onClick={() => pickCategory(c.slug)} label={c.name} count={c.productCount} />
                      {activeTop?.id === c.id && (c.children?.length ?? 0) > 0 && (
                        <ul className="anim-pop my-1 ms-3 space-y-0.5 border-s border-line ps-2">
                          {c.children!.map((k) => (
                            <SideItem key={k.id} active={category === k.slug} onClick={() => pickCategory(k.slug)} label={k.name} count={k.productCount} small />
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {/* الأقسام — شريط أفقي على الجوال */}
            <nav aria-label="أقسام السوق" className="scroll-x -mx-4 px-4 lg:hidden">
              {cats.loading && !cats.data ? (
                <div className="flex gap-2" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" />
                  ))}
                </div>
              ) : (
                <ul className="flex gap-2 pb-1">
                  <CatTab active={!category} onClick={() => pickCategory(null)} label="الكل" />
                  {cats.data?.map((c) => (
                    <CatTab key={c.id} active={activeTop?.id === c.id} onClick={() => pickCategory(c.slug)} label={c.name} />
                  ))}
                </ul>
              )}
            </nav>
            {activeTop && (activeTop.children?.length ?? 0) > 0 && (
              <nav aria-label={`أقسام ${activeTop.name}`} className="scroll-x -mx-4 mt-2 px-4 lg:hidden">
                <ul className="flex gap-4 border-b border-line text-sm">
                  {[{ id: activeTop.id, name: 'الكل', slug: activeTop.slug }, ...(activeTop.children ?? [])].map((k) => (
                    <li key={k.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => pickCategory(k.slug)}
                        aria-pressed={category === k.slug}
                        className={cx(
                          'relative min-h-[44px] transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
                          category === k.slug ? 'font-semibold text-ink after:scale-x-100' : 'text-muted after:scale-x-0',
                        )}
                      >
                        {k.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* البحث والترتيب */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-0">
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
                <select id="store-sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className="input cursor-pointer py-2.5">
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
              <div className="mb-5 flex min-h-[1.5rem] flex-wrap items-center gap-2 text-sm text-muted">
                {products.data && !products.loading && (
                  <span>
                    {products.data.total === 0 ? 'لا نتائج' : <><span className="num font-semibold text-ink">{products.data.total}</span> منتج</>}
                  </span>
                )}
                {activeCat && <FilterChip label={activeCat.name} onClear={() => pickCategory(null)} />}
                {q && <FilterChip label={`«${q}»`} onClear={() => { setSearch(''); update({ q: '' }); }} />}
              </div>

              {products.error ? (
                <ErrorState message={products.error.message} onRetry={products.reload} />
              ) : products.loading ? (
                <ProductGridSkeleton count={9} className={STORE_GRID} />
              ) : products.data && products.data.items.length > 0 ? (
                <>
                  <div className={STORE_GRID} data-reveal-group>
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
                  icon="bag"
                  title={hasFilters ? 'لا توجد منتجات تطابق بحثك' : 'لا توجد منتجات حاليًا'}
                  description={hasFilters ? 'جرّب كلمة أخرى أو قسمًا مختلفًا.' : 'نضيف منتجات جديدة باستمرار. تابعنا قريبًا.'}
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
        </div>
      </div>
    </>
  );
}

const STORE_GRID = 'grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3';

function SideItem({
  active,
  onClick,
  label,
  count,
  small,
  as = 'li',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  small?: boolean;
  as?: 'li' | 'div';
}) {
  const Wrap = as;
  return (
    <Wrap>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cx(
          'flex w-full items-center justify-between gap-2 rounded-lg px-3 text-start transition-colors',
          small ? 'min-h-[36px] text-sm' : 'min-h-[40px]',
          active ? 'bg-ink font-semibold text-bg' : 'text-ink/80 hover:bg-subtle hover:text-ink',
        )}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && <span className={cx('num text-xs', active ? 'text-bg/70' : 'text-muted')}>{count}</span>}
      </button>
    </Wrap>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="anim-pop inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface py-0.5 pe-1 ps-3 text-ink">
      {label}
      <button type="button" onClick={onClear} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-subtle hover:text-ink" aria-label={`إزالة ${label}`}>
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function CatTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cx(
          'inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm transition-colors',
          active ? 'border-ink bg-ink font-semibold text-bg' : 'border-line-strong bg-surface text-ink',
        )}
      >
        {label}
      </button>
    </li>
  );
}
