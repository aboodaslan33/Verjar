import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { AdminMe, SessionUser } from '../lib/types';

type Ctx = {
  /** المستخدم الحالي (عميل أو أدمن) أو null للزائر */
  user: SessionUser | null;
  /** true حتى ينتهي أول نداء لـ /auth/me */
  loading: boolean;
  setUser: (u: SessionUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

/**
 * الجلسة الموحّدة: التوكن في كوكي httpOnly فقط (لا شيء في localStorage).
 * عند الإقلاع يُستدعى /auth/me لاستعادة الجلسة بعد إعادة التحميل.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<SessionUser>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    // مسودات النماذج تحوي بيانات شخصية (الاسم والهاتف والعنوان) — تُمسح عند الخروج
    try {
      for (const k of Object.keys(sessionStorage)) if (/^vj-(booking|corporate)-draft/.test(k)) sessionStorage.removeItem(k);
    } catch {
      // التخزين غير متاح
    }
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

/** حسابات لوحة التحكم (الإدارة ومديرو التوصيل) */
export const isAdminUser = (u: SessionUser | null): u is AdminMe =>
  u?.role === 'ADMIN' || u?.role === 'STAFF' || u?.role === 'MANAGER';

/** موظف التوصيل: لوحته /driver */
export const isDriverUser = (u: SessionUser | null): u is AdminMe => u?.role === 'DRIVER';

/** أي حساب غير عميل (إدارة أو توصيل) */
export const isStaffUser = (u: SessionUser | null): u is AdminMe => isAdminUser(u) || isDriverUser(u);

/** الصفحة الرئيسية لكل نوع مستخدم بعد الدخول */
export const homeFor = (u: SessionUser) => (isDriverUser(u) ? '/driver' : isAdminUser(u) ? '/admin' : '/account');

/** هل يملك المستخدم صلاحية (الـ Super Admin يملكها كلها) */
export const hasPerm = (u: SessionUser | null, ...perms: string[]) =>
  Boolean(u && u.role !== 'CUSTOMER' && (u.role === 'ADMIN' || perms.some((p) => u.permissions?.includes(p))));
