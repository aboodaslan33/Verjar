import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stars } from '../../components/market/Stars';
import { Checkbox, EmptyState, ErrorState, Icon, PageHeader, Pagination, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import type { Category, Paged } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { SupplierTile } from './MarketHome';

type Supplier = {
  awardTitle?: string | null;
  awardUntil?: string | null;
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  verified: boolean;
  isHouse: boolean;
  city: string | null;
  businessField: string | null;
  productCount: number;
  plan: { code: string; name: string; badge: string | null } | null;
  rating: { average: number; count: number } | null;
};

/** دليل الموردين: بحث وفلترة حسب المدينة والتصنيف والتوثيق والباقة */
export default function Suppliers() {
  useDocumentTitle('دليل الموردين');
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const [q, setQ] = useState(get('q'));
  useEffect(() => setQ(get('q')), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const page = Math.max(1, Number(get('page')) || 1);
  const key = ['q', 'city', 'category', 'verified', 'plan'].map(get).join('|');
  const list = useAsync(
    () => api.get<Paged<Supplier> & { featured?: Supplier[] }>('/store/suppliers', { q: get('q'), city: get('city'), category: get('category'), verified: get('verified'), plan: get('plan'), page, pageSize: 24 }),
    [key, page],
    `suppliers?${key}|${page}`,
  );
  const cats = useAsync(() => api.get<Category[]>('/store/categories'), [], 'store/categories');
  const facets = useAsync(() => api.get<{ cities: { value: string; count: number }[] }>('/store/facets'), [], 'store/facets');

  return (
    <>
      <PageHeader
        eyebrow="FARJAR Industrial Marketplace"
        title="دليل الموردين"
        description="موردون ومصنّعون ومقدمو خدمات صناعية معتمدون من FARJAR. ابحث حسب التخصص أو المدينة، وأرسل طلب عرض سعر مباشرة."
        crumbs={[{ to: '/store', label: 'السوق' }, { label: 'الموردون' }]}
      />
      <div className="container py-8 md:py-10">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() });
          }}
          className="grid gap-3 md:grid-cols-[1fr_12rem_12rem]"
        >
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المورد أو مجال العمل" aria-label="بحث في الموردين" className="input ps-11" />
          </div>
          <select value={get('category')} onChange={(e) => set({ category: e.target.value })} className="input cursor-pointer py-2.5" aria-label="التصنيف">
            <option value="">كل التصنيفات</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={get('city')} onChange={(e) => set({ city: e.target.value })} className="input cursor-pointer py-2.5" aria-label="المدينة">
            <option value="">كل المدن</option>
            {facets.data?.cities.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Checkbox label="موثّق فقط" checked={get('verified') === 'true'} onChange={(v) => set({ verified: v ? 'true' : '' })} />
          <Checkbox label="PRO و BUSINESS" checked={get('plan') === 'PRO,BUSINESS'} onChange={(v) => set({ plan: v ? 'PRO,BUSINESS' : '' })} />
        </div>

        <div className="mt-8" aria-busy={list.loading}>
          {list.error ? (
            <ErrorState message={list.error.message} onRetry={list.reload} />
          ) : list.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : list.data && list.data.items.length ? (
            <>
              {list.data.featured && list.data.featured.length > 0 && !get('q') && (
                <section className="mb-8" aria-labelledby="featured-suppliers">
                  <h2 id="featured-suppliers" className="mb-3 flex items-center gap-2 text-lg">
                    <Icon name="star" className="h-5 w-5 text-primary" /> الموردون المميزون
                  </h2>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.data.featured.map((s) => (
                      <li key={s.id}>
                        <SupplierTile s={s} featured />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="mb-4 text-sm text-muted">
                <span className="num font-semibold text-ink">{list.data.total}</span> مورد
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.data.items.map((s) => (
                  <li key={s.id} className="relative">
                    <SupplierTile s={s} />
                    {s.rating && (
                      <span className="pointer-events-none absolute end-3 top-3 inline-flex items-center gap-1 text-xs text-muted">
                        <Stars value={s.rating.average} className="[&_svg]:h-3 [&_svg]:w-3" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={list.data.page} pages={list.data.pages} onChange={(p) => set({ page: p > 1 ? String(p) : '' })} />
            </>
          ) : (
            <EmptyState title="لا يوجد موردون مطابقون" description="جرّب تخفيف الفلاتر، أو أرسل طلب عرض سعر ونوصله بالموردين المناسبين." />
          )}
        </div>
      </div>
    </>
  );
}
