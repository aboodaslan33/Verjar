import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import type { AdminCategory } from '../../components/admin/types';
import { AdminPage, Panel, Switch } from '../../components/admin/ui';
import { Button, Checkbox, EmptyState, ErrorState, Icon, Input, Select, SkeletonRows, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import type { SpecField } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const TYPE_LABEL: Record<SpecField['type'], string> = { text: 'نص', number: 'رقم', select: 'قائمة خيارات' };

/** مفتاح إنجليزي من اسم الحقل (يمكن تعديله) */
function suggestKey(label: string, taken: string[]) {
  const known: Record<string, string> = { المقاس: 'size', اللون: 'color', الوزن: 'weight', المادة: 'material', الأبعاد: 'dimensions', المؤلف: 'author', الماركة: 'brand' };
  let base = known[label.trim()] ?? 'field';
  if (!/^[a-z]/.test(base)) base = 'field';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

export default function Categories() {
  useDocumentTitle('الأقسام');
  const q = useAdminQuery(() => api.get<AdminCategory[]>('/admin/store/categories'), []);
  const m = useMutation();
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);
  const [newParent, setNewParent] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminCategory | null>(null);

  const cats = q.data ?? [];
  const tops = cats.filter((c) => !c.parentId);
  const childrenOf = (id: string) => cats.filter((c) => c.parentId === id);

  const toggleVisible = async (c: AdminCategory) => {
    const r = await m.run(`vis-${c.id}`, () => api.patch(`/admin/store/categories/${c.id}`, { visible: !c.visible }), c.visible ? 'تم إخفاء القسم' : 'القسم ظاهر');
    if (r) q.setData((d) => d?.map((x) => (x.id === c.id ? { ...x, visible: !c.visible } : x)) ?? d);
  };

  const startNew = (parentId: string | null) => {
    setNewParent(parentId);
    setEditing('new');
  };

  const row = (c: AdminCategory, child = false) => (
    <li key={c.id} className={cx('flex items-center gap-3 px-4 py-3', child && 'bg-subtle/40 ps-10')}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cx('truncate', child ? 'text-[15px]' : 'font-semibold')}>{c.name}</span>
          {c.specFields.length > 0 && <Tag>{c.specFields.length} مواصفات</Tag>}
          {!c.visible && <Tag tone="danger">مخفي</Tag>}
        </span>
        <Link to={`/admin/products?categoryId=${c.id}`} className="text-xs text-muted hover:text-ink hover:underline">
          {c.productCount} منتج{!child && c.childCount > 0 ? ` · ${c.childCount} أقسام فرعية` : ''}
        </Link>
      </span>
      <Switch label="ظاهر" checked={c.visible} disabled={m.pending === `vis-${c.id}`} onChange={() => toggleVisible(c)} />
      {!child && (
        <button type="button" onClick={() => startNew(c.id)} className="hidden rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-ink sm:block">
          + فرعي
        </button>
      )}
      <button type="button" onClick={() => setEditing(c)} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-ink">
        تعديل
      </button>
      <button type="button" onClick={() => setConfirm(c)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`حذف ${c.name}`}>
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </li>
  );

  return (
    <AdminPage
      title="الأقسام"
      description="أقسام السوق وأقسامها الفرعية، وحقول المواصفات التي يعبّئها الموردون لكل قسم (مثل المقاس للملابس)"
      actions={
        <Button size="sm" onClick={() => startNew(null)}>
          <Icon name="plus" className="h-4 w-4" /> قسم جديد
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {q.loading ? (
            <SkeletonRows rows={4} />
          ) : q.error ? (
            <ErrorState message={q.error.message} onRetry={q.retry} />
          ) : !tops.length ? (
            <EmptyState title="لا توجد أقسام" description="أضف أول قسم، مثل: ملابس، قصص، مواد بناء." />
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {tops.map((t) => (
                <li key={t.id}>
                  <ul className="divide-y divide-line">
                    {row(t)}
                    {childrenOf(t.id).map((c) => row(c, true))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="lg:col-span-2">
          {editing ? (
            <CategoryForm
              key={editing === 'new' ? `new-${newParent}` : editing.id}
              category={editing === 'new' ? null : editing}
              defaultParent={newParent}
              tops={tops}
              nextOrder={Math.max(0, ...cats.map((c) => c.sortOrder)) + 1}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                q.reload();
              }}
            />
          ) : (
            <Panel title="كيف تعمل الأقسام">
              <ul className="list-disc space-y-2 ps-5 text-sm text-muted">
                <li>القسم الرئيسي مثل «ملابس»، وتحته أقسام فرعية مثل «رجالي» و«نسائي».</li>
                <li>حقول المواصفات في القسم الرئيسي تنطبق على كل أقسامه الفرعية.</li>
                <li>إخفاء قسم رئيسي يخفي منتجات أقسامه الفرعية أيضًا.</li>
              </ul>
            </Panel>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        title="حذف القسم"
        confirmLabel="حذف"
        loading={m.pending === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          const r = await m.run('delete', () => api.del(`/admin/store/categories/${confirm.id}`), 'تم حذف القسم');
          setConfirm(null);
          if (r) q.reload();
        }}
      >
        {confirm && confirm.productCount > 0
          ? `هذا القسم يحتوي ${confirm.productCount} منتج، ولا يمكن حذفه قبل نقل المنتجات. يمكنك إخفاؤه بدلًا من ذلك.`
          : confirm && confirm.childCount > 0
            ? `هذا القسم له ${confirm.childCount} أقسام فرعية، احذفها أو انقلها أولًا.`
            : `حذف قسم «${confirm?.name}»؟`}
      </ConfirmDialog>
    </AdminPage>
  );
}

type FieldDraft = SpecField & { optionsText: string };

function CategoryForm({
  category,
  defaultParent,
  tops,
  nextOrder,
  onCancel,
  onSaved,
}: {
  category: AdminCategory | null;
  defaultParent: string | null;
  tops: AdminCategory[];
  nextOrder: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const m = useMutation();
  const [name, setName] = useState(category?.name ?? '');
  const [parentId, setParentId] = useState(category ? category.parentId ?? '' : defaultParent ?? '');
  const [order, setOrder] = useState(String(category?.sortOrder ?? nextOrder));
  const [fields, setFields] = useState<FieldDraft[]>(() => (category?.specFields ?? []).map((f) => ({ ...f, optionsText: f.options.join('، ') })));
  const parentFields = tops.find((t) => t.id === parentId)?.specFields ?? [];
  // القسم الذي له أقسام فرعية لا يصبح فرعيًا
  const canHaveParent = !category || category.childCount === 0;

  const update = (i: number, patch: Partial<FieldDraft>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () =>
    setFields((fs) => [...fs, { key: suggestKey('', fs.map((f) => f.key)), label: '', type: 'text', options: [], optionsText: '', required: false }]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      parentId: parentId || null,
      sortOrder: Number(order) || 0,
      specFields: fields.map(({ optionsText, ...f }) => ({
        ...f,
        key: f.key.trim(),
        label: f.label.trim(),
        options: f.type === 'select' ? optionsText.split(/[،,\n]/).map((o) => o.trim()).filter(Boolean) : [],
      })),
    };
    const r = await m.run(
      'save',
      () => (category ? api.patch(`/admin/store/categories/${category.id}`, body) : api.post('/admin/store/categories', { ...body, visible: true })),
      category ? 'تم حفظ القسم' : 'تمت إضافة القسم',
    );
    if (r) onSaved();
  };

  const fe = m.fieldErrors;
  return (
    <Panel title={category ? `تعديل: ${category.name}` : parentId ? 'قسم فرعي جديد' : 'قسم جديد'}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <Input label="اسم القسم" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} autoFocus />
        {canHaveParent && (
          <Select label="القسم الرئيسي" value={parentId} onChange={(e) => setParentId(e.target.value)} error={fe.parentId}>
            <option value="">— قسم رئيسي —</option>
            {tops
              .filter((t) => t.id !== category?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        )}
        <Input label="الترتيب" type="number" className="ltr text-start" value={order} onChange={(e) => setOrder(e.target.value)} />

        <div>
          <p className="label">حقول المواصفات</p>
          {parentFields.length > 0 && (
            <p className="mb-2 text-xs text-muted">موروثة من القسم الرئيسي: {parentFields.map((f) => f.label).join('، ')}</p>
          )}
          {fe.specFields && <p className="mb-2 text-sm text-danger">{fe.specFields}</p>}
          <ul className="space-y-3">
            {fields.map((f, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    label="اسم الحقل"
                    placeholder="المقاس"
                    value={f.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      // مفتاح تلقائي ما دام الأدمن لم يكتب مفتاحًا بنفسه
                      const auto = /^field(_\d+)?$/.test(f.key);
                      update(i, { label, ...(auto ? { key: suggestKey(label, fields.filter((_, j) => j !== i).map((x) => x.key)) } : {}) });
                    }}
                    error={fe[`specFields.${i}.label`]}
                  />
                  <Input
                    label="المفتاح (إنجليزي)"
                    className="ltr text-start"
                    value={f.key}
                    onChange={(e) => update(i, { key: e.target.value.toLowerCase() })}
                    error={fe[`specFields.${i}.key`]}
                  />
                  <Select label="النوع" value={f.type} onChange={(e) => update(i, { type: e.target.value as SpecField['type'] })}>
                    {(Object.keys(TYPE_LABEL) as SpecField['type'][]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-end pb-2">
                    <Checkbox label="إلزامي" checked={f.required} onChange={(v) => update(i, { required: v })} />
                  </div>
                </div>
                {f.type === 'select' && (
                  <Input
                    wrapperClassName="mt-2"
                    label="الخيارات (افصل بفاصلة)"
                    placeholder="S، M، L، XL"
                    value={f.optionsText}
                    onChange={(e) => update(i, { optionsText: e.target.value })}
                    error={fe[`specFields.${i}.options`]}
                  />
                )}
                <button type="button" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} className="mt-2 text-sm text-danger hover:underline">
                  حذف الحقل
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="mt-3" onClick={add} disabled={fields.length >= 20}>
            <Icon name="plus" className="h-4 w-4" /> حقل مواصفات
          </Button>
        </div>

        <div className="flex gap-2 border-t border-line pt-4">
          <Button type="submit" size="sm" loading={m.pending === 'save'} disabled={name.trim().length < 2}>
            {category ? 'حفظ' : 'إضافة'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </div>
      </form>
    </Panel>
  );
}
