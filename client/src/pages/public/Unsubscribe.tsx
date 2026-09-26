import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';

/** إلغاء الاشتراك في النشرة البريدية من الرابط الموجود أسفل كل رسالة */
export default function Unsubscribe() {
  useDocumentTitle('إلغاء الاشتراك');
  const [params] = useSearchParams();
  const c = params.get('c') ?? '';
  const t = params.get('t') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function confirm() {
    setState('busy');
    try {
      await api.post(`/email/unsubscribe?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}`);
      setState('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذر إلغاء الاشتراك، حاول مرة أخرى.');
      setState('error');
    }
  }

  return (
    <div className="container max-w-md py-14 md:py-20">
      <div className="card animate-fade-up p-6 text-center sm:p-8">
        <h1 className="text-2xl">إلغاء الاشتراك</h1>
        {state === 'done' ? (
          <>
            <p className="mt-3 text-muted">تم. لن تصلك رسائل الأخبار والعروض بعد الآن.</p>
            <p className="mt-2 text-sm text-muted">
              يمكنك إعادة الاشتراك في أي وقت من{' '}
              <Link to="/account" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
                حسابك
              </Link>
              .
            </p>
          </>
        ) : !c || !t ? (
          <Alert tone="error" className="mt-4 text-start">
            الرابط غير مكتمل. استخدم رابط إلغاء الاشتراك الموجود أسفل الرسالة.
          </Alert>
        ) : (
          <>
            <p className="mt-3 text-muted">هل تريد إيقاف رسائل أخبار المنتجات والخدمات الجديدة؟ رسائل حجوزاتك وطلباتك لا تتأثر.</p>
            {state === 'error' && (
              <Alert tone="error" className="mt-4 text-start">
                {error}
              </Alert>
            )}
            <Button className="mt-6" block size="lg" loading={state === 'busy'} onClick={confirm}>
              تأكيد إلغاء الاشتراك
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
