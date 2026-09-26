import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { CustomerMe } from '../lib/types';

type Ctx = {
  customer: CustomerMe | null;
  loading: boolean;
  setCustomer: (c: CustomerMe | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const CustomerAuthContext = createContext<Ctx | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setCustomer(await api.get<CustomerMe>('/auth/customer/me'));
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/auth/customer/logout').catch(() => undefined);
    setCustomer(null);
  }, []);

  return (
    <CustomerAuthContext.Provider value={{ customer, loading, setCustomer, refresh, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomer outside provider');
  return ctx;
}
