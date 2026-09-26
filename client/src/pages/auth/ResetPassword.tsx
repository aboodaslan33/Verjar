import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button } from '../../components/ui';
import { useAuth } from '../../context/Auth';
import { ApiError, api } from '../../lib/api';
import type { CustomerMe } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import { AuthShell, PasswordInput, linkClass } from './shared';

export default function ResetPassword() {
  useDocumentTitle('تعيين كلمة مرور جديدة');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: typeof errors = {};
    if (pw.length < 8) errs.pw = 'كلمة المرور 8 أحرف على الأقل';
    if (pw2 !== pw) errs.pw2 = 'كلمتا المرور غير متطابقتين';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const me = await api.post<CustomerMe>('/auth/password/reset', { token, password: pw });
      setUser(me);
      navigate('/account', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="حسابي" title="كلمة مرور جديدة" subtitle="اختر كلمة مرور جديدة لحسابك.">
      {!token ? (
        <Alert tone="error">
          الرابط غير مكتمل.{' '}
          <Link to="/forgot-password" className={linkClass}>
            اطلب رابطًا جديدًا
          </Link>
        </Alert>
      ) : (
        <form noValidate onSubmit={submit} className="space-y-4">
          {error && (
            <Alert tone="error">
              {error}{' '}
              <Link to="/forgot-password" className={linkClass}>
                اطلب رابطًا جديدًا
              </Link>
            </Alert>
          )}
          <PasswordInput label="كلمة المرور الجديدة" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} hint="8 أحرف على الأقل." autoFocus />
          <PasswordInput label="تأكيد كلمة المرور" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} />
          <Button type="submit" size="lg" block loading={busy}>
            حفظ والدخول
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
