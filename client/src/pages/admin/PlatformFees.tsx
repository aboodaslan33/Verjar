import { FeeByOrder, FeeByProduct, FeeTiles } from '../../components/admin/FeeTables';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import type { AdminCategory, AdminVendor, FeeOverview } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterSelect, Panel } from '../../components/admin/ui';
import { ButtonA, ErrorState, Icon, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { FINANCIAL_LABEL, type FinancialStatus } from '../../lib/delivery';
import { STATUS_LABEL, formatJOD } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import { editorCategories } from './ProductEditor';

const KEYS = ['supplierId', 'productId', 'categoryId', 'feeMin', 'feeMax', 'status', 'financialStatus', 'settled', 'from', 'to'] as const;

/** نسبة فرجار: إيراد المنصة من كل منتج ومورد، مع الفلاتر والتصدير */
export default function PlatformFees() {
  useDocumentTitle('نسبة فرجار');
  const f = useFilters(KEYS);
  const v = f.values;
  const params = Object.fromEntries(Object.entries(v).filter(([, x]) => x)) as Record<string, string>;
  const q = useAdminQuery(() => api.get<FeeOverview>('/admin/reports/fees/overview', params), [JSON.stringify(params)], { keep: true });
  const vendors = useAdminQuery(() => api.get<AdminVendor[]>('/admin/vendors'), []);
  const cats = useAdminQuery(() => api.get<AdminCategory[]>('/admin/store/categories'), []);
  const exportUrl = (format: 'csv' | 'xlsx') => api.url(`/admin/reports/platform_fees?${new URLSearchParams({ format, lang: 'ar', ...params })}`);
  const products = q.data?.byProduct ?? [];

  return (
    <AdminPage
      title="نسبة فرجار"
      description="إيراد فرجار من كل منتج حسب النسبة المثبتة وقت كل بيع. المسدد = مخصوم في تسويات مدفوعة للموردين."
      actions={
        <div className="flex flex-wrap gap-2">
          <ButtonA href={exportUrl('xlsx')} download variant="outline" size="sm">
            <Icon name="download" className="h-4 w-4" /> Excel
          </ButtonA>
          <ButtonA href={exportUrl('csv')} download variant="ghost" size="sm">
            CSV
          </ButtonA>
        </div>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label="المورد" value={v.supplierId} onChange={(e) => f.set({ supplierId: e.target.value, productId: '' })}>
          <option value="">كل الموردين</option>
          {vendors.data
            ?.filter((x) => !x.isHouse)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </FilterSelect>
        <FilterSelect label="المنتج" value={v.productId} onChange={(e) => f.set({ productId: e.target.value })}>
          <option value="">كل المنتجات</option>
          {/* المنتجات التي لها مبيعات ضمن الفلاتر الحالية */}
          {(v.productId && !products.some((p) => p.productId === v.productId) ? [{ productId: v.productId, name: 'المنتج المحدد' }] : products).map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="القسم" value={v.categoryId} onChange={(e) => f.set({ categoryId: e.target.value })}>
          <option value="">كل الأقسام</option>
          {editorCategories(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="حالة الطلب" value={v.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">كل الحالات (عدا الملغي)</option>
          {(Object.keys(STATUS_LABEL) as RequestStatus[])
            .filter((s) => s !== 'CANCELLED')
            .map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
        </FilterSelect>
        <FilterSelect label="حالة الدفع" value={v.financialStatus} onChange={(e) => f.set({ financialStatus: e.target.value })}>
          <option value="">كل حالات الدفع</option>
          {(Object.keys(FINANCIAL_LABEL) as FinancialStatus[]).map((s) => (
            <option key={s} value={s}>
              {FINANCIAL_LABEL[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="التسوية" value={v.settled} onChange={(e) => f.set({ settled: e.target.value })}>
          <option value="">مسدد وغير مسدد</option>
          <option value="true">مسدد لفرجار</option>
          <option value="false">مستحق لفرجار</option>
        </FilterSelect>
      </FilterBar>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="النسبة من %" type="number" inputMode="decimal" min={0} max={50} className="ltr text-start" value={v.feeMin} onChange={(e) => f.set({ feeMin: e.target.value })} />
        <Input label="النسبة إلى %" type="number" inputMode="decimal" min={0} max={50} className="ltr text-start" value={v.feeMax} onChange={(e) => f.set({ feeMax: e.target.value })} />
        <Input label="من تاريخ" type="date" className="ltr text-start" value={v.from} onChange={(e) => f.set({ from: e.target.value })} />
        <Input label="إلى تاريخ" type="date" className="ltr text-start" value={v.to} onChange={(e) => f.set({ to: e.target.value })} />
      </div>

      {q.error ? (
        <ErrorState message={q.error.message} onRetry={q.retry} />
      ) : (
        <>
          <FeeTiles totals={q.data?.totals} loading={q.loading} />
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="حسب المورد" bodyClassName="p-0 sm:p-0">
              {!q.data?.bySupplier.length ? (
                <p className="p-4 text-sm text-muted sm:p-5">لا توجد مبيعات ضمن الفلاتر.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {q.data.bySupplier.map((r) => (
                    <li key={r.vendorId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                      <button type="button" className="min-w-0 text-start" onClick={() => f.set({ supplierId: r.vendorId, productId: '' })}>
                        <span className="block font-medium hover:underline">{r.name}</span>
                        <span className="text-xs text-muted">
                          {r.units} وحدة · مبيعات {formatJOD(r.sales)} · مستحق المورد {formatJOD(r.supplierNet)}
                        </span>
                      </button>
                      <span className="text-end">
                        <b className="block tabular-nums">{formatJOD(r.fees)}</b>
                        <span className="text-xs text-muted">لفرجار</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <FeeByProduct rows={products} productHref={(id) => `/admin/products/${id}`} showSupplier />
          </div>
          <div className="mt-6">
            <FeeByOrder lines={q.data?.lines ?? []} orderHref={(l) => `/admin/orders/${l.orderId}`} showSupplier />
          </div>
        </>
      )}
    </AdminPage>
  );
}
