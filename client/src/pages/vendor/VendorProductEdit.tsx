import { useParams } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import type { AdminProduct } from '../../components/admin/types';
import { AdminPage, DetailSkeleton } from '../../components/admin/ui';
import { ProductEditorForm, type EditorCategory, type EditorMode } from '../../components/store/ProductEditorForm';
import { ErrorState } from '../../components/ui';
import { api } from '../../lib/api';
import type { SpecField } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const MODE: EditorMode = {
  kind: 'vendor',
  apiBase: '/vendor',
  listPath: '/vendor/products',
  editPath: (id) => `/vendor/products/${id}`,
  categoriesPath: '/vendor/categories',
};

type VendorCategory = { id: string; name: string; parentId: string | null; parentName: string | null; fields: SpecField[] };

export default function VendorProductEdit() {
  const { id } = useParams();
  const cats = useAdminQuery(() => api.get<VendorCategory[]>(MODE.categoriesPath), []);
  const prod = useAdminQuery(() => (id ? api.get<AdminProduct>(`/vendor/products/${id}`) : Promise.resolve(null)), [id]);
  useDocumentTitle(id ? prod.data?.name ?? 'منتج' : 'منتج جديد');

  if ((id && prod.loading) || cats.loading) return <DetailSkeleton />;
  if (prod.error || cats.error)
    return (
      <AdminPage title="المنتج" back={{ to: MODE.listPath, label: 'المنتجات' }}>
        <ErrorState message={(prod.error ?? cats.error)!.message} onRetry={() => (prod.error ? prod.retry() : cats.retry())} />
      </AdminPage>
    );

  // الأقسام الرئيسية أولًا ثم فروعها
  const list = cats.data ?? [];
  const categories: EditorCategory[] = list
    .filter((c) => !c.parentId)
    .flatMap((top) => [
      { id: top.id, label: top.name, visible: true, fields: top.fields },
      ...list.filter((c) => c.parentId === top.id).map((c) => ({ id: c.id, label: `${top.name} / ${c.name}`, visible: true, fields: c.fields })),
    ]);

  return <ProductEditorForm key={prod.data?.id ?? 'new'} mode={MODE} product={prod.data} categories={categories} onReload={prod.reload} />;
}
