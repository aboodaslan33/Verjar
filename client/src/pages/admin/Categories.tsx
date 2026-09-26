import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import type { AdminCategory } from '../../components/admin/types';
import { AdminPage, Panel, Switch } from '../../components/admin/ui';
import { Button, EmptyState, ErrorState, Icon, SkeletonRows } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Categories() {
  useDocumentTitle('التصنيفات');
  const q = useAdminQuery(() => api.get<AdminCategory[]>('/admin/store/categories'), []);
  const m = useMutation();
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminCategory | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const nextOrder = sortOrder !== '' ? Number(sortOrder) : Math.max(0, ...(q.data ?? []).map((c) => c.sortOrder)) + 1;
    const r = await m.run('create', () => api.post('/admin/store/categories', { name: name.trim(), sortOrder: nextOrder, visible: true }), 'تمت إضافة التصنيف');
    if (r) {
      setName('');
      setSortOrder('');
      q.reload();
    }
  };

  const toggleVisible = async (c: AdminCategory) => {
    const r = await m.run(`vis-${c.id}`, () => api.patch(`/admin/store/categories/${c.id}`, { visible: !c.visible }), c.visible ? 'تم إخفاء التصنيف' : 'التصنيف ظاهر');
    if (r) q.setData((d) => d?.map((x) => (x.id === c.id ? { ...x, visible: !c.visible } : x)) ?? d);
  };

  return (
    <AdminPage title="التصنيفات" description="تصنيفات منتجات المتجر وترتيب ظهورها">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {q.loading ? (
            <SkeletonRows rows={4} />
          ) : q.error ? (
            <ErrorState message={q.error.message} onRetry={q.retry} />
          ) : !q.data?.length ? (
            <EmptyState title="لا توجد تصنيفات" description="أضف أول تصنيف من النموذج." />
          ) : (
            <div className="card overflow-hidden">
              <div className="hidden grid-cols-[4rem_1fr_6rem_5rem_7rem] gap-3 border-b border-line bg-subtle/60 px-4 py-2.5 text-xs text-muted sm:grid">
                <span>الترتيب</span>
                <span>الاسم</span>
                <span>المنتجات</span>
                <span>ظاهر</span>
                <span />
              </div>
              <ul className="divide-y divide-line">
                {q.data.map((c) =>
                  editing === c.id ? (
                    <EditRow
                      key={c.id}
                      cat={c}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        q.reload();
                      }}
                    />
                  ) : (
                    <li key={c.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[4rem_1fr_6rem_5rem_7rem]">
                      <span className="tabular-nums text-muted">{c.sortOrder}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="text-xs text-muted sm:hidden">{c.productCount} منتج</span>
                      </span>
                      <Link to={`/admin/products?categoryId=${c.id}`} className="hidden text-sm text-muted hover:text-ink hover:underline sm:block">
                        {c.productCount} منتج
                      </Link>
                      <span className="hidden sm:block">
                        <Switch label="ظاهر" checked={c.visible} disabled={m.pending === `vis-${c.id}`} onChange={() => toggleVisible(c)} />
                      </span>
                      <span className="flex justify-end gap-1">
                        <span className="sm:hidden">
                          <Switch label="ظاهر" checked={c.visible} disabled={m.pending === `vis-${c.id}`} onChange={() => toggleVisible(c)} />
                        </span>
                        <button type="button" onClick={() => setEditing(c.id)} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-ink">
                          تعديل
                        </button>
                        <button type="button" onClick={() => setConfirm(c)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`حذف ${c.name}`}>
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </div>
        <Panel title="تصنيف جديد">
          <form onSubmit={create} className="space-y-3" noValidate>
            <div>
              <label className="label" htmlFor="cat-name">
                الاسم
              </label>
              <input id="cat-name" className={`input ${m.fieldErrors.name ? 'input-error' : ''}`} value={name} onChange={(e) => setName(e.target.value)} />
              {m.pending !== 'create' && m.fieldErrors.name && <p className="mt-1.5 text-sm text-danger">{m.fieldErrors.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor="cat-order">
                الترتيب <span className="text-xs font-normal text-muted">(اختياري)</span>
              </label>
              <input id="cat-order" type="number" className="input ltr text-start" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <Button type="submit" size="sm" loading={m.pending === 'create'} disabled={name.trim().length < 2}>
              <Icon name="plus" className="h-4 w-4" /> إضافة
            </Button>
          </form>
        </Panel>
      </div>
      <ConfirmDialog
        open={!!confirm}
        title="حذف التصنيف"
        confirmLabel="حذف"
        loading={m.pending === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          const r = await m.run('delete', () => api.del(`/admin/store/categories/${confirm.id}`), 'تم حذف التصنيف');
          setConfirm(null);
          if (r) q.reload();
        }}
      >
        {confirm && confirm.productCount > 0
          ? `هذا التصنيف يحتوي ${confirm.productCount} منتج، ولا يمكن حذفه قبل نقل المنتجات إلى تصنيف آخر.`
          : `حذف تصنيف «${confirm?.name}»؟`}
      </ConfirmDialog>
    </AdminPage>
  );
}

function EditRow({ cat, onCancel, onSaved }: { cat: AdminCategory; onCancel: () => void; onSaved: () => void }) {
  const m = useMutation();
  const [name, setName] = useState(cat.name);
  const [order, setOrder] = useState(String(cat.sortOrder));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run('save', () => api.patch(`/admin/store/categories/${cat.id}`, { name: name.trim(), sortOrder: Number(order) || 0 }), 'تم حفظ التصنيف');
    if (r) onSaved();
  };
  return (
    <li className="bg-subtle/40 px-4 py-3">
      <form onSubmit={save} className="flex flex-wrap items-start gap-2">
        <input type="number" aria-label="الترتيب" className="input h-10 w-20 py-0 text-sm ltr" value={order} onChange={(e) => setOrder(e.target.value)} />
        <div className="min-w-[10rem] flex-1">
          <input aria-label="الاسم" className="input h-10 py-0 text-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {m.fieldErrors.name && <p className="mt-1 text-xs text-danger">{m.fieldErrors.name}</p>}
        </div>
        <Button type="submit" size="sm" loading={m.pending === 'save'}>
          حفظ
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </form>
    </li>
  );
}
