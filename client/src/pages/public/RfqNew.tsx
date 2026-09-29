import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAccountPrefill } from '../../components/forms/AccountPrefill';
import { Alert, Breadcrumbs, Button, ButtonLink, Icon, Input, Select, SuccessMark, Textarea } from '../../components/ui';
import { ApiError, api, toFormData } from '../../lib/api';
import type { Category, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type Item = { name: string; quantity: string; unit: string; brand: string; specs: string };
const emptyItem = (name = ''): Item => ({ name, quantity: '1', unit: 'قطعة', brand: '', specs: '' });
const UNITS = ['قطعة', 'عدد', 'متر', 'كغم', 'طن', 'لتر', 'مجموعة', 'خط إنتاج'];
const MAX_FILES = 10;

/**
 * طلب عرض سعر (RFQ): الشركة تكتب احتياجها (منتج واحد أو قائمة كاملة) وترفق الصور والملفات الفنية،
 * فيصل للموردين المناسبين وتستقبل عروضهم للمقارنة في حسابها.
 */
export default function RfqNew() {
  useDocumentTitle('اطلب عرض سعر');
  const [params] = useSearchParams();
  const productSlug = params.get('product');
  const vendorSlug = params.get('vendor');
  const product = useAsync(() => (productSlug ? api.get<{ product: Product }>(`/store/products/${encodeURIComponent(productSlug)}`).then((r) => r.product) : Promise.resolve(null)), [productSlug]);
  const vendor = useAsync(() => (vendorSlug ? api.get<{ id: string; name: string; isHouse: boolean }>(`/store/vendors/${encodeURIComponent(vendorSlug)}`) : Promise.resolve(null)), [vendorSlug]);
  const cats = useAsync(() => api.get<Category[]>('/store/categories'), [], 'store/categories');

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  const [categorySlug, setCategorySlug] = useState(params.get('category') ?? '');
  const [items, setItems] = useState<Item[]>([emptyItem(params.get('q') ?? '')]);
  const [budget, setBudget] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ id: string; code: string } | null>(null);
  const prefilledItem = useRef(false);

  useAccountPrefill((c) => {
    setContactName((v) => v || c.name);
    setPhone((v) => v || c.localPhone);
    setEmail((v) => v || c.email || '');
    setCompanyName((v) => v || c.companyName || '');
  });

  // طلب من صفحة منتج: البند الأول باسم المنتج وماركته
  if (product.data && !prefilledItem.current) {
    prefilledItem.current = true;
    const p = product.data;
    setItems([{ ...emptyItem(p.name), brand: p.brand ?? '', quantity: String(Math.max(1, p.minOrderQty ?? 1)) }]);
    setCategorySlug((c) => c || p.category.parent?.slug || p.category.slug);
  }

  const allCats = (cats.data ?? []).flatMap((c) => [{ id: c.id, slug: c.slug, name: c.name }, ...(c.children ?? []).map((k) => ({ id: k.id, slug: k.slug, name: `${c.name} / ${k.name}` }))]);
  const setItem = (i: number, k: keyof Item, v: string) => setItems((l) => l.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const pickFiles = (list: FileList | null) => {
    const next = [...files, ...Array.from(list ?? [])].slice(0, MAX_FILES);
    const big = next.find((f) => f.size > 20 * 1024 * 1024);
    if (big) return setErrors((e) => ({ ...e, files: `الملف ${big.name} أكبر من 20MB` }));
    setErrors(({ files: _f, ...rest }) => rest);
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      city: city.trim() || null,
      location: location.trim() || null,
      categoryId: allCats.find((c) => c.slug === categorySlug)?.id ?? null,
      productId: product.data?.id ?? null,
      vendorSlug: vendorSlug || null,
      items: items
        .filter((it) => it.name.trim())
        .map((it) => ({ name: it.name.trim(), quantity: Number(it.quantity) || 0, unit: it.unit, brand: it.brand.trim() || null, specs: it.specs.trim() || null })),
      budget: budget.trim() ? Number(budget) : null,
      neededBy: neededBy || null,
      notes: notes.trim() || null,
    };
    try {
      const r = await api.post<{ id: string; code: string }>('/market/rfqs', toFormData(payload, { files }));
      setDone(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: Object.keys(err.fields).length ? 'راجع الحقول المظللة' : err.message });
      else setErrors({ _: 'تعذر إرسال الطلب، حاول مرة أخرى' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="container max-w-xl py-14 md:py-20">
        <div className="card anim-fade-up p-6 text-center sm:p-8">
          <SuccessMark />
          <h1 className="mt-4 text-2xl">تم إرسال طلب عرض السعر</h1>
          <p className="mt-2 text-muted">
            رقم الطلب <b className="ltr text-ink">{done.code}</b>
          </p>
          <p className="mt-4 leading-relaxed text-muted">وصل طلبك للموردين المناسبين. سنرسل لك إشعارًا عند وصول كل عرض، وتستطيع مقارنة العروض ومراسلة الموردين من حسابك.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ButtonLink to={`/account/rfq/${done.id}`}>متابعة الطلب</ButtonLink>
            <ButtonLink to="/store" variant="outline">
              العودة للسوق
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const fe = errors;
  const target = product.data ? product.data.name : vendor.data ? (vendor.data.isHouse ? 'FARJAR' : vendor.data.name) : null;

  return (
    <>
      <header className="border-b border-line bg-subtle">
        <div className="container py-7 md:py-10">
          <Breadcrumbs items={[{ to: '/store', label: 'السوق' }, { label: 'طلب عرض سعر' }]} className="mb-4" />
          <h1 className="text-[1.75rem] md:text-[2.25rem]">اطلب عرض سعر</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {target ? (
              <>
                طلبك يصل مباشرة إلى <b className="text-ink">{target}</b>، وقد نرسله أيضًا لموردين مناسبين لتحصل على أفضل عرض.
              </>
            ) : (
              'اكتب ما تحتاجه — منتجًا واحدًا أو قائمة كاملة — وسنوصله بالموردين المناسبين. تستلم العروض وتقارنها في حسابك.'
            )}
          </p>
        </div>
      </header>

      <form onSubmit={submit} noValidate className="container grid gap-8 py-8 md:py-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {fe._ && <Alert tone="error">{fe._}</Alert>}

          <section className="card space-y-4 p-4 sm:p-6">
            <h2 className="text-lg">المطلوب</h2>
            <Select label="التصنيف" optional value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} error={fe.categoryId}>
              <option value="">اختر التصنيف (يساعدنا في اختيار الموردين)</option>
              {allCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
            <ol className="space-y-4">
              {items.map((it, i) => (
                <li key={i} className="rounded-xl border border-line p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">البند {i + 1}</span>
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`حذف البند ${i + 1}`}>
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
                    <Input label="المنتج المطلوب" placeholder="مثال: عربة ستانلس 3 رفوف" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} error={fe[`items.${i}.name`] ?? (i === 0 ? fe.items : undefined)} />
                    <Input label="الكمية" type="number" inputMode="decimal" min={0} className="ltr text-start" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} error={fe[`items.${i}.quantity`]} />
                    <Select label="الوحدة" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)}>
                      {UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
                    <Input label="الماركة المطلوبة" optional value={it.brand} onChange={(e) => setItem(i, 'brand', e.target.value)} />
                    <Textarea label="المواصفات" optional rows={2} placeholder="القياسات، القدرة، الجهد، المادة…" value={it.specs} onChange={(e) => setItem(i, 'specs', e.target.value)} />
                  </div>
                </li>
              ))}
            </ol>
            {items.length < 50 && (
              <Button variant="ghost" size="sm" onClick={() => setItems((l) => [...l, emptyItem()])}>
                <Icon name="plus" className="h-4 w-4" /> إضافة بند آخر
              </Button>
            )}
          </section>

          <section className="card space-y-4 p-4 sm:p-6">
            <h2 className="text-lg">الصور والملفات</h2>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong p-5 text-center hover:border-ink">
              <Icon name="upload" className="h-6 w-6 text-muted" />
              <span className="text-sm font-semibold">صور، PDF، Datasheet أو ملفات CAD</span>
              <span className="text-xs text-muted">حتى {MAX_FILES} ملفات — 20MB للملف</span>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.dwg,.dxf,.step,.stp" className="sr-only" onChange={(e) => pickFiles(e.target.files)} />
            </label>
            {fe.files && <p className="text-sm text-danger">{fe.files}</p>}
            {files.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon name={f.type.startsWith('image/') ? 'image' : 'file'} className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label={`إزالة ${f.name}`}>
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="الميزانية التقريبية (د.أ)" optional type="number" inputMode="decimal" min={0} className="ltr text-start" value={budget} onChange={(e) => setBudget(e.target.value)} error={fe.budget} hint="تبقى بينك وبين FARJAR ولا تظهر للموردين" />
              <Input label="تاريخ الحاجة" optional type="date" className="ltr text-start" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} error={fe.neededBy} />
            </div>
            <Textarea label="ملاحظات" optional rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} error={fe.notes} />
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <section className="card space-y-4 p-4 sm:p-6 lg:sticky lg:top-28">
            <h2 className="text-lg">بيانات الشركة</h2>
            <Input label="اسم الشركة / المصنع" value={companyName} onChange={(e) => setCompanyName(e.target.value)} error={fe.companyName} />
            <Input label="اسم المسؤول" value={contactName} onChange={(e) => setContactName(e.target.value)} error={fe.contactName} />
            <Input label="الهاتف" type="tel" inputMode="tel" dir="ltr" className="text-end" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} error={fe.phone} />
            <Input label="البريد الإلكتروني" optional type="email" dir="ltr" className="text-end" value={email} onChange={(e) => setEmail(e.target.value)} error={fe.email} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="المدينة" optional value={city} onChange={(e) => setCity(e.target.value)} error={fe.city} />
              <Input label="الموقع" optional placeholder="المنطقة الصناعية…" value={location} onChange={(e) => setLocation(e.target.value)} error={fe.location} />
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">
              <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
              بيانات التواصل لا تظهر للموردين حتى تختار عرضًا. التواصل يتم عبر المنصة.
            </p>
            <Button type="submit" block size="lg" loading={busy}>
              إرسال طلب عرض السعر
            </Button>
            <p className="text-center text-xs text-muted">
              بإرسال الطلب أنت توافق على{' '}
              <Link to="/policies" className="underline">
                سياسات المنصة
              </Link>
            </p>
          </section>
        </aside>
      </form>
    </>
  );
}
