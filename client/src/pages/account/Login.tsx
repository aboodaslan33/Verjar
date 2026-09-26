import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, ButtonLink, Input, PageLoader, Skeleton } from '../../components/ui';
import { isAdminUser, useAuth } from '../../context/Auth';
import { useCustomer } from '../../context/CustomerAuth';
import { ApiError, api } from '../../lib/api';
import { cx, isValidPhone } from '../../lib/format';
import type { CustomerMe } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type Methods = { otp: boolean; password: boolean; reference: boolean };
type Mode = 'secret' | 'otp';
const RESEND_SECONDS = 60;

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

export default function Login() {
  useDocumentTitle('الدخول إلى صفحتي');
  const { customer, loading, setCustomer } = useCustomer();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const methods = useAsync(() => api.get<Methods>('/auth/customer/methods'), []);

  const [mode, setMode] = useState<Mode>('secret');
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; noAccount?: boolean } | null>(null);
  const [fieldErr, setFieldErr] = useState<{ phone?: string; secret?: string; code?: string }>({});
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (otpSent) codeRef.current?.focus();
  }, [otpSent]);

  if (loading) return <PageLoader />;
  if (customer) return <Navigate to={next} replace />;
  if (isAdminUser(user)) return <Navigate to="/admin" replace />;

  const phoneError = !phone.trim() ? 'أدخل رقم الهاتف' : isValidPhone(phone) ? undefined : 'رقم الهاتف غير صحيح (مثال: 0791234567)';
  const shownPhoneErr = fieldErr.phone ?? (phoneTouched ? phoneError : undefined);
  const otpAvailable = Boolean(methods.data?.otp);

  function fail(e: unknown) {
    if (e instanceof ApiError) {
      if (e.code === 'NO_ACCOUNT' || e.status === 404) {
        setError({ message: e.message, noAccount: true });
      } else if (Object.keys(e.fields).length) {
        setFieldErr({ phone: e.fields.phone, secret: e.fields.secret, code: e.fields.code });
        if (!e.fields.phone && !e.fields.secret && !e.fields.code) setError({ message: e.message });
      } else {
        setError({ message: e.message });
      }
    } else setError({ message: 'حدث خطأ غير متوقع، حاول مرة أخرى.' });
  }

  function checkPhone() {
    setPhoneTouched(true);
    if (phoneError) {
      phoneRef.current?.focus();
      return false;
    }
    return true;
  }

  function success(c: CustomerMe) {
    setCustomer(c);
    navigate(next, { replace: true });
  }

  async function loginSecret(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    if (!checkPhone()) return;
    if (!secret.trim()) {
      setFieldErr({ secret: 'أدخل رقم المرجع أو كلمة المرور' });
      return;
    }
    setBusy(true);
    try {
      success(await api.post<CustomerMe>('/auth/customer/login', { phone: phone.trim(), secret: secret.trim() }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() {
    setError(null);
    setFieldErr({});
    if (!checkPhone()) return;
    setBusy(true);
    try {
      const r = await api.post<{ sent: boolean; expiresInSeconds: number; devCode?: string }>('/auth/customer/otp/request', {
        phone: phone.trim(),
      });
      setOtpSent(true);
      setDevCode(r.devCode ?? null);
      setCode('');
      setCountdown(RESEND_SECONDS);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(value = code) {
    setError(null);
    setFieldErr({});
    if (!/^\d{6}$/.test(value)) {
      setFieldErr({ code: 'الرمز 6 أرقام' });
      return;
    }
    setBusy(true);
    try {
      success(await api.post<CustomerMe>('/auth/customer/otp/verify', { phone: phone.trim(), code: value }));
    } catch (err) {
      fail(err);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setFieldErr({});
  }

  const phoneInput = (
    <Input
      ref={phoneRef}
      label="رقم الهاتف"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      dir="ltr"
      className="text-end"
      placeholder="07XXXXXXXX"
      value={phone}
      disabled={mode === 'otp' && otpSent}
      onChange={(e) => {
        setPhone(e.target.value);
        setFieldErr((f) => ({ ...f, phone: undefined }));
      }}
      onBlur={() => setPhoneTouched(true)}
      error={shownPhoneErr}
      hint="الرقم الذي استخدمته في الحجز أو الطلب"
    />
  );

  return (
    <div className="container max-w-md py-10 md:py-16">
      <p className="eyebrow">صفحتي</p>
      <h1 className="mt-1 text-2xl md:text-3xl">تابع حجوزاتك وطلباتك</h1>
      <p className="mt-2 text-muted">حالة الحجز، عروض الأسعار، العقود والدفعات — كلها في مكان واحد.</p>

      <div className="card mt-6 p-5 sm:p-6">
        {methods.loading ? (
          <Skeleton className="mb-5 h-12 rounded-xl" />
        ) : (
          otpAvailable && (
            <div role="tablist" aria-label="طريقة الدخول" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
              {(
                [
                  ['secret', 'رقم المرجع أو كلمة المرور'],
                  ['otp', 'رمز عبر واتساب'],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cx(
                    'min-h-[44px] rounded-lg px-2 text-sm font-semibold transition-colors',
                    mode === m ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )
        )}

        {error && (
          <Alert tone={error.noAccount ? 'warn' : 'error'} className="mb-5" title={error.noAccount ? 'لا يوجد حساب بهذا الرقم' : undefined}>
            {error.noAccount ? (
              <>
                <p>يُنشأ حسابك تلقائيًا عند أول حجز أو طلب. تأكد من الرقم، أو ابدأ بطلبك الأول:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink to="/bookings" size="sm">
                    احجز موعدًا
                  </ButtonLink>
                  <ButtonLink to="/corporate" size="sm" variant="outline">
                    طلب شركة
                  </ButtonLink>
                </div>
              </>
            ) : (
              error.message
            )}
          </Alert>
        )}

        {mode === 'secret' ? (
          <form noValidate onSubmit={loginSecret} className="space-y-4">
            {phoneInput}
            <Input
              label="رقم المرجع أو كلمة المرور"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className="text-end"
              placeholder="B-XXXXXX"
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setFieldErr((f) => ({ ...f, secret: undefined }));
              }}
              error={fieldErr.secret}
              hint="رقم المرجع موجود في رسالة تأكيد الحجز أو الطلب، مثل B-7K2M9Q."
            />
            <Button type="submit" size="lg" block loading={busy}>
              دخول
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {phoneInput}
            {!otpSent ? (
              <Button size="lg" block loading={busy} onClick={requestOtp}>
                أرسل الرمز على واتساب
              </Button>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyOtp();
                }}
                className="space-y-4"
              >
                {devCode && (
                  <Alert tone="info" title="وضع التطوير">
                    لا يُرسل واتساب في بيئة التطوير. الرمز: <span className="ltr font-bold tracking-widest text-ink">{devCode}</span>
                  </Alert>
                )}
                <Input
                  ref={codeRef}
                  label="الرمز المرسل (6 أرقام)"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  className="text-center text-2xl font-bold tracking-[0.5em]"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '').slice(0, 6);
                    setCode(val);
                    setFieldErr({});
                    if (val.length === 6 && !busy) verifyOtp(val);
                  }}
                  error={fieldErr.code}
                />
                <Button type="submit" size="lg" block loading={busy}>
                  تأكيد الدخول
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="min-h-[44px] text-muted hover:text-ink"
                    onClick={() => {
                      setOtpSent(false);
                      setDevCode(null);
                      setCode('');
                    }}
                  >
                    تغيير الرقم
                  </button>
                  {countdown > 0 ? (
                    <span className="text-muted" aria-live="polite">
                      إعادة الإرسال بعد <span className="ltr">{countdown}</span> ث
                    </span>
                  ) : (
                    <button type="button" className="min-h-[44px] font-semibold text-brand-700 hover:underline dark:text-brand-200" onClick={requestOtp} disabled={busy}>
                      إعادة إرسال الرمز
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        لديك حساب بكلمة مرور؟{' '}
        <Link to="/login" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
          تسجيل الدخول
        </Link>
        {' · '}
        ليس لديك حجز بعد؟{' '}
        <Link to="/bookings" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
          احجز أول موعد
        </Link>
      </p>
    </div>
  );
}
