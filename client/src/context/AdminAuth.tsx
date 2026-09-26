import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { AdminMe } from '../lib/types';

type Ctx = {
  admin: AdminMe | null;
  loading: boolean;
  setAdmin: (a: AdminMe | null) => void;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminMe>('/auth/admin/me')
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/admin/logout').catch(() => undefined);
    setAdmin(null);
  }, []);

  return <AdminAuthContext.Provider value={{ admin, loading, setAdmin, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdmin outside provider');
  return ctx;
}
