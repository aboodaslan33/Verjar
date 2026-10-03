import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import type { AdminProduct } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterSelect, SearchInput } from '../../components/admin/ui';
import { ApprovalTag } from '../../components/store/ProductEditorForm';
import { ButtonLink, Icon, Price } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function VendorProducts() {
  useDocumentTitle('منتجاتي');
  const f = useFilters(['q', 'approval'] as const);
  const list = useAdminQuery(
    () => api.get<Paged<AdminProduct>>('/vendor/products', { ...f.values, page: f.page, pageSize: 20 }),
    [JSON.stringify(f.values), f.page],
    { keep: true },
  );

  const columns: Column<AdminProduct>[] = [
    {
      key: 'name',
      header: 'المنتج',
      cell: (p) => (
        <span className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
            {p.media[0] && <img src={p.media[0].url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
          <span className="line-clamp-2">{p.name}</span>
        </span>
      ),
    },
    { key: 'approval', header: 'المراجعة', cell: (p) => <ApprovalTag status={p.approvalStatus} /> },
    { key: 'cat', header: 'القسم', cell: (p) => p.category?.name, hideOnMobile: true },
    { key: 'sp', header: 'سعر المورد', cell: (p) => <span className="tabular-nums">{formatJOD(p.pricing?.supplierPrice ?? p.supplierPrice)}</span> },
    { key: 'fee', header: 'نسبة فرجار', cell: (p) => <span dir="ltr" className="tabular-nums">{p.pricing?.feePercent ?? p.platformFeePercent}%</span> },
    { key: 'feeAmt', header: 'مبلغ فرجار', cell: (p) => <span className="tabular-nums">{formatJOD(p.pricing?.feeAmount ?? 0)}</span>, hideOnMobile: true },
    { key: 'price', header: 'سعر العميل', cell: (p) => <Price price={p.price} finalPrice={p.finalPrice} discountPercent={p.discountPercent} size="sm" /> },
    {
      key: 'sold',
      header: 'المباع / المتبقي',
      cell: (p) => (
        <span className="tabular-nums">
          بيع {p.soldUnits ?? 0} · باقي <span className={cx(p.stock <= 3 && 'font-bold text-danger')}>{p.stock}</span>
        </span>
      ),
    },
    { key: 'visible', header: 'الظهور', cell: (p) => (p.visible ? 'ظاهر' : <span className="text-muted">مخفي</span>), hideOnMobile: true },
  ];

  return (
    <AdminPage
      title="منتجاتي"
      description="سعر العميل = سعرك + نسبة فرجار، ويُحسب تلقائيًا. المنتجات الجديدة والتعديلات على المحتوى تظهر بعد موافقة الإدارة"
      actions={
        <ButtonLink to="/vendor/products/new" size="sm">
          <Icon name="plus" className="h-4 w-4" /> منتج جديد
        </ButtonLink>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="اسم المنتج…" />
        <FilterSelect label="المراجعة" value={f.values.approval} onChange={(e) => f.set({ approval: e.target.value })}>
          <option value="">كل الحالات</option>
          <option value="PENDING">بانتظار المراجعة</option>
          <option value="APPROVED">معتمد</option>
          <option value="REJECTED">مرفوض</option>
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(p) => p.id}
        rowHref={(p) => `/vendor/products/${p.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{
          title: f.active ? 'لا توجد منتجات مطابقة' : 'لا توجد منتجات بعد',
          action: (
            <ButtonLink to="/vendor/products/new" size="sm">
              أضف أول منتج
            </ButtonLink>
          ),
        }}
      />
    </AdminPage>
  );
}
