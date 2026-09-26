import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Input, PageLoader } from '../../components/ui';
import { homeFor, useAuth } from '../../context/Auth';
import { ApiError, api } from '../../lib/api';
import type { CustomerMe } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import { AuthShell, PasswordInput, linkClass, safeNext } from './shared';

export default function Login() {
  useDocumentTitle('تسجيل الدخول');
  const { user, loading, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const qs = params.get('next') ? `?next=${encodeURIComponent(next)}` : '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; noPassword?: boolean } | null>(null);
  const [fields, setFields] = useState<{ identifier?: string; password?: string }>({});
  const idRef = useRef<HTMLInputElement>(null);

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={user.role === 'CUSTOMER' ? next : homeFor(user)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const f: typeof fields = {};
    if (!identifier.trim()) f.identifier = 'أدخل رقم الهاتف أو البريد الإلكتروني';
    if (!password) f.password = 'أدخل كلمة المرور';
    setFields(f);
    if (f.identifier) return idRef.current?.focus();
    if (f.password) return;
    setBusy(true);
    try {
      const me = await api.post<CustomerMe>('/auth/login', { identifier: identifier.trim(), password });
      setUser(me);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'NO_PASSWORD') setError({ message: err.message, noPassword: true });
        else if (err.field === 'identifier' || err.fields.identifier) setFields({ identifier: err.fields.identifier ?? err.message });
        else if (Object.keys(err.fields).length) setFields({ identifier: err.fields.identifier, password: err.fields.password });
        else setError({ message: err.message });
      } else setError({ message: 'حدث خطأ غير متوقع، حاول مرة أخرى.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="حسابي"
      title="تسجيل الدخول"
      subtitle="سجّل الدخول لحجز المواعيد والطلب من المتجر ومتابعة كل شيء من مكان واحد."
      footer={
        <>
          <p>
            ليس لديك حساب؟{' '}
            <Link to={`/register${qs}`} className={linkClass}>
              أنشئ حسابًا
            </Link>
          </p>
        </>
      }
    >
      {error && (
        <Alert tone={error.noPassword ? 'warn' : 'error'} className="mb-5">
          {error.message}
          {error.noPassword && (
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link to={`/register${qs}`} className={linkClass}>
                إنشاء حساب بهذا الرقم
              </Link>
            </span>
          )}
        </Alert>
      )}
      <form noValidate onSubmit={submit} className="space-y-4">
        <Input
          ref={idRef}
          label="رقم الهاتف أو البريد الإلكتروني"
          autoComplete="username"
          dir="ltr"
          className="text-end"
          placeholder="07XXXXXXXX"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setFields((f) => ({ ...f, identifier: undefined }));
          }}
          error={fields.identifier}
          autoFocus
        />
        <PasswordInput
          label="كلمة المرور"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFields((f) => ({ ...f, password: undefined }));
          }}
          error={fields.password}
        />
        <Button type="submit" size="lg" block loading={busy}>
          دخول
        </Button>
      </form>
    </AuthShell>
  );
}
