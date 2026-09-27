import { useParams } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import type { AdminCategory, AdminProduct } from '../../components/admin/types';
import { AdminPage, DetailSkeleton } from '../../components/admin/ui';
import { ProductEditorForm, type EditorCategory, type EditorMode } from '../../components/store/ProductEditorForm';
import { ErrorState } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';

const MODE: EditorMode = {
  kind: 'admin',
  apiBase: '/admin/store',
  listPath: '/admin/products',
  editPath: (id) => `/admin/products/${id}`,
  categoriesPath: '/admin/store/categories',
};

/** الأقسام بصيغة المحرر: الفرعي يرث حقول القسم الرئيسي */
export function editorCategories(cats: AdminCategory[]): EditorCategory[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const tops = cats.filter((c) => !c.parentId);
  return tops.flatMap((top) => [
    { id: top.id, label: top.name, visible: top.visible, fields: top.specFields },
    ...cats
      .filter((c) => c.parentId === top.id)
      .map((c) => {
        const merged = new Map([...(byId.get(top.id)?.specFields ?? []), ...c.specFields].map((f) => [f.key, f]));
        return { id: c.id, label: `${top.name} / ${c.name}`, visible: c.visible && top.visible, fields: [...merged.values()] };
      }),
  ]);
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const cats = useAdminQuery(() => api.get<AdminCategory[]>(MODE.categoriesPath), []);
  const prod = useAdminQuery(() => (id ? api.get<AdminProduct>(`/admin/store/products/${id}`) : Promise.resolve(null)), [id]);
  useDocumentTitle(isNew ? 'منتج جديد' : prod.data?.name ?? 'منتج');

  if ((!isNew && prod.loading) || cats.loading) return <DetailSkeleton />;
  if (prod.error || cats.error)
    return (
      <AdminPage title="المنتج" back={{ to: '/admin/products', label: 'المنتجات' }}>
        <ErrorState message={(prod.error ?? cats.error)!.message} onRetry={() => (prod.error ? prod.retry() : cats.retry())} />
      </AdminPage>
    );

  return <ProductEditorForm key={prod.data?.id ?? 'new'} mode={MODE} product={prod.data} categories={editorCategories(cats.data ?? [])} onReload={prod.reload} />;
}
