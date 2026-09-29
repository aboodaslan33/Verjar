import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { loginPath } from '../../components/auth/RequireCustomer';
import { Alert, Button, ButtonLink, Checkbox, Icon, Input, PageHeader, SuccessMark, Textarea } from '../../components/ui';
import { useAuth } from '../../context/Auth';
import { ApiError, api, toFormData } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import { FEATURE_LABEL } from '../../lib/market';
import { CopyRow, type PaymentAccount } from '../../components/market/PaymentProof';
import type { Category } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  maxProducts: number | null;
  maxUsers: number;
  maxRfqPerMonth: number | null;
  leadsIncluded: boolean;
  features: Record<string, boolean>;
  badge: string | null;
  isDefault: boolean;
};

/** الانضمام كمورد: الباقات + نموذج التسجيل (يدخل المورد "قيد المراجعة" حتى تعتمده الإدارة) */
export default function SupplierJoin() {
  useDocumentTitle('انضم كمورد');
  const { user } = useAuth();
  const location = useLocation();
  const plans = useAsync(() => api.get<Plan[]>('/market/plans'), [], 'market/plans');
  const customer = user?.role === 'CUSTOMER' ? user : null;
  const [chosen, setChosen] = useState<string | null>(null);
  const planId = chosen ?? plans.data?.find((p) => p.isDefault)?.id ?? plans.data?.[0]?.id ?? null;
  const selectedPlan = plans.data?.find((p) => p.id === planId) ?? null;
  const choose = (id: string) => {
    setChosen(id);
    document.getElementById('join-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader
        eyebrow="للموردين والمصنّعين"
        title="اعرض منتجاتك للمصانع والشركات"
        description="سوق FARJAR الصناعي يربط الشركات والمصانع بالموردين. سجّل شركتك مجانًا، أضف منتجاتك، واستقبل طلبات عروض الأسعار."
        crumbs={[{ to: '/store', label: 'السوق' }, { label: 'انضم كمورد' }]}
      />
      <div className="container py-10 md:py-14">
        {/* الباقات */}
        <section aria-labelledby="plans-title">
          <h2 id="plans-title" className="text-2xl">
            الباقات
          </h2>
          <p className="mt-1 text-muted">ابدأ مجانًا، ورقِّ باقتك متى احتجت ظهورًا أوسع.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {plans.data?.map((p) => (
              <li
                key={p.id}
                className={cx(
                  'flex flex-col rounded-2xl border p-6 transition',
                  p.code === 'BUSINESS' ? 'border-ink bg-inverse text-inverse-fg' : p.code === 'PRO' ? 'border-primary bg-surface' : 'border-line bg-surface',
                  p.id === planId && 'ring-2 ring-primary ring-offset-2 ring-offset-bg',
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-xl font-bold">{p.name}</p>
                  {p.code === 'PRO' && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-fg">الأكثر طلبًا</span>}
                </div>
                <p className="mt-3">
                  <span className="font-display text-3xl font-bold">{Number(p.price) > 0 ? formatJOD(p.price) : 'مجانًا'}</span>
                  {Number(p.price) > 0 && <span className={cx('text-sm', p.code === 'BUSINESS' ? 'text-inverse-fg/60' : 'text-muted')}> / {p.durationDays === 30 ? 'شهريًا' : `${p.durationDays} يومًا`}</span>}
                </p>
                <p className={cx('mt-3 text-sm leading-relaxed', p.code === 'BUSINESS' ? 'text-inverse-fg/70' : 'text-muted')}>{p.description}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {[
                    p.maxProducts == null ? 'منتجات غير محدودة' : `حتى ${p.maxProducts} منتج`,
                    p.maxRfqPerMonth == null ? 'طلبات عروض أسعار غير محدودة' : `حتى ${p.maxRfqPerMonth} طلبات عروض أسعار شهريًا`,
                    p.maxUsers > 1 ? `${p.maxUsers} مستخدمين` : 'مستخدم واحد',
                    ...(p.leadsIncluded ? ['الـ Leads مشمولة بدون رسوم'] : []),
                    ...Object.entries(p.features)
                      .filter(([, v]) => v)
                      .map(([k]) => FEATURE_LABEL[k] ?? k),
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
                    </li>
                  ))}
                </ul>
                {!customer?.vendor && (
                  <Button
                    className={cx('mt-6', p.id !== planId && p.code === 'BUSINESS' && 'border-white/40 bg-transparent text-inverse-fg hover:border-white')}
                    block
                    variant={p.id === planId ? 'primary' : 'outline'}
                    onClick={() => choose(p.id)} aria-pressed={p.id === planId}>
                    {p.id === planId ? (
                      <>
                        <Icon name="check" className="h-4 w-4" /> الباقة المختارة
                      </>
                    ) : (
                      'اختر هذه الباقة'
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">الباقات المدفوعة: حوّل المبلغ عبر CliQ أو تحويل بنكي وأرفق صورة الإيصال ضمن نموذج التسجيل، وتُفعَّل الباقة عند اعتماد الإدارة. يمكنك الترقية لاحقًا من لوحة المورد.</p>
        </section>

        <section className="mt-14" aria-labelledby="join-title">
          <h2 id="join-title" className="text-2xl">
            سجّل شركتك
          </h2>
          {!customer ? (
            <div className="mt-5 rounded-2xl border border-line bg-surface p-6">
              <p className="text-muted">سجّل الدخول أو أنشئ حسابًا أولًا، ثم أكمل بيانات شركتك.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink to={loginPath(location)}>تسجيل الدخول</ButtonLink>
                <ButtonLink to={`/register?next=${encodeURIComponent('/suppliers/join')}`} variant="outline">
                  إنشاء حساب
                </ButtonLink>
              </div>
            </div>
          ) : customer.vendor ? (
            <div className="mt-5 rounded-2xl border border-line bg-surface p-6">
              <p>
                حسابك مرتبط بالمورد <b>{customer.vendor.name}</b>
                {customer.vendor.status === 'PENDING' && ' — قيد المراجعة من الإدارة'}.
              </p>
              <ButtonLink to="/vendor" className="mt-4">
                لوحة المورد
              </ButtonLink>
            </div>
          ) : (
            <JoinForm defaults={{ name: customer.name, email: customer.email ?? '', company: customer.companyName ?? '' }} plan={selectedPlan} />
          )}
        </section>
      </div>
    </>
  );
}

function JoinForm({ defaults, plan }: { defaults: { name: string; email: string; company: string }; plan: Plan | null }) {
  const { refresh } = useAuth();
  const cats = useAsync(() => api.get<Category[]>('/store/categories'), [], 'store/categories');
  const [f, setF] = useState({
    companyName: defaults.company,
    contactName: defaults.name,
    phone: '',
    whatsapp: '',
    email: defaults.email,
    address: '',
    city: '',
    businessField: '',
    productTypes: '',
    licenseNumber: '',
    description: '',
  });
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [logo, setLogo] = useState<File | null>(null);
  const [catalog, setCatalog] = useState<File[]>([]);
  const [certs, setCerts] = useState<File[]>([]);
  // الباقة المدفوعة: إيصال الدفع جزء من طلب الانضمام
  const paid = Boolean(plan && Number(plan.price) > 0);
  const account = useAsync(() => api.get<PaymentAccount>('/market/payment-account'), [], 'market/payment-account');
  const [proof, setProof] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const pickProof = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type) && file.type !== 'application/pdf') return setErrors((x) => ({ ...x, paymentProof: 'الملف يجب أن يكون صورة أو PDF' }));
    if (file.size > 10 * 1024 * 1024) return setErrors((x) => ({ ...x, paymentProof: 'حجم الملف أكبر من 10MB' }));
    setErrors(({ paymentProof: _p, ...x }) => x);
    setProof(file);
  };
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ status: string; plan: { name: string; price: number } | null } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (paid && !proof) {
      setErrors({ paymentProof: 'أرفق صورة أو PDF لإيصال الدفع', _: `باقة ${plan?.name} مدفوعة — أرفق إيصال التحويل قبل الإرسال` });
      document.getElementById('join-payment')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const r = await api.post<{ status: string; plan: { name: string; price: number } | null }>(
        '/market/suppliers/join',
        toFormData(
          { ...f, categoryIds, planId: plan?.id ?? null, paymentReference: paid ? paymentReference.trim() || null : null, acceptTerms: accept },
          { logo, catalog, certificates: certs, paymentProof: paid ? proof : null },
        ),
      );
      setDone(r);
      refresh();
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, _: Object.keys(err.fields).length ? 'راجع الحقول المظللة' : err.message } : { _: 'تعذر الإرسال' });
      top.current?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="card mt-5 p-6 text-center sm:p-8">
        <SuccessMark />
        <h3 className="mt-4 text-xl">تم استلام طلب انضمامك</h3>
        <p className="mt-2 text-muted">{done.status === 'PENDING' ? 'تراجع إدارة FARJAR بيانات شركتك، ونرسل لك إشعارًا عند الاعتماد. يمكنك من الآن إضافة منتجاتك من لوحة المورد.' : 'حسابك مفعّل. أضف منتجاتك الآن.'}</p>
        {done.plan && (
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-primary bg-primary/10 p-4 text-start">
            <p className="font-bold">
              باقة {done.plan.name} — {formatJOD(done.plan.price)}
            </p>
            <p className="mt-1 text-sm">وصل إيصال الدفع مع طلبك. تراجعه الإدارة مع بيانات شركتك، وتُفعَّل الباقة عند الاعتماد.</p>
          </div>
        )}
        <ButtonLink to="/vendor" className="mt-5">
          لوحة المورد
        </ButtonLink>
      </div>
    );
  }

  const fe = errors;
  const fileList = (files: File[], setter: (f: File[]) => void) =>
    files.length > 0 && (
      <ul className="mt-2 space-y-1 text-sm">
        {files.map((x, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-1.5">
            <span className="truncate">{x.name}</span>
            <button type="button" onClick={() => setter(files.filter((_, j) => j !== i))} aria-label={`إزالة ${x.name}`} className="text-muted hover:text-danger">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-5 grid gap-6 lg:grid-cols-3">
      <div ref={top} className="space-y-6 lg:col-span-2">
        {fe._ && <Alert tone="error">{fe._}</Alert>}
        <section className="card grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
          <Input label="اسم الشركة" value={f.companyName} onChange={set('companyName')} error={fe.companyName} />
          <Input label="اسم المسؤول" value={f.contactName} onChange={set('contactName')} error={fe.contactName} />
          <Input label="رقم الهاتف" type="tel" dir="ltr" className="text-end" placeholder="07XXXXXXXX" value={f.phone} onChange={set('phone')} error={fe.phone} />
          <Input label="WhatsApp" optional type="tel" dir="ltr" className="text-end" value={f.whatsapp} onChange={set('whatsapp')} error={fe.whatsapp} />
          <Input label="البريد الإلكتروني" type="email" dir="ltr" className="text-end" value={f.email} onChange={set('email')} error={fe.email} />
          <Input label="المدينة" value={f.city} onChange={set('city')} error={fe.city} placeholder="عمّان، الزرقاء، سحاب…" />
          <Input label="العنوان" wrapperClassName="sm:col-span-2" value={f.address} onChange={set('address')} error={fe.address} />
          <Input label="مجال العمل" value={f.businessField} onChange={set('businessField')} error={fe.businessField} placeholder="قطع غيار، تصنيع ستانلس…" />
          <Input label="رقم التسجيل / الترخيص" optional value={f.licenseNumber} onChange={set('licenseNumber')} error={fe.licenseNumber} />
          <Textarea label="نوع المنتجات" wrapperClassName="sm:col-span-2" rows={2} value={f.productTypes} onChange={set('productTypes')} error={fe.productTypes} placeholder="محركات، مضخات، سيور، حساسات…" />
          <Textarea label="نبذة عن الشركة" optional wrapperClassName="sm:col-span-2" rows={4} value={f.description} onChange={set('description')} error={fe.description} />
        </section>
        <section className="card p-4 sm:p-6">
          <p className="mb-3 text-sm font-semibold">التصنيفات التي تخدمها</p>
          <p className="mb-3 text-xs text-muted">تصلك طلبات عروض الأسعار في هذه التصنيفات.</p>
          <ul className="flex flex-wrap gap-2">
            {cats.data?.map((c) => {
              const on = categoryIds.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategoryIds((l) => (on ? l.filter((x) => x !== c.id) : [...l, c.id].slice(0, 20)))}
                    className={cx('rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface hover:border-ink')}
                  >
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        {paid && plan && (
          <section id="join-payment" className="card space-y-4 border-primary p-4 sm:p-6">
            <div>
              <h3 className="text-lg">
                دفع باقة {plan.name} — {formatJOD(plan.price)}
              </h3>
              <p className="mt-1 text-sm text-muted">حوّل المبلغ ثم أرفق صورة الإيصال — يصل مع طلب انضمامك، وتُفعَّل الباقة عند اعتماد الإدارة.</p>
            </div>
            {account.data && (
              <div className="divide-y divide-line rounded-xl border border-line px-4">
                {account.data.bankName && <CopyRow label="البنك" value={account.data.bankName} ltr={false} />}
                {account.data.accountName && <CopyRow label="اسم الحساب" value={account.data.accountName} ltr={false} />}
                {account.data.cliq && <CopyRow label="CliQ (رقم / Alias)" value={account.data.cliq} />}
                {account.data.iban && <CopyRow label="رقم الحساب / IBAN" value={account.data.iban} />}
                <CopyRow label="المبلغ (د.أ)" value={String(Number(plan.price))} />
              </div>
            )}
            <label
              className={cx('flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center hover:border-ink', proof ? 'border-success bg-success/5' : fe.paymentProof ? 'border-danger' : 'border-line-strong')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickProof(e.dataTransfer.files?.[0]);
              }}
            >
              <Icon name={proof ? 'check' : 'upload'} className="h-6 w-6 text-muted" />
              <span className="text-sm font-semibold">{proof ? proof.name : 'إيصال الدفع (إلزامي): صورة شاشة أو PDF'}</span>
              <span className="text-xs text-muted">{proof ? 'اضغط لتغيير الملف' : 'JPG أو PNG أو PDF — حتى 10MB'}</span>
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => pickProof(e.target.files?.[0])} />
            </label>
            {fe.paymentProof && <p className="text-sm text-danger">{fe.paymentProof}</p>}
            <Input label="رقم الحوالة / المرجع" optional className="ltr text-start" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} error={fe.paymentReference} hint="يظهر في إيصال CliQ أو التحويل البنكي" />
          </section>
        )}
      </div>
      <aside className="space-y-4">
        <section className="card space-y-4 p-4 sm:p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الشعار</span>
            <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:me-3 file:rounded-lg file:border file:border-line file:bg-subtle file:px-3 file:py-1.5" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الكتالوج (PDF)</span>
            <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setCatalog(Array.from(e.target.files ?? []).slice(0, 3))} className="block w-full text-sm file:me-3 file:rounded-lg file:border file:border-line file:bg-subtle file:px-3 file:py-1.5" />
            {fileList(catalog, setCatalog)}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">الشهادات والاعتمادات</span>
            <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setCerts(Array.from(e.target.files ?? []).slice(0, 8))} className="block w-full text-sm file:me-3 file:rounded-lg file:border file:border-line file:bg-subtle file:px-3 file:py-1.5" />
            {fileList(certs, setCerts)}
          </label>
          {plan && (
            <div className="rounded-xl bg-subtle p-3 text-sm">
              <p className="text-muted">الباقة المختارة</p>
              <p className="font-bold">
                {plan.name} — {Number(plan.price) > 0 ? formatJOD(plan.price) : 'مجانًا'}
              </p>
              {Number(plan.price) > 0 && (
                <p className={cx('mt-1 text-xs', proof ? 'text-success' : 'text-muted')}>{proof ? 'إيصال الدفع مرفق ✓' : 'أرفق إيصال الدفع في قسم الدفع قبل الإرسال.'}</p>
              )}
              <a href="#plans-title" className="mt-1 inline-block text-xs font-semibold underline">
                تغيير الباقة
              </a>
            </div>
          )}
          <Checkbox label="أوافق على شروط الانضمام وسياسات المنصة" checked={accept} onChange={setAccept} error={fe.acceptTerms} />
          <p className="text-xs text-muted">
            <Link to="/policies" className="underline">
              السياسات
            </Link>{' '}
            — تُراجع الإدارة بيانات شركتك قبل ظهورها في السوق.
          </p>
          <Button type="submit" block size="lg" loading={busy}>
            إرسال طلب الانضمام
          </Button>
        </section>
      </aside>
    </form>
  );
}
