import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DeliveryStatusTag } from '../../components/delivery/Tags';
import { DeliveryTimeline } from '../../components/delivery/Timeline';
import { Alert, Button, Input } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { DeliveryStatus } from '../../lib/delivery';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

type Result = { code: string; status: DeliveryStatus; createdAt: string; deliveredAt: string | null; timeline: { status: DeliveryStatus; at: string }[] };

/** تتبّع طلب بدون تسجيل دخول: رقم الطلب + هاتف العميل */
export default function Track() {
  useDocumentTitle('تتبّع طلبك');
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(await api.get<Result>('/track', { code: code.trim(), phone: phone.trim() }));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'تعذر التتبّع، حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container max-w-lg py-10 md:py-16">
      <div className="card animate-fade-up p-5 sm:p-8">
        <h1 className="text-2xl">تتبّع طلبك</h1>
        <p className="mt-2 text-sm text-muted">أدخل رقم الطلب (مثل FG-ORD-000123) ورقم الهاتف المسجّل على الطلب.</p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <Input label="رقم الطلب" dir="ltr" className="text-end uppercase" placeholder="FG-ORD-000000" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <Input label="رقم الهاتف" type="tel" inputMode="tel" dir="ltr" className="text-end" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" block loading={busy} disabled={code.trim().length < 4 || phone.trim().length < 9}>
            تتبّع
          </Button>
        </form>
        {result && (
          <section className="mt-8 border-t border-line pt-6" aria-live="polite">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold ltr">{result.code}</p>
              <DeliveryStatusTag status={result.status} />
            </div>
            <p className="mb-5 text-sm text-muted">تاريخ الطلب: {formatDate(result.createdAt, true)}</p>
            <DeliveryTimeline status={result.status} timeline={result.timeline} />
          </section>
        )}
      </div>
    </div>
  );
}
