import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../../components/layout/Logo';
import { Alert, Button, Icon, Input } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { useAuth } from '../../context/Auth';
import { useTheme } from '../../context/ThemeContext';
import { api, ApiError } from '../../lib/api';
import type { AdminMe } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Login() {
  useDocumentTitle('دخول لوحة التحكم');
  const { admin, setAdmin } = useAdmin();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (admin) return <Navigate to={from.startsWith('/admin/login') ? '/admin' : from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const f: Record<string, string> = {};
    if (!email.trim()) f.email = 'أدخل البريد الإلكتروني';
    if (!password) f.password = 'أدخل كلمة المرور';
    setFields(f);
    if (Object.keys(f).length) return;
    setLoading(true);
    try {
      const me = await api.post<AdminMe>('/auth/admin/login', { email: email.trim(), password });
      setAdmin(me);
      navigate(from.startsWith('/admin/login') ? '/admin' : from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? null : err.message);
      } else setError('تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={toggle}
          className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
          aria-label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo to="/" />
          </div>
          <div className="card p-6 sm:p-7">
            <h1 className="text-xl">دخول لوحة التحكم</h1>
            <p className="mt-1 text-sm text-muted">للإدارة والموظفين فقط.</p>
            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {user?.role === 'CUSTOMER' && !error && (
                <Alert tone="info">أنت مسجّل الدخول كعميل ({user.name}). الدخول هنا سينهي جلسة العميل.</Alert>
              )}
              {error && <Alert tone="error">{error}</Alert>}
              <Input
                label="البريد الإلكتروني"
                type="email"
                autoComplete="username"
                inputMode="email"
                dir="ltr"
                className="text-start"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fields.email}
                autoFocus
              />
              <div className="relative">
                <Input
                  label="كلمة المرور"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  dir="ltr"
                  className="pl-16 text-start"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fields.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute end-2 top-[2.1rem] rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-subtle"
                >
                  {showPw ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
              <Button type="submit" block loading={loading}>
                دخول
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
