import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import type { AdminCategory, AdminProduct } from '../../components/admin/types';
import { AdminPage, FilterBar, FilterSelect, SearchInput, Switch } from '../../components/admin/ui';
import { ApprovalTag } from '../../components/store/ProductEditorForm';
import type { AdminVendor } from '../../components/admin/types';
import { editorCategories } from './ProductEditor';
import { Button, ButtonLink, Icon, Price, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KEYS = ['q', 'categoryId', 'visible', 'lowStock', 'approval', 'vendorId', 'feeMin', 'feeMax', 'feeRequest'] as const;

/** نطاقات نسبة فرجار في الفلتر */
const FEE_RANGES = [
  { value: '0-2', label: 'حتى 2%' },
  { value: '2.01-5', label: 'أكثر من 2% حتى 5%' },
  { value: '5.01-10', label: 'أكثر من 5% حتى 10%' },
  { value: '10.01-50', label: 'أكثر من 10%' },
];
const LOW_STOCK = 3;

export default function Products() {
  useDocumentTitle('المنتجات');
  const f = useFilters(KEYS);
  const { values: v, page } = f;
  const cats = useAdminQuery(() => api.get<AdminCategory[]>('/admin/store/categories'), []);
  const vendors = useAdminQuery(() => api.get<AdminVendor[]>('/admin/vendors'), []);
  const list = useAdminQuery(
    () => api.get<Paged<AdminProduct>>('/admin/store/products', { ...v, page, pageSize: 20 }),
    [JSON.stringify(v), page],
    { keep: true },
  );
  const m = useMutation();

  const toggle = async (p: AdminProduct, key: 'visible' | 'featured') => {
    const next = !p[key];
    const patch = (val: boolean) =>
      list.setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === p.id ? { ...x, [key]: val } : x)) } : d));
    patch(next);
    const r = await m.run(
      `${key}-${p.id}`,
      () => api.patch(`/admin/store/products/${p.id}`, { [key]: next }),
      key === 'visible' ? (next ? 'المنتج ظاهر في المتجر' : 'تم إخفاء المنتج') : next ? 'أُضيف للمميز' : 'أُزيل من المميز',
    );
    if (!r) patch(!next);
  };

  const columns: Column<AdminProduct>[] = [
    {
      key: 'name',
      header: 'المنتج',
      cell: (p) => (
        <span className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
            {p.media[0]?.kind === 'IMAGE' && <img src={p.media[0].url} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2">{p.name}</span>
            {p.approvalStatus !== 'APPROVED' && (
              <span className="mt-1 block">
                <ApprovalTag status={p.approvalStatus} />
              </span>
            )}
          </span>
        </span>
      ),
    },
    { key: 'vendor', header: 'المورد', cell: (p) => (p.vendor?.isHouse ? <span className="text-muted">{p.vendor.name}</span> : p.vendor?.name) },
    { key: 'cat', header: 'القسم', cell: (p) => p.category?.name },
    { key: 'sp', header: 'سعر المورد', cell: (p) => <span className="tabular-nums">{formatJOD(p.supplierPrice)}</span>, hideOnMobile: true },
    {
      key: 'fee',
      header: 'نسبة فرجار',
      cell: (p) =>
        p.vendor?.isHouse ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="tabular-nums">
            <span dir="ltr">{p.platformFeePercent}%</span>
            <span className="block text-xs text-muted">{formatJOD(p.pricing?.feeAmount ?? 0)}</span>
            {p.feeRequestPercent != null && (
              <span className="mt-1 block">
                <Tag tone="brand">
                  طلب <span dir="ltr">{p.feeRequestPercent}%</span>
                </Tag>
              </span>
            )}
          </span>
        ),
    },
    { key: 'price', header: 'سعر العميل', cell: (p) => <Price price={p.price} finalPrice={p.finalPrice} discountPercent={p.discountPercent} size="sm" /> },
    {
      key: 'stock',
      header: 'المباع / المتبقي',
      cell: (p) => (
        <span className="tabular-nums">
          بيع {p.soldUnits ?? 0} ·{' '}
          <span className={cx(p.stock <= LOW_STOCK && 'font-bold text-danger')}>
            باقي {p.stock}
            {p.stock === 0 ? ' (نفد)' : p.stock <= LOW_STOCK ? ' (منخفض)' : ''}
          </span>
          {!p.vendor?.isHouse && (p.soldFees ?? 0) > 0 && <span className="block text-xs text-muted">لفرجار {formatJOD(p.soldFees ?? 0)}</span>}
        </span>
      ),
    },
    {
      key: 'visible',
      header: 'ظاهر',
      cell: (p) => <Switch label="ظاهر في المتجر" checked={p.visible} disabled={m.pending === `visible-${p.id}`} onChange={() => toggle(p, 'visible')} />,
    },
    {
      key: 'featured',
      header: 'مميز',
      cell: (p) => <Switch label="منتج مميز" checked={p.featured} disabled={m.pending === `featured-${p.id}`} onChange={() => toggle(p, 'featured')} />,
    },
  ];

  return (
    <AdminPage
      title="المنتجات"
      description="منتجات السوق من كل الموردين: المراجعة، نسبة فرجار لكل منتج، الأسعار، والمخزون"
      actions={
        <ButtonLink to="/admin/products/new" size="sm">
          <Icon name="plus" className="h-4 w-4" /> منتج جديد
        </ButtonLink>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={v.q} onChange={(q) => f.set({ q })} placeholder="اسم المنتج…" />
        <FilterSelect label="المراجعة" value={v.approval} onChange={(e) => f.set({ approval: e.target.value })}>
          <option value="">كل الحالات</option>
          <option value="PENDING">بانتظار المراجعة</option>
          <option value="APPROVED">معتمد</option>
          <option value="REJECTED">مرفوض</option>
        </FilterSelect>
        <FilterSelect label="المورد" value={v.vendorId} onChange={(e) => f.set({ vendorId: e.target.value })}>
          <option value="">كل الموردين</option>
          {vendors.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="نسبة فرجار"
          value={v.feeRequest ? 'req' : v.feeMin || v.feeMax ? `${v.feeMin}-${v.feeMax}` : ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'req') f.set({ feeRequest: 'true', feeMin: '', feeMax: '' });
            else {
              const [min = '', max = ''] = val ? val.split('-') : [];
              f.set({ feeRequest: '', feeMin: min, feeMax: max });
            }
          }}
        >
          <option value="">كل النسب</option>
          {FEE_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
          <option value="req">طلبات تغيير معلّقة</option>
        </FilterSelect>
        <FilterSelect label="القسم" value={v.categoryId} onChange={(e) => f.set({ categoryId: e.target.value })}>
          <option value="">كل الأقسام</option>
          {editorCategories(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="الظهور" value={v.visible} onChange={(e) => f.set({ visible: e.target.value })}>
          <option value="">الكل</option>
          <option value="true">ظاهر</option>
          <option value="false">مخفي</option>
        </FilterSelect>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm">
          <input type="checkbox" className="accent-brand-700" checked={v.lowStock === 'true'} onChange={(e) => f.set({ lowStock: e.target.checked ? 'true' : '' })} />
          مخزون منخفض فقط
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(p) => p.id}
        rowHref={(p) => `/admin/products/${p.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        rowClassName={(p) => (!p.visible ? 'opacity-70' : undefined)}
        empty={{
          title: f.active ? 'لا توجد منتجات مطابقة' : 'لا توجد منتجات بعد',
          action: f.active ? (
            <Button variant="outline" size="sm" onClick={f.clear}>
              مسح الفلاتر
            </Button>
          ) : (
            <ButtonLink to="/admin/products/new" size="sm">
              إضافة أول منتج
            </ButtonLink>
          ),
        }}
      />
      {list.data && list.data.items.some((p) => !p.visible) && (
        <p className="mt-3 text-xs text-muted">
          <Tag>مخفي</Tag> المنتجات المخفية لا تظهر للزوار.
        </p>
      )}
    </AdminPage>
  );
}
