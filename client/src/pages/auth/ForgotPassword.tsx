import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';
import { AuthShell, linkClass } from './shared';

export default function ForgotPassword() {
  useDocumentTitle('نسيت كلمة المرور');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('أدخل البريد الإلكتروني المسجّل في حسابك');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>('/auth/password/forgot', { email: email.trim() });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حدث خطأ غير متوقع، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="حسابي"
      title="نسيت كلمة المرور"
      subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابطًا لتعيين كلمة مرور جديدة."
      footer={
        <p>
          تذكرتها؟{' '}
          <Link to="/login" className={linkClass}>
            سجّل الدخول
          </Link>
        </p>
      }
    >
      {done ? (
        <Alert tone="success" title="تحقق من بريدك">
          {done}
        </Alert>
      ) : (
        <form noValidate onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="البريد الإلكتروني"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            className="text-end"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="ليس لديك بريد في حسابك؟ تواصل معنا على واتساب لنعيّن لك كلمة مرور مؤقتة."
            autoFocus
          />
          <Button type="submit" size="lg" block loading={busy}>
            أرسل الرابط
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
