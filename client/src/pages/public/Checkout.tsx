import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ProductImage } from '../../components/store/ProductCard';
import { Alert, Button, ButtonA, ButtonLink, EmptyState, Icon, Input, PageHeader, Textarea } from '../../components/ui';
import { AccountNote, useAccountPrefill } from '../../components/forms/AccountPrefill';
import { useCart } from '../../context/CartContext';
import { ApiError, api } from '../../lib/api';
import { formatJOD, isValidPhone } from '../../lib/format';
import type { OrderCreated } from '../../lib/types';
import { prepareWhatsAppWindow } from '../../lib/whatsapp';
import { useDocumentTitle } from '../../lib/useAsync';

type Form = { name: string; phone: string; address: string; notes: string };
type Field = keyof Form;

function validate(f: Field, v: string): string | undefined {
  const t = v.trim();
  switch (f) {
    case 'name':
      if (!t) return 'الاسم مطلوب';
      if (t.length < 2) return 'الاسم قصير جدًا';
      if (t.length > 100) return 'الاسم طويل جدًا';
      return;
    case 'phone':
      if (!t) return 'رقم الهاتف مطلوب';
      if (!isValidPhone(t)) return 'رقم الهاتف غير صحيح (مثال: 0791234567)';
      return;
    case 'address':
      if (!t) return 'العنوان مطلوب';
      if (t.length < 5) return 'اكتب العنوان بتفصيل أكثر (المنطقة، الشارع، رقم البناية)';
      if (t.length > 300) return 'العنوان أطول من 300 حرف';
      return;
    case 'notes':
      if (t.length > 1000) return 'الملاحظات أطول من 1000 حرف';
      return;
  }
}

const FIELDS: Field[] = ['name', 'phone', 'address', 'notes'];

export default function Checkout() {
  useDocumentTitle('إتمام الطلب');
  const cart = useCart();
  const [form, setForm] = useState<Form>({ name: '', phone: '', address: '', notes: '' });
  useAccountPrefill((c) => setForm((f) => ({ ...f, name: f.name || c.name, phone: f.phone || c.localPhone })));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderCreated | null>(null);
  const refs = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  if (result) return <Confirmation order={result} />;

  if (cart.items.length === 0) {
    return (
      <>
        <PageHeader title="إتمام الطلب" />
        <div className="container py-12">
          <EmptyState
            title="السلة فارغة"
            description="أضف منتجات إلى السلة أولًا ثم أكمل الطلب."
            action={<ButtonLink to="/store">تصفح المتجر</ButtonLink>}
          />
        </div>
      </>
    );
  }

  const set = (f: Field) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setForm((s) => ({ ...s, [f]: v }));
    // بعد أول خروج من الحقل يصبح التحقق فوريًا أثناء الكتابة
    if (touched[f]) setErrors((s) => ({ ...s, [f]: validate(f, v) }));
  };
  const blur = (f: Field) => () => {
    setTouched((s) => ({ ...s, [f]: true }));
    setErrors((s) => ({ ...s, [f]: validate(f, form[f]) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const next: Partial<Record<Field, string>> = {};
    for (const f of FIELDS) next[f] = validate(f, form[f]);
    setErrors(next);
    setTouched({ name: true, phone: true, address: true, notes: true });
    const first = FIELDS.find((f) => next[f]);
    if (first) {
      refs.current[first]?.focus();
      return;
    }

    setSubmitting(true);
    const wa = prepareWhatsAppWindow();
    try {
      const data = await api.post<OrderCreated>('/store/orders', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notes: form.notes.trim() || undefined,
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setResult(data);
      cart.clear();
      window.scrollTo({ top: 0 });
      wa.open(data.whatsapp.link);
    } catch (err) {
      wa.cancel();
      if (err instanceof ApiError) {
        const fe: Partial<Record<Field, string>> = {};
        for (const [k, msg] of Object.entries(err.fields)) {
          if ((FIELDS as string[]).includes(k)) fe[k as Field] = msg;
        }
        if (err.field && (FIELDS as string[]).includes(err.field)) fe[err.field as Field] = err.message;
        if (Object.keys(fe).length) {
          setErrors((s) => ({ ...s, ...fe }));
          const f = FIELDS.find((x) => fe[x]);
          if (f) refs.current[f]?.focus();
        }
        // خطأ لا يخص حقلًا بعينه (مخزون، سلة، اتصال...)
        const other = Object.entries(err.fields).find(([k]) => !(FIELDS as string[]).includes(k));
        if (other) setGeneralError(other[1]);
        else if (!Object.keys(fe).length) setGeneralError(err.message);
      } else {
        setGeneralError('حدث خطأ غير متوقع، حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="إتمام الطلب" description="اكتب بياناتك وعنوان التوصيل، ونتواصل معك لتأكيد الطلب." />
      <div className="container grid gap-8 py-8 md:py-10 lg:grid-cols-12">
        <form onSubmit={submit} noValidate className="space-y-5 lg:col-span-7" aria-label="بيانات الطلب">
          {generalError && (
            <Alert tone="error" title="لم يُرسل الطلب">
              {generalError}{' '}
              <Link to="/cart" className="font-semibold text-ink underline">
                مراجعة السلة
              </Link>
            </Alert>
          )}
          <div className="card space-y-5 p-5 sm:p-6">
            <AccountNote what="الطلب" />
            <Input
              ref={(el) => (refs.current.name = el)}
              label="الاسم"
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              onBlur={blur('name')}
              error={errors.name}
              maxLength={100}
              required
            />
            <Input
              ref={(el) => (refs.current.phone = el)}
              label="رقم الهاتف"
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              placeholder="07XXXXXXXX"
              className="text-start"
              value={form.phone}
              onChange={set('phone')}
              onBlur={blur('phone')}
              error={errors.phone}
              hint="نتواصل معك على هذا الرقم، وتستخدمه للدخول إلى حسابك."
              required
            />
            <Textarea
              ref={(el) => (refs.current.address = el)}
              label="العنوان"
              name="address"
              autoComplete="street-address"
              rows={3}
              placeholder="المدينة، المنطقة، الشارع، رقم البناية"
              value={form.address}
              onChange={set('address')}
              onBlur={blur('address')}
              error={errors.address}
              maxLength={300}
              required
            />
            <Textarea
              ref={(el) => (refs.current.notes = el)}
              label="ملاحظات"
              name="notes"
              optional
              rows={3}
              placeholder="مثال: أفضّل التوصيل بعد العصر"
              value={form.notes}
              onChange={set('notes')}
              onBlur={blur('notes')}
              error={errors.notes}
              maxLength={1000}
            />
          </div>
          <Button type="submit" size="lg" block loading={submitting}>
            {submitting ? 'جاري إرسال الطلب…' : `تأكيد الطلب — ${formatJOD(cart.total)}`}
          </Button>
          <p className="text-center text-sm text-muted">
            بعد الإرسال يظهر لك رقم الطلب ورسالة جاهزة لإرسالها على واتساب.
          </p>
        </form>

        <aside className="lg:col-span-5" aria-label="ملخص الطلب">
          <div className="card p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">ملخص الطلب</h2>
              <Link to="/cart" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">
                تعديل السلة
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {cart.items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 py-3">
                  <div className="w-14 shrink-0 overflow-hidden rounded-lg">
                    <ProductImage src={i.image} alt="" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted">
                      <span className="ltr">{i.quantity}</span> × {formatJOD(i.finalPrice)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{formatJOD(i.finalPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <Totals subtotal={cart.subtotal} discount={cart.discount} total={cart.total} />
            <p className="mt-3 text-xs text-muted">الأسعار النهائية يؤكدها النظام عند الإرسال.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Totals({ subtotal, discount, total }: { subtotal: number; discount: number; total: number }) {
  return (
    <dl className="mt-3 space-y-2 border-t border-line pt-3 text-[15px]">
      <div className="flex justify-between">
        <dt className="text-muted">المجموع قبل الخصم</dt>
        <dd>{formatJOD(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted">الخصم</dt>
        <dd className={discount > 0 ? 'text-success' : undefined}>{discount > 0 ? `− ${formatJOD(discount)}` : formatJOD(0)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
        <dt>الإجمالي</dt>
        <dd>{formatJOD(total)}</dd>
      </div>
    </dl>
  );
}

function Confirmation({ order }: { order: OrderCreated }) {
  useDocumentTitle(`تم استلام الطلب #${order.number}`);
  return (
    <div className="container max-w-2xl py-10 md:py-14">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-fg">
          <Icon name="check" className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl md:text-3xl">تم استلام طلبك</h1>
        <p className="mt-2 text-xl font-bold">
          رقم الطلب <span className="ltr">#{order.number}</span>
        </p>
      </div>

      <div className="card mt-8 p-5 sm:p-6">
        <p className="text-sm text-muted">الرمز المرجعي</p>
        <p className="ltr mt-1 select-all text-2xl font-bold tracking-wider">{order.ref}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          احتفظ بهذا الرمز. تدخل به مع رقم هاتفك إلى{' '}
          <Link to="/account" className="font-semibold text-brand-600 underline dark:text-brand-200">
            صفحة حسابك
          </Link>{' '}
          لمتابعة حالة الطلب.
        </p>
      </div>

      <div className="mt-6">
        <ButtonA href={order.whatsapp.link} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" block>
          <Icon name="whatsapp" /> إرسال الطلب عبر واتساب
        </ButtonA>
        <p className="mt-2 text-center text-sm text-muted">
          {order.whatsapp.sent
            ? 'أُرسلت تفاصيل الطلب إلينا تلقائيًا أيضًا. يمكنك إرسالها من واتساب لتبدأ المحادثة معنا مباشرة.'
            : 'اضغط الزر لإرسال تفاصيل الطلب إلينا على واتساب، وسنرد عليك لتأكيد الطلب وموعد التوصيل.'}
        </p>
      </div>

      <section className="card mt-6 p-5 sm:p-6" aria-label="تفاصيل الطلب">
        <h2 className="text-lg">تفاصيل الطلب</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{it.name}</p>
                <p className="text-sm text-muted">
                  الكمية: <span className="ltr">{it.quantity}</span>
                  {it.discountPercent > 0 && (
                    <>
                      {' '}
                      · خصم <span className="ltr">{it.discountPercent}%</span>
                    </>
                  )}
                </p>
              </div>
              <span className="shrink-0 font-semibold">{formatJOD(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <Totals subtotal={Number(order.subtotal)} discount={Number(order.discountTotal)} total={Number(order.total)} />
      </section>

      <details className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <summary className="cursor-pointer font-semibold">نص رسالة الطلب</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-subtle p-4 font-sans text-sm leading-relaxed text-ink">
          {order.message}
        </pre>
      </details>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink to="/account" variant="outline" size="lg" block>
          متابعة الطلب من حسابي
        </ButtonLink>
        <ButtonLink to="/store" variant="ghost" size="lg" block>
          العودة إلى المتجر
        </ButtonLink>
      </div>
    </div>
  );
}
