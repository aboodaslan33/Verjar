import type { ReactNode } from 'react';
import type { CustomerMe } from '../lib/types';
import { useAuth } from './Auth';

/** متوافق مع الإصدار السابق — الجلسة الفعلية في AuthProvider */
export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** واجهة العميل فوق الجلسة الموحّدة: customer = null إن لم يكن المستخدم عميلًا */
export function useCustomer() {
  const { user, loading, setUser, refresh, logout } = useAuth();
  const customer = user?.role === 'CUSTOMER' ? user : null;
  return { customer, loading, setCustomer: (c: CustomerMe | null) => setUser(c), refresh, logout };
}
