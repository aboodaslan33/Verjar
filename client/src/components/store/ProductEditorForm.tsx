import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../admin/ConfirmDialog';
import { useMutation } from '../admin/hooks';
import type { AdminProduct, ProductMedia } from '../admin/types';
import { AdminPage, FieldError, Panel } from '../admin/ui';
import { Alert, Button, ButtonLink, Checkbox, Icon, Input, Select, Tag, Textarea } from '../ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import type { SpecField } from '../../lib/types';

function applyDiscount(price: number, pct: number) {
  return Math.round(price * (1 - Math.min(Math.max(pct, 0), 100) / 100) * 1000) / 1000;
}

/** قسم كما يظهر في محرر المنتج: الاسم الكامل (رئيسي / فرعي) وحقول المواصفات الفعلية */
export type EditorCategory = { id: string; label: string; visible: boolean; fields: SpecField[] };

/** إعدادات المحرر حسب من يستخدمه (الأدمن أو المورد) */
export type EditorMode = {
  kind: 'admin' | 'vendor';
  /** أساس مسارات الـ API للمنتجات: /admin/store أو /vendor */
  apiBase: string;
  listPath: string;
  editPath: (id: string) => string;
  categoriesPath: string;
};

export const APPROVAL_LABEL = { PENDING: 'بانتظار المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض' } as const;

export function ApprovalTag({ status }: { status: AdminProduct['approvalStatus'] }) {
  return <Tag tone={status === 'APPROVED' ? 'sand' : status === 'REJECTED' ? 'danger' : 'brand'}>{APPROVAL_LABEL[status]}</Tag>;
}

/** حقول المواصفات حسب القسم */
export function SpecInputs({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: SpecField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  errors: Record<string, string>;
}) {
  if (!fields.length) return <p className="text-sm text-muted">لا توجد مواصفات مطلوبة لهذا القسم.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const label = `${f.label}${f.required ? '' : ' (اختياري)'}`;
        const err = errors[`specs.${f.key}`];
        return f.type === 'select' ? (
          <Select key={f.key} label={label} value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)} error={err}>
            <option value="">اختر</option>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            key={f.key}
            label={label}
            type={f.type === 'number' ? 'number' : 'text'}
            inputMode={f.type === 'number' ? 'decimal' : undefined}
            className={f.type === 'number' ? 'ltr text-start' : undefined}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            error={err}
          />
        );
      })}
    </div>
  );
}

export function ProductEditorForm({
  mode,
  product,
  categories,
  onReload,
}: {
  mode: EditorMode;
  product: AdminProduct | null;
  categories: EditorCategory[];
  onReload: () => void;
}) {
  const isAdmin = mode.kind === 'admin';
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
  const [specs, setSpecs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(product?.specs ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const fields = categories.find((c) => c.id === categoryId)?.fields ?? [];

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
      ...(isAdmin ? { featured } : {}),
      // فقط حقول القسم الحالي تُرسل
      specs: Object.fromEntries(fields.map((f) => [f.key, specs[f.key] ?? ''])),
    };
    if (product) {
      const r = await m.run('save', () => api.patch<AdminProduct>(`${mode.apiBase}/products/${product.id}`, body), 'تم حفظ المنتج');
      if (r) onReload();
    } else {
      const r = await m.run(
        'save',
        () => api.post<AdminProduct>(`${mode.apiBase}/products`, body),
        isAdmin ? 'تم إنشاء المنتج — أضف الصور الآن' : 'تم إنشاء المنتج — أضف الصور، ثم ينتظر موافقة الإدارة',
      );
      if (r) navigate(`${mode.editPath(r.id)}#media`, { replace: true });
    }
  };

  const del = async () => {
    if (!product) return;
    const r = await m.run('delete', () => api.del(`${mode.apiBase}/products/${product.id}`), 'تم حذف المنتج');
    if (r) navigate(mode.listPath, { replace: true });
  };

  const approve = async () => {
    if (!product) return;
    const r = await m.run('approve', () => api.post(`/admin/store/products/${product.id}/approve`), 'تم اعتماد المنتج — ظاهر في المتجر');
    if (r) onReload();
  };

  const reject = async () => {
    if (!product) return;
    const r = await m.run('reject', () => api.post(`/admin/store/products/${product.id}/reject`, { reason: reason.trim() }), 'تم رفض المنتج');
    if (r) {
      setRejecting(false);
      setReason('');
      onReload();
    }
  };

  const fe = m.fieldErrors;

  return (
    <AdminPage
      back={{ to: mode.listPath, label: 'المنتجات' }}
      title={product ? product.name : 'منتج جديد'}
      meta={
        product && (
          <>
            <ApprovalTag status={product.approvalStatus} />
            {isAdmin && product.vendor && !product.vendor.isHouse && <Tag>المورد: {product.vendor.name}</Tag>}
          </>
        )
      }
      actions={
        product && (
          <>
            {product.approvalStatus === 'APPROVED' && (
              <a href={`/store/${product.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                <Icon name="external" className="h-4 w-4" /> عرض في المتجر
              </a>
            )}
            {isAdmin && product.visible && product.approvalStatus === 'APPROVED' && (
              <ButtonLink to={`/admin/newsletter?product=${product.id}`} variant="outline" size="sm">
                أعلن عنه بالبريد
              </ButtonLink>
            )}
          </>
        )
      }
    >
      {product?.approvalStatus === 'REJECTED' && product.rejectionReason && (
        <Alert tone="error" className="mb-6">
          سبب الرفض: {product.rejectionReason}
          {!isAdmin && ' — عدّل المنتج واحفظه ليُعاد إرساله للمراجعة.'}
        </Alert>
      )}
      {product?.approvalStatus === 'PENDING' && !isAdmin && (
        <Alert tone="info" className="mb-6">
          المنتج بانتظار موافقة الإدارة ولن يظهر في المتجر قبلها. تعديل الاسم أو الوصف أو القسم أو المواصفات أو الصور يعيده للمراجعة.
        </Alert>
      )}
      {isAdmin && product && product.approvalStatus !== 'APPROVED' && (
        <Panel title="مراجعة المنتج" className="mb-6">
          {rejecting ? (
            <div className="space-y-3">
              <Textarea label="سبب الرفض (يظهر للمورد)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={m.fieldErrors.reason} />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={m.pending === 'reject'} disabled={reason.trim().length < 3} onClick={reject}>
                  رفض المنتج
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="me-auto text-sm text-muted">راجع البيانات والصور، ثم اعتمد المنتج ليظهر في المتجر أو ارفضه مع ذكر السبب.</p>
              <Button size="sm" loading={m.pending === 'approve'} onClick={approve}>
                <Icon name="check" className="h-4 w-4" /> اعتماد
              </Button>
              {product.approvalStatus === 'PENDING' && (
                <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  رفض
                </Button>
              )}
            </div>
          )}
        </Panel>
      )}
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="بيانات المنتج">
            <div className="space-y-4">
              <Input label="اسم المنتج" value={name} onChange={(e) => setName(e.target.value)} error={fe.name} required />
              <Select label="القسم" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={fe.categoryId}>
                <option value="">اختر القسم</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {!c.visible ? ' (مخفي)' : ''}
                  </option>
                ))}
              </Select>
              {categories.length === 0 && (
                <p className="text-sm text-muted">
                  لا توجد أقسام.{' '}
                  {isAdmin ? (
                    <Link to="/admin/categories" className="underline">
                      أضف قسمًا أولًا
                    </Link>
                  ) : (
                    'تواصل مع الإدارة لإضافة قسم.'
                  )}
                </p>
              )}
              <Textarea label="الوصف" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} error={fe.description} />
            </div>
          </Panel>

          {categoryId && (
            <Panel title="المواصفات">
              <SpecInputs fields={fields} values={specs} onChange={(k, val) => setSpecs((s) => ({ ...s, [k]: val }))} errors={fe} />
            </Panel>
          )}

          {product ? (
            <MediaManager product={product} apiBase={mode.apiBase} allowVideo={isAdmin} onChanged={onReload} />
          ) : (
            <Panel title="الصور">
              <p className="text-sm text-muted">احفظ المنتج أولًا، ثم أضف الصور.</p>
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
              <Checkbox label="ظاهر في المتجر" description={isAdmin ? undefined : 'بعد موافقة الإدارة'} checked={visible} onChange={setVisible} />
              {isAdmin && <Checkbox label="منتج مميز" description="يظهر في الصفحة الرئيسية" checked={featured} onChange={setFeatured} />}
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

function MediaManager({
  product,
  apiBase,
  allowVideo,
  onChanged,
}: {
  product: AdminProduct;
  apiBase: string;
  allowVideo: boolean;
  onChanged: () => void;
}) {
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
    if (!allowVideo && videos) return setError('الصور فقط (JPG / PNG / WebP)');
    if (videos + (hasVideo ? 1 : 0) > 1) return setError('فيديو واحد فقط لكل منتج');
    const bad = list.find((f) => !f.type.startsWith('image/') && !f.type.startsWith('video/'));
    if (bad) return setError(`الملف ${bad.name} ليس صورة أو فيديو`);
    if (!allowVideo && media.length + list.length > 8) return setError('الحد الأقصى 8 صور لكل منتج');
    const big = list.find((f) => (f.type.startsWith('video/') ? f.size > 60 * 1024 * 1024 : f.size > 8 * 1024 * 1024));
    if (big) return setError(`الملف ${big.name} أكبر من الحد المسموح (الصورة 8MB، الفيديو 60MB)`);
    if (list.length > 10) return setError('الحد الأقصى 10 ملفات في المرة الواحدة');
    setPending(list);
  };

  const upload = async () => {
    const fd = new FormData();
    pending.forEach((f) => fd.append('files', f));
    const r = await m.run(
      'upload',
      () => api.post<ProductMedia[]>(`${apiBase}/products/${product.id}/media`, fd),
      allowVideo ? 'تم رفع الملفات' : 'تم رفع الصور — المنتج بانتظار المراجعة',
    );
    if (r) {
      setMedia(r);
      setPending([]);
      if (inputRef.current) inputRef.current.value = '';
      onChanged();
    }
  };

  const remove = async (mediaId: string) => {
    const r = await m.run(`del-${mediaId}`, () => api.del(`${apiBase}/products/${product.id}/media/${mediaId}`), 'تم حذف الملف');
    if (r) setMedia((x) => x.filter((i) => i.id !== mediaId));
  };

  const move = async (index: number, d: -1 | 1) => {
    const next = [...media];
    const j = index + d;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    const prev = media;
    setMedia(next);
    const r = await m.run('order', () => api.put<ProductMedia[]>(`${apiBase}/products/${product.id}/media/order`, { ids: next.map((x) => x.id) }));
    if (r) setMedia(r);
    else setMedia(prev);
  };

  return (
    <Panel id="media" title={`${allowVideo ? 'الصور والفيديو' : 'الصور'} (${media.length})`}>
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
          <span className="text-sm font-medium">اختر صورًا{allowVideo && !hasVideo ? ' أو فيديو واحد' : ''}</span>
          <span className="text-xs text-muted">{allowVideo ? 'JPG / PNG / WebP حتى 8MB — فيديو MP4 حتى 60MB' : 'JPG / PNG / WebP حتى 5MB — 8 صور كحد أقصى'}</span>
          <input ref={inputRef} type="file" multiple accept={allowVideo ? 'image/*,video/*' : 'image/*'} className="sr-only" onChange={(e) => pick(e.target.files)} />
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
