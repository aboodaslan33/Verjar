import type { ReactNode } from 'react';
import type { AdminMe } from '../lib/types';
import { isAdminUser, useAuth } from './Auth';

/** متوافق مع الإصدار السابق — الجلسة الفعلية في AuthProvider */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** واجهة الأدمن فوق الجلسة الموحّدة: admin = null إن لم يكن المستخدم أدمن */
export function useAdmin() {
  const { user, loading, setUser, logout } = useAuth();
  const admin = isAdminUser(user) ? user : null;
  return { admin, loading, setAdmin: (a: AdminMe | null) => setUser(a), logout };
}
