import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import type { AdminCategory, AdminProduct, ProductMedia } from '../../components/admin/types';
import { AdminPage, DetailSkeleton, FieldError, Panel } from '../../components/admin/ui';
import { Alert, Button, Checkbox, ErrorState, Icon, Input, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

function applyDiscount(price: number, pct: number) {
  return Math.round(price * (1 - Math.min(Math.max(pct, 0), 100) / 100) * 1000) / 1000;
}

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const cats = useAdminQuery(() => api.get<AdminCategory[]>('/admin/store/categories'), []);
  const prod = useAdminQuery(() => (id ? api.get<AdminProduct>(`/admin/store/products/${id}`) : Promise.resolve(null)), [id]);
  useDocumentTitle(isNew ? 'منتج جديد' : prod.data?.name ?? 'منتج');

  if ((!isNew && prod.loading) || cats.loading) return <DetailSkeleton />;
  if (prod.error || cats.error)
    return (
      <AdminPage title="المنتج" back={{ to: '/admin/products', label: 'المنتجات' }}>
        <ErrorState message={(prod.error ?? cats.error)!.message} onRetry={() => (prod.error ? prod.retry() : cats.retry())} />
      </AdminPage>
    );

  return <Editor key={prod.data?.id ?? 'new'} product={prod.data} categories={cats.data ?? []} onReload={prod.reload} />;
}

function Editor({ product, categories, onReload }: { product: AdminProduct | null; categories: AdminCategory[]; onReload: () => void }) {
  const navigate = useNavigate();
  const m = useMutation();
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [discount, setDiscount] = useState(product ? String(product.discountPercent) : '0');
  const [stock, setStock] = useState(product ? String(product.stock) : '0');
  const [visible, setVisible] = useState(product?.visible ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const priceN = Number(price) || 0;
  const discN = Math.round(Number(discount) || 0);
  const finalN = applyDiscount(priceN, discN);
  const discountInvalid = discN < 0 || discN > 90;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      categoryId,
      description: description.trim(),
      price: priceN,
      discountPercent: discN,
      stock: Math.round(Number(stock) || 0),
      visible,
      featured,
    };
    if (product) {
      const r = await m.run('save', () => api.patch<AdminProduct>(`/admin/store/products/${product.id}`, body), 'تم حفظ المنتج');
      if (r) onReload();
    } else {
      const r = await m.run('save', () => api.post<AdminProduct>('/admin/store/products', body), 'تم إنشاء المنتج — أضف الصور الآن');
      if (r) navigate(`/admin/products/${r.id}#media`, { replace: true });
    }
  };

  const del = async () => {
    if (!product) return;
    const r = await m.run('delete', () => api.del(`/admin/store/products/${product.id}`), 'تم حذف المنتج');
    if (r) navigate('/admin/products', { replace: true });
  };

  const fe = m.fieldErrors;

  return (
    <AdminPage
      back={{ to: '/admin/products', label: 'المنتجات' }}
      title={product ? product.name : 'منتج جديد'}
      actions={
        product && (
          <a href={`/store/${product.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <Icon name="external" className="h-4 w-4" /> عرض في المتجر
          </a>
        )
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="بيانات المنتج">
            <div className="space-y-4">
              <Input label="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} required />
              <Select label="التصنيف" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={fe.categoryId}>
                <option value="">اختر التصنيف</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.visible ? ' (مخفي)' : ''}
                  </option>
                ))}
              </Select>
              {categories.length === 0 && (
                <p className="text-sm text-muted">
                  لا توجد تصنيفات. <Link to="/admin/categories" className="underline">أضف تصنيفًا أولًا</Link>.
                </p>
              )}
              <Textarea label="الشرح" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} error={fe.description} />
            </div>
          </Panel>

          {product ? (
            <MediaManager product={product} onChanged={onReload} />
          ) : (
            <Panel title="الصور والفيديو">
              <p className="text-sm text-muted">احفظ المنتج أولًا، ثم أضف الصور والفيديو.</p>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="السعر والمخزون">
            <div className="space-y-4">
              <Input
                label="السعر (د.أ)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                className="ltr text-start"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                error={fe.price}
              />
              <Input
                label="نسبة الخصم %"
                type="number"
                inputMode="numeric"
                min={0}
                max={90}
                step={1}
                className="ltr text-start"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                error={fe.discountPercent ?? (discountInvalid ? 'الخصم بين 0 و 90%' : undefined)}
              />
              <div className="rounded-xl border border-line bg-subtle/50 p-3" aria-live="polite">
                <p className="text-xs text-muted">السعر للعميل</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-bold tabular-nums">{formatJOD(finalN)}</span>
                  {discN > 0 && priceN > 0 && !discountInvalid && (
                    <>
                      <s className="text-sm text-muted">{formatJOD(priceN)}</s>
                      <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-fg">خصم {discN}%</span>
                    </>
                  )}
                </div>
                {discN > 0 && priceN > 0 && !discountInvalid && (
                  <p className="mt-1 text-xs text-muted">يوفر العميل {formatJOD(priceN - finalN)}</p>
                )}
              </div>
              <Input
                label="الكمية في المخزون"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="ltr text-start"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                error={fe.stock}
              />
            </div>
          </Panel>
          <Panel title="الظهور">
            <div className="space-y-2">
              <Checkbox label="ظاهر في المتجر" checked={visible} onChange={setVisible} />
              <Checkbox label="منتج مميز" description="يظهر في الصفحة الرئيسية" checked={featured} onChange={setFeatured} />
            </div>
          </Panel>
          {m.error && !Object.keys(fe).length && <Alert tone="error">{m.error}</Alert>}
          <Button type="submit" block loading={m.pending === 'save'} disabled={discountInvalid}>
            {product ? 'حفظ التعديلات' : 'إنشاء المنتج'}
          </Button>
          {product && (
            <Button variant="outline" block className="text-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" className="h-4 w-4" /> حذف المنتج
            </Button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف المنتج"
        confirmLabel="حذف"
        loading={m.pending === 'delete'}
        onClose={() => setConfirmDelete(false)}
        onConfirm={del}
      >
        سيُحذف «{product?.name}» ويُخفى من المتجر. الطلبات السابقة تبقى كما هي.
      </ConfirmDialog>
    </AdminPage>
  );
}

function MediaManager({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const m = useMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [media, setMedia] = useState<ProductMedia[]>(product.media);
  const [pending, setPending] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const hasVideo = media.some((x) => x.kind === 'VIDEO');

  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [pending]);

  useEffect(() => {
    if (location.hash === '#media') document.getElementById('media')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const pick = (files: FileList | null) => {
    setError(undefined);
    const list = Array.from(files ?? []);
    const videos = list.filter((f) => f.type.startsWith('video/')).length;
    if (videos + (hasVideo ? 1 : 0) > 1) return setError('فيديو واحد فقط لكل منتج');
    const bad = list.find((f) => !f.type.startsWith('image/') && !f.type.startsWith('video/'));
    if (bad) return setError(`الملف ${bad.name} ليس صورة أو فيديو`);
    const big = list.find((f) => (f.type.startsWith('video/') ? f.size > 60 * 1024 * 1024 : f.size > 8 * 1024 * 1024));
    if (big) return setError(`الملف ${big.name} أكبر من الحد المسموح (الصورة 8MB، الفيديو 60MB)`);
    if (list.length > 10) return setError('الحد الأقصى 10 ملفات في المرة الواحدة');
    setPending(list);
  };

  const upload = async () => {
    const fd = new FormData();
    pending.forEach((f) => fd.append('files', f));
    const r = await m.run('upload', () => api.post<ProductMedia[]>(`/admin/store/products/${product.id}/media`, fd), 'تم رفع الملفات');
    if (r) {
      setMedia(r);
      setPending([]);
      if (inputRef.current) inputRef.current.value = '';
      onChanged();
    }
  };

  const remove = async (mediaId: string) => {
    const r = await m.run(`del-${mediaId}`, () => api.del(`/admin/store/products/${product.id}/media/${mediaId}`), 'تم حذف الملف');
    if (r) setMedia((x) => x.filter((i) => i.id !== mediaId));
  };

  const move = async (index: number, d: -1 | 1) => {
    const next = [...media];
    const j = index + d;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    const prev = media;
    setMedia(next);
    const r = await m.run('order', () => api.put<ProductMedia[]>(`/admin/store/products/${product.id}/media/order`, { ids: next.map((x) => x.id) }));
    if (r) setMedia(r);
    else setMedia(prev);
  };

  return (
    <Panel id="media" title={`الصور والفيديو (${media.length})`}>
      {media.length === 0 ? (
        <p className="mb-4 text-sm text-muted">لا توجد صور بعد. الصورة الأولى هي صورة الغلاف في المتجر.</p>
      ) : (
        <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((x, i) => (
            <li key={x.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="relative aspect-square bg-subtle">
                {x.kind === 'VIDEO' ? (
                  <video src={x.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={x.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
                {i === 0 && <span className="absolute start-1.5 top-1.5 rounded bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">الغلاف</span>}
                {x.kind === 'VIDEO' && <span className="absolute end-1.5 top-1.5 rounded bg-black/60 px-1.5 text-[11px] text-white">فيديو</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex">
                  <button type="button" disabled={i === 0 || m.busy} onClick={() => move(i, -1)} className="rounded-md p-1.5 text-muted hover:bg-subtle disabled:opacity-30" aria-label="تقديم">
                    <Icon name="chevronRight" className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={i === media.length - 1 || m.busy} onClick={() => move(i, 1)} className="rounded-md p-1.5 text-muted hover:bg-subtle disabled:opacity-30" aria-label="تأخير">
                    <Icon name="chevronLeft" className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={m.busy}
                  onClick={() => remove(x.id)}
                  className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                  aria-label="حذف"
                >
                  {m.pending === `del-${x.id}` ? (
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Icon name="trash" className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-line p-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
          <Icon name="upload" className="h-6 w-6 text-muted" />
          <span className="text-sm font-medium">اختر صورًا{hasVideo ? '' : ' أو فيديو واحد'}</span>
          <span className="text-xs text-muted">JPG / PNG / WebP حتى 8MB — فيديو MP4 حتى 60MB</span>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => pick(e.target.files)} />
        </label>
        <FieldError message={error} />
        {pending.length > 0 && (
          <div className="mt-4">
            <ul className="mb-3 flex flex-wrap gap-2">
              {pending.map((f, i) => (
                <li key={i} className="h-16 w-16 overflow-hidden rounded-lg border border-line bg-subtle">
                  {f.type.startsWith('image/') ? (
                    <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full place-items-center text-[11px] text-muted">فيديو</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" loading={m.pending === 'upload'} onClick={upload}>
                رفع {pending.length} {pending.length === 1 ? 'ملف' : 'ملفات'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPending([]);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className={cx('mt-2 text-xs text-muted')}>استخدم الأسهم لترتيب الصور. الترتيب يُحفظ فورًا.</p>
    </Panel>
  );
}
