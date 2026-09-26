import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Input, PageLoader } from '../../components/ui';
import { homeFor, useAuth } from '../../context/Auth';
import { ApiError, api } from '../../lib/api';
import { isJordanMobile } from '../../lib/format';
import type { CustomerMe } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import { AuthShell, PasswordInput, linkClass, safeNext } from './shared';

type Form = { name: string; phone: string; email: string; password: string; confirm: string; ref: string };
type Errors = Partial<Record<keyof Form, string>>;

function validate(v: Form, needRef: boolean): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name) e.name = 'الاسم مطلوب';
  else if (name.length < 2) e.name = 'الاسم قصير جدًا';
  if (!v.phone.trim()) e.phone = 'رقم الهاتف مطلوب';
  else if (!isJordanMobile(v.phone)) e.phone = 'أدخل رقم هاتف أردني صحيح بالصيغة 07XXXXXXXX';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'البريد الإلكتروني غير صالح';
  if (!v.password) e.password = 'كلمة المرور مطلوبة';
  else if (v.password.length < 8) e.password = 'كلمة المرور 8 أحرف على الأقل';
  if (v.password && v.confirm !== v.password) e.confirm = 'كلمتا المرور غير متطابقتين';
  if (needRef && !v.ref.trim()) e.ref = 'أدخل رقم المرجع';
  return e;
}

export default function Register() {
  useDocumentTitle('إنشاء حساب');
  const { user, loading, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const qs = params.get('next') ? `?next=${encodeURIComponent(next)}` : '';

  const [v, setV] = useState<Form>({ name: '', phone: '', email: '', password: '', confirm: '', ref: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<string | null>(null);
  const [phoneTaken, setPhoneTaken] = useState(false);
  const [optIn, setOptIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={user.role === 'CUSTOMER' ? next : homeFor(user)} replace />;

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    setErrors((s) => ({ ...s, [k]: undefined }));
    if (k === 'phone') {
      setClaim(null);
      setPhoneTaken(false);
    }
  };

  function focusFirst(errs: Errors) {
    const first = (['name', 'phone', 'email', 'password', 'confirm', 'ref'] as const).find((k) => errs[k]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = validate(v, Boolean(claim));
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirst(errs);
    setBusy(true);
    try {
      const me = await api.post<CustomerMe>('/auth/register', {
        name: v.name.trim(),
        phone: v.phone.trim(),
        email: v.email.trim() || null,
        password: v.password,
        emailOptIn: optIn,
        ...(claim ? { ref: v.ref.trim() } : {}),
      });
      setUser(me);
      navigate(next, { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setError('حدث خطأ غير متوقع، حاول مرة أخرى.');
      } else if (err.code === 'CLAIM_REQUIRED') {
        setClaim(err.message);
        window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('[name="ref"]')?.focus(), 0);
      } else if (err.status === 409 && err.field === 'phone') {
        setPhoneTaken(true);
        setErrors({ phone: err.message });
      } else if (err.field) {
        const f = { [err.field]: err.message } as Errors;
        setErrors(f);
        focusFirst(f);
      } else if (Object.keys(err.fields).length) {
        setErrors(err.fields as Errors);
        focusFirst(err.fields as Errors);
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="حسابي"
      title="إنشاء حساب"
      subtitle="احجز أسرع ببيانات محفوظة، وتابع كل حجوزاتك وطلباتك في صفحة واحدة."
      footer={
        <p>
          لديك حساب؟{' '}
          <Link to={`/login${qs}`} className={linkClass}>
            سجّل الدخول
          </Link>
        </p>
      }
    >
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}
      {phoneTaken && (
        <Alert tone="warn" className="mb-5">
          هذا الرقم لديه حساب.{' '}
          <Link to={`/login${qs}`} className={linkClass}>
            انتقل لتسجيل الدخول
          </Link>
        </Alert>
      )}
      <form ref={formRef} noValidate onSubmit={submit} className="space-y-4">
        <Input name="name" label="الاسم" autoComplete="name" maxLength={100} value={v.name} onChange={set('name')} error={errors.name} autoFocus />
        <Input
          name="phone"
          label="رقم الهاتف"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="text-end"
          placeholder="07XXXXXXXX"
          value={v.phone}
          onChange={set('phone')}
          error={errors.phone}
          hint="رقم جوال أردني، تدخل به إلى حسابك ونتواصل معك عليه."
        />
        <Input
          name="email"
          label="البريد الإلكتروني"
          optional
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          className="text-end"
          value={v.email}
          onChange={set('email')}
          error={errors.email}
          hint="يمكنك الدخول به بدل رقم الهاتف."
        />
        {v.email.trim() && (
          <Checkbox
            label="أرسلوا لي أخبار المنتجات والخدمات الجديدة"
            description="رسائل قليلة بالبريد، ويمكنك إلغاؤها في أي وقت."
            checked={optIn}
            onChange={setOptIn}
          />
        )}
        <PasswordInput name="password" label="كلمة المرور" autoComplete="new-password" value={v.password} onChange={set('password')} error={errors.password} hint="8 أحرف على الأقل." />
        <PasswordInput name="confirm" label="تأكيد كلمة المرور" autoComplete="new-password" value={v.confirm} onChange={set('confirm')} error={errors.confirm} />

        {claim && (
          <div className="space-y-3 border-t border-line pt-4">
            <Alert tone="info">{claim}</Alert>
            <Input
              name="ref"
              label="رقم المرجع"
              dir="ltr"
              className="text-end uppercase"
              placeholder="B-XXXXXX"
              value={v.ref}
              onChange={set('ref')}
              error={errors.ref}
              hint="تجده في رسالة تأكيد الحجز أو الطلب."
            />
          </div>
        )}

        <Button type="submit" size="lg" block loading={busy}>
          إنشاء الحساب
        </Button>
      </form>
    </AuthShell>
  );
}
