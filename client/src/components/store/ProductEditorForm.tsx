import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../admin/ConfirmDialog';
import { useMutation } from '../admin/hooks';
import type { AdminProduct, FeeEditPolicy, ProductMedia } from '../admin/types';
import { AdminPage, FieldError, Panel } from '../admin/ui';
import { Alert, Button, ButtonLink, Checkbox, Icon, Input, Select, Tag, Textarea } from '../ui';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import type { ProductOption, SpecField } from '../../lib/types';
import { AVAILABILITY_LABEL, type Availability, type MarketFile } from '../../lib/market';

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
  // المورد يدخل سعره فقط؛ سعر العميل = سعر المورد × (1 + نسبة فرجار) ويُحسب في الخادم (هنا للعرض فقط)
  const [price, setPrice] = useState(product ? String(product.supplierPrice ?? product.price) : '');
  const isHouse = isAdmin && (!product || !product.vendor || product.vendor.isHouse);
  const [fee, setFee] = useState(product ? String(product.platformFeePercent ?? 0) : '');
  const [preview, setPreview] = useState<{ feePercent: number; policy: FeeEditPolicy } | null>(null);
  const [discount, setDiscount] = useState(product ? String(product.discountPercent) : '0');
  const [stock, setStock] = useState(product ? String(product.stock) : '0');
  const [visible, setVisible] = useState(product?.visible ?? true);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [specs, setSpecs] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(product?.specs ?? {}).map(([k, v]) => [k, String(v)])),
  );
  // بيانات صناعية (B2B)
  const [sku, setSku] = useState(product?.sku ?? '');
  const [partNumber, setPartNumber] = useState(product?.partNumber ?? '');
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [originCountry, setOriginCountry] = useState(product?.originCountry ?? '');
  const [priceOnRequest, setPriceOnRequest] = useState(product?.priceOnRequest ?? false);
  const [minOrderQty, setMinOrderQty] = useState(String(product?.minOrderQty ?? 1));
  const [availability, setAvailability] = useState<Availability>(product?.availability ?? 'IN_STOCK');
  const [leadTimeDays, setLeadTimeDays] = useState(product?.leadTimeDays != null ? String(product.leadTimeDays) : '');
  const [warranty, setWarranty] = useState(product?.warranty ?? '');
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl ?? '');
  const [keywords, setKeywords] = useState(product?.keywords ?? '');
  const [options, setOptions] = useState<ProductOption[]>(product?.options ?? []);
  // خيار بمخزون منفصل لكل قيمة (مثل 4 حمراء و6 زرقاء): مخزون المنتج = المجموع
  const trackedOption = options.find((g) => g.values.some((v) => v.stock != null));
  const trackedTotal = trackedOption ? trackedOption.values.reduce((n, v) => n + (Number(v.stock) || 0), 0) : 0;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const fields = categories.find((c) => c.id === categoryId)?.fields ?? [];

  // منتج جديد للمورد: النسبة المتوقعة حسب القسم (المورد ← القسم ← الافتراضي)
  useEffect(() => {
    if (isAdmin || product) return;
    let live = true;
    api
      .get<{ feePercent: number; policy: FeeEditPolicy }>(`/vendor/fee-preview${categoryId ? `?categoryId=${categoryId}` : ''}`)
      .then((r) => live && setPreview(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isAdmin, product, categoryId]);

  const priceN = Number(price) || 0;
  const feeN = isHouse ? 0 : isAdmin ? Number(fee) || 0 : product ? product.platformFeePercent : preview?.feePercent ?? 0;
  const customerN = Math.round(priceN * (1 + feeN / 100) * 1000) / 1000;
  const discN = Math.round(Number(discount) || 0);
  const finalN = applyDiscount(customerN, discN);
  const discountInvalid = discN < 0 || discN > 90;
  const feeInvalid = isAdmin && !isHouse && (feeN < 0 || feeN > 50);
  const feePolicy = product?.feePolicy ?? preview?.policy ?? 'ADMIN_ONLY';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      categoryId,
      description: description.trim(),
      supplierPrice: priceN,
      ...(isAdmin && !isHouse ? { platformFeePercent: feeN } : {}),
      discountPercent: discN,
      stock: Math.round(Number(stock) || 0),
      visible,
      sku: sku.trim() || null,
      partNumber: partNumber.trim() || null,
      manufacturer: manufacturer.trim() || null,
      brand: brand.trim() || null,
      originCountry: originCountry.trim() || null,
      priceOnRequest,
      minOrderQty: Math.max(1, Math.round(Number(minOrderQty) || 1)),
      availability,
      leadTimeDays: leadTimeDays.trim() === '' ? null : Math.round(Number(leadTimeDays)),
      warranty: warranty.trim() || null,
      videoUrl: videoUrl.trim() || null,
      keywords: keywords.trim() || null,
      // الخيارات الفارغة لا تُرسل
      options: options
        .map((g) => {
          const tracked = g.values.some((v) => v.stock != null);
          return {
            name: g.name.trim(),
            values: g.values
              .filter((v) => v.label.trim())
              .map((v) => ({ label: v.label.trim(), mediaId: v.mediaId ?? null, ...(tracked ? { stock: Math.max(0, Math.round(Number(v.stock) || 0)) } : {}) })),
          };
        })
        .filter((g) => g.name && g.values.length),
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

  const decideFee = async (decision: 'approve' | 'reject') => {
    if (!product) return;
    const r = await m.run(
      `fee-${decision}`,
      () => api.post(`/admin/store/products/${product.id}/fee-request/${decision}`),
      decision === 'approve' ? 'تم اعتماد النسبة الجديدة' : 'تم رفض طلب تغيير النسبة',
    );
    if (r) onReload();
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
      {isAdmin && product && product.feeRequestPercent != null && (
        <Panel title="طلب تغيير نسبة فرجار" className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="me-auto text-sm">
              يطلب المورد تغيير النسبة من <b dir="ltr">{product.platformFeePercent}%</b> إلى <b dir="ltr">{product.feeRequestPercent}%</b>
              {product.feeRequestNote ? ` — ${product.feeRequestNote}` : ''}
            </p>
            <Button size="sm" loading={m.pending === 'fee-approve'} onClick={() => decideFee('approve')}>
              <Icon name="check" className="h-4 w-4" /> اعتماد النسبة
            </Button>
            <Button size="sm" variant="outline" loading={m.pending === 'fee-reject'} onClick={() => decideFee('reject')}>
              رفض
            </Button>
          </div>
        </Panel>
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

          <Panel title="بيانات صناعية">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="رقم المنتج / SKU" optional dir="ltr" className="text-start" value={sku} onChange={(e) => setSku(e.target.value)} error={fe.sku} />
              <Input label="رقم القطعة (Part No.)" optional dir="ltr" className="text-start" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} error={fe.partNumber} />
              <Input label="الشركة المصنعة" optional value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} error={fe.manufacturer} />
              <Input label="الماركة" optional value={brand} onChange={(e) => setBrand(e.target.value)} error={fe.brand} />
              <Input label="بلد المنشأ" optional value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} error={fe.originCountry} />
              <Input label="الضمان" optional placeholder="مثال: سنتان" value={warranty} onChange={(e) => setWarranty(e.target.value)} error={fe.warranty} />
              <Input label="رابط فيديو" optional dir="ltr" className="text-start" placeholder="https://youtube.com/…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} error={fe.videoUrl} />
              <Input label="كلمات مفتاحية للبحث" optional placeholder="موتور، محرك، 7.5 حصان" value={keywords} onChange={(e) => setKeywords(e.target.value)} error={fe.keywords} hint="مفصولة بفواصل — تساعد الشركات في إيجاد المنتج" />
            </div>
          </Panel>

          {categoryId && (
            <Panel title="المواصفات">
              <SpecInputs fields={fields} values={specs} onChange={(k, val) => setSpecs((s) => ({ ...s, [k]: val }))} errors={fe} />
            </Panel>
          )}

          <OptionsEditor value={options} onChange={setOptions} media={product?.media ?? []} errors={fe} />

          {product ? (
            <>
              <MediaManager product={product} apiBase={mode.apiBase} allowVideo review={!isAdmin} onChanged={onReload} />
              <DocumentsManager product={product} apiBase={mode.apiBase} />
            </>
          ) : (
            <Panel title="الصور">
              <p className="text-sm text-muted">احفظ المنتج أولًا، ثم أضف الصور.</p>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="السعر والتوفر">
            <div className="space-y-4">
              <Checkbox label="السعر عند الطلب" description="لا يظهر السعر، ويطلب العميل عرض سعر بدل الشراء المباشر" checked={priceOnRequest} onChange={setPriceOnRequest} />
              {!priceOnRequest && (
              <>
              <Input
                label={isHouse ? 'السعر (د.أ)' : isAdmin ? 'سعر المورد (د.أ)' : 'سعرك — سعر المورد (د.أ)'}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                className="ltr text-start"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                error={fe.supplierPrice ?? fe.price}
                hint={isHouse ? undefined : 'يُضاف إليه نسبة فرجار تلقائيًا ليصبح سعر العميل'}
              />
              {isAdmin && !isHouse && (
                <Input
                  label="نسبة فرجار %"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={50}
                  step="0.01"
                  className="ltr text-start"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  error={fe.platformFeePercent ?? (feeInvalid ? 'النسبة بين 0 و 50%' : undefined)}
                  hint="تؤثر على الطلبات الجديدة فقط — الطلبات السابقة محفوظة بنسبتها"
                />
              )}
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
              {!isHouse && (
                <dl className="space-y-1.5 rounded-xl border border-line p-3 text-sm" aria-live="polite">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">سعر المورد</dt>
                    <dd className="tabular-nums">{formatJOD(priceN)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">
                      نسبة فرجار <span dir="ltr">({feeN}%)</span>
                    </dt>
                    <dd className="tabular-nums">{formatJOD(customerN - priceN)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                    <dt>سعر العميل</dt>
                    <dd className="tabular-nums">{formatJOD(customerN)}</dd>
                  </div>
                  {!isAdmin && (
                    <p className="pt-1 text-xs text-muted">
                      {feePolicy === 'SUPPLIER_REQUEST' ? 'النسبة تحددها الإدارة، ويمكنك طلب تغييرها من صفحة المنتج.' : 'النسبة تحددها إدارة فرجار ولا يمكن تعديلها من حسابك.'}
                    </p>
                  )}
                </dl>
              )}
              {!isAdmin && product && feePolicy === 'SUPPLIER_REQUEST' && <FeeRequest product={product} onDone={onReload} />}
              <div className="rounded-xl border border-line bg-subtle/50 p-3" aria-live="polite">
                <p className="text-xs text-muted">السعر للعميل</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-bold tabular-nums">{formatJOD(finalN)}</span>
                  {discN > 0 && priceN > 0 && !discountInvalid && (
                    <>
                      <s className="text-sm text-muted">{formatJOD(customerN)}</s>
                      <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-fg">خصم {discN}%</span>
                    </>
                  )}
                </div>
                {discN > 0 && priceN > 0 && !discountInvalid && (
                  <p className="mt-1 text-xs text-muted">يوفر العميل {formatJOD(customerN - finalN)}</p>
                )}
              </div>
              </>
              )}
              <Select label="حالة التوفر" value={availability} onChange={(e) => setAvailability(e.target.value as Availability)} error={fe.availability}>
                {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((k) => (
                  <option key={k} value={k}>
                    {AVAILABILITY_LABEL[k]}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input label="الحد الأدنى للطلب" type="number" inputMode="numeric" min={1} className="ltr text-start" value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value)} error={fe.minOrderQty} />
                <Input label="مدة التوريد (يوم)" optional type="number" inputMode="numeric" min={0} className="ltr text-start" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} error={fe.leadTimeDays} />
              </div>
              {trackedOption ? (
                <div className="rounded-xl border border-line bg-subtle/50 p-3 text-sm">
                  <p className="text-xs text-muted">الكمية في المخزون</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{trackedTotal}</p>
                  <p className="mt-1 text-xs text-muted">مجموع مخزون {trackedOption.name} — عدّله من خيارات المنتج</p>
                </div>
              ) : (
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
              )}
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
  review,
  onChanged,
}: {
  product: AdminProduct;
  apiBase: string;
  allowVideo: boolean;
  /** منتج المورد: الملف الجديد يعيده للمراجعة */
  review?: boolean;
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
    const images = list.filter((f) => f.type.startsWith('image/')).length + media.filter((x) => x.kind === 'IMAGE').length;
    if (images > 8) return setError('الحد الأقصى 8 صور لكل منتج');
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
      review ? 'تم رفع الملفات — المنتج بانتظار المراجعة' : 'تم رفع الملفات',
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

/** ملفات فنية للمنتج: Datasheet / كتالوج / رسومات CAD */
function DocumentsManager({ product, apiBase }: { product: AdminProduct; apiBase: string }) {
  const m = useMutation();
  const [docs, setDocs] = useState<MarketFile[]>(product.documents ?? []);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    const r = await m.run('docs', () => api.post<MarketFile[]>(`${apiBase}/products/${product.id}/documents`, fd), 'تم رفع الملفات');
    if (r) setDocs(r);
    if (inputRef.current) inputRef.current.value = '';
  };
  const remove = async (i: number) => {
    const r = await m.run(`doc-${i}`, () => api.del<MarketFile[]>(`${apiBase}/products/${product.id}/documents/${i}`), 'تم حذف الملف');
    if (r) setDocs(r);
  };
  return (
    <Panel title={`الملفات الفنية (${docs.length})`}>
      {docs.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-xl border border-line">
          {docs.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                <Icon name="file" className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">{d.name}</span>
              </a>
              <button type="button" disabled={m.busy} onClick={() => remove(i)} className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label="حذف الملف">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line p-4 text-center">
        <Icon name="upload" className="h-6 w-6 text-muted" />
        <span className="text-sm font-medium">{m.pending === 'docs' ? 'جاري الرفع…' : 'Datasheet أو كتالوج أو ملف CAD'}</span>
        <span className="text-xs text-muted">PDF أو DWG / DXF / STEP أو صور — حتى 20MB، 6 ملفات كحد أقصى</span>
        <input ref={inputRef} type="file" multiple accept=".pdf,.dwg,.dxf,.step,.stp,image/*" className="sr-only" disabled={m.busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {m.error && <p className="mt-2 text-sm text-danger">{m.error}</p>}
    </Panel>
  );
}

/** طلب المورد تغيير نسبة فرجار (عند سماح الإدارة بذلك) */
function FeeRequest({ product, onDone }: { product: AdminProduct; onDone: () => void }) {
  const m = useMutation();
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  if (product.feeRequestPercent != null) {
    return (
      <Alert tone="info">
        طلبت تغيير النسبة إلى <span dir="ltr">{product.feeRequestPercent}%</span> — بانتظار رد الإدارة.
      </Alert>
    );
  }
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        طلب تغيير النسبة
      </Button>
    );
  }
  const send = async () => {
    const r = await m.run('fee', () => api.post(`/vendor/products/${product.id}/fee-request`, { percent: Number(percent), note: note.trim() || null }), 'تم إرسال الطلب للإدارة');
    if (r) {
      setOpen(false);
      onDone();
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <Input label="النسبة المطلوبة %" type="number" inputMode="decimal" min={0} max={50} step="0.01" className="ltr text-start" value={percent} onChange={(e) => setPercent(e.target.value)} error={m.fieldErrors.percent} />
      <Input label="السبب" optional value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" loading={m.pending === 'fee'} disabled={percent.trim() === ''} onClick={send}>
          إرسال الطلب
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

const OPTION_SUGGESTIONS = ['اللون', 'المقاس', 'الخامة', 'الحجم', 'الموديل'];

/**
 * خيارات المنتج: العميل يختار قيمة واحدة من كل خيار قبل الإضافة للسلة (مثل: اللون أحمر).
 * يمكن ربط كل قيمة بصورة من صور المنتج لتظهر عند اختيارها.
 */
function OptionsEditor({
  value,
  onChange,
  media,
  errors,
}: {
  value: ProductOption[];
  onChange: (v: ProductOption[]) => void;
  media: ProductMedia[];
  errors: Record<string, string>;
}) {
  const images = media.filter((x) => x.kind === 'IMAGE');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const setGroup = (i: number, g: ProductOption) => onChange(value.map((x, j) => (j === i ? g : x)));
  const addValues = (i: number) => {
    const g = value[i];
    const labels = (drafts[i] ?? '')
      .split(/[،,\n]/)
      .map((t) => t.trim())
      .filter((t) => t && !g.values.some((v) => v.label === t));
    if (!labels.length) return;
    const tracked = g.values.some((v) => v.stock != null);
    setGroup(i, { ...g, values: [...g.values, ...labels.map((label) => ({ label, mediaId: null, ...(tracked ? { stock: 0 } : {}) }))] });
    setDrafts((d) => ({ ...d, [i]: '' }));
  };
  const optionsError = Object.entries(errors).find(([k]) => k.startsWith('options'))?.[1];

  return (
    <Panel title="خيارات المنتج (اللون، المقاس…)">
      <p className="mb-4 text-sm text-muted">
        العميل يختار قيمة من كل خيار قبل الإضافة للسلة، ويظهر اختياره في السلة والطلب والفاتورة. مثال: اللون ← أحمر، أزرق، رمادي.
      </p>
      {optionsError && <FieldError message={optionsError} />}
      <div className="space-y-4">
        {value.map((g, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <Input
                label="اسم الخيار"
                list="option-names"
                wrapperClassName="flex-1"
                value={g.name}
                placeholder="اللون"
                onChange={(e) => setGroup(i, { ...g, name: e.target.value })}
              />
              <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                حذف الخيار
              </Button>
            </div>
            {(() => {
              const tracked = g.values.some((v) => v.stock != null);
              const otherTracked = value.some((x, j) => j !== i && x.values.some((v) => v.stock != null));
              if (otherTracked) return null;
              return (
                <Checkbox
                  label="مخزون منفصل لكل قيمة"
                  description="مثل: 4 حمراء و6 زرقاء — القيمة التي تنفد لا يقدر العميل يختارها"
                  checked={tracked}
                  onChange={(on) => setGroup(i, { ...g, values: g.values.map((v) => ({ ...v, stock: on ? v.stock ?? 0 : null })) })}
                />
              );
            })()}
            {g.values.length > 0 && (
              <ul className="space-y-2">
                {g.values.map((v, k) => (
                  <li key={k} className="rounded-lg bg-subtle/60 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="القيمة"
                        className="input h-10 min-w-0 flex-1"
                        value={v.label}
                        onChange={(e) => setGroup(i, { ...g, values: g.values.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)) })}
                      />
                      {v.stock != null && (
                        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                          الكمية
                          <input
                            aria-label={`كمية ${v.label}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            className="input ltr h-10 w-20 text-start"
                            value={v.stock}
                            onChange={(e) =>
                              setGroup(i, { ...g, values: g.values.map((x, j) => (j === k ? { ...x, stock: e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)) })
                            }
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        aria-label={`حذف ${v.label}`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted hover:text-danger"
                        onClick={() => setGroup(i, { ...g, values: g.values.filter((_, j) => j !== k) })}
                      >
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                    {images.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`صورة ${v.label}`}>
                        <span className="text-xs text-muted">صورته:</span>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={!v.mediaId}
                          onClick={() => setGroup(i, { ...g, values: g.values.map((x, j) => (j === k ? { ...x, mediaId: null } : x)) })}
                          className={cx('h-9 rounded-md border px-2 text-xs', !v.mediaId ? 'border-ink' : 'border-line')}
                        >
                          بدون
                        </button>
                        {images.map((img, n) => (
                          <button
                            key={img.id}
                            type="button"
                            role="radio"
                            aria-checked={v.mediaId === img.id}
                            aria-label={`الصورة ${n + 1}`}
                            onClick={() => setGroup(i, { ...g, values: g.values.map((x, j) => (j === k ? { ...x, mediaId: img.id } : x)) })}
                            className={cx('h-9 w-9 overflow-hidden rounded-md ring-offset-1', v.mediaId === img.id ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100')}
                          >
                            <img src={img.url} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                aria-label={`أضف قيمة لـ ${g.name || 'الخيار'}`}
                className="input h-10 min-w-0 flex-1"
                placeholder="أحمر، أزرق، رمادي"
                value={drafts[i] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addValues(i);
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => addValues(i)}>
                أضف
              </Button>
            </div>
          </div>
        ))}
      </div>
      <datalist id="option-names">
        {OPTION_SUGGESTIONS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {value.length < 3 && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onChange([...value, { name: value.length ? '' : 'اللون', values: [] }])}>
          <Icon name="plus" className="h-4 w-4" /> أضف خيارًا
        </Button>
      )}
      {value.length > 0 && images.length === 0 && <p className="mt-3 text-xs text-muted">ارفع صور المنتج ثم اربط كل لون بصورته (اختياري).</p>}
    </Panel>
  );
}

/** مخزون كل قيمة في القوائم: "أحمر 4 · أزرق 6" */
export function OptionStock({ product }: { product: AdminProduct }) {
  const g = product.options?.find((x) => x.values.some((v) => v.stock != null));
  if (!g) return null;
  return (
    <span className="mt-0.5 block text-xs text-muted">
      {g.values.map((v, i) => (
        <span key={v.label}>
          {i > 0 && ' · '}
          {v.label} <span className={cx('tabular-nums', (v.stock ?? 0) === 0 && 'font-semibold text-danger')}>{v.stock ?? 0}</span>
        </span>
      ))}
    </span>
  );
}
