import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCustomer } from '../../context/CustomerAuth';
import { displayPhone } from '../../lib/format';
import type { CustomerMe } from '../../lib/types';

/**
 * يعبّئ بيانات العميل المسجّل مرة واحدة عند توفرها (الحقول الفارغة فقط، دون الكتابة فوق ما أدخله).
 * الحجز كضيف يبقى كما هو إن لم يكن هناك جلسة.
 */
export function useAccountPrefill(apply: (c: CustomerMe & { localPhone: string }) => void) {
  const { customer } = useCustomer();
  const done = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!customer || done.current === customer.id) return;
    done.current = customer.id;
    applyRef.current({ ...customer, localPhone: displayPhone(customer.phone) });
  }, [customer]);
  return customer;
}

/** سطر يوضح أن الطلب سيُربط بالحساب، أو يدعو الضيف للدخول */
export function AccountNote({ what = 'الحجز' }: { what?: string }) {
  const { customer, loading } = useCustomer();
  if (loading) return null;
  if (customer) {
    return (
      <p className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-muted">
        مسجّل الدخول باسم <span className="font-semibold text-ink">{customer.name}</span> — سيظهر {what} في{' '}
        <Link to="/account" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
          حسابك
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-sm text-muted">
      لديك حساب؟{' '}
      <Link to={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200">
        سجّل الدخول
      </Link>{' '}
      لتعبئة بياناتك تلقائيًا، أو أكمل كضيف.
    </p>
  );
}
