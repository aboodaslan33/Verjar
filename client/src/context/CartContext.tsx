import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '../lib/types';
import { useAuth } from './Auth';

/** عنصر السلة — نسخة مختصرة من المنتج لعرضها دون طلب إضافي. الأسعار النهائية يحسبها السيرفر */
export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  finalPrice: number;
  discountPercent: number;
  stock: number;
  quantity: number;
};

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  total: number;
  discount: number;
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const KEY = 'vj-cart-v1';
const CartContext = createContext<CartCtx | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.productId && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

const OWNER_KEY = 'vj-cart-owner';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);
  const { user, loading } = useAuth();

  // السلة تخص حساب العميل: تُفرَّغ عند الخروج أو عند الدخول بحساب آخر (أجهزة مشتركة)
  useEffect(() => {
    if (loading) return;
    const current = user?.role === 'CUSTOMER' ? user.id : null;
    let owner: string | null = null;
    try {
      owner = localStorage.getItem(OWNER_KEY);
      if (current) localStorage.setItem(OWNER_KEY, current);
      else localStorage.removeItem(OWNER_KEY);
    } catch {
      // التخزين غير متاح
    }
    // سلة بدون مالك (من قبل هذا التحديث) تُنسب للعميل الحالي
    if (owner && owner !== current) setItems([]);
  }, [user, loading]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // التخزين غير متاح (وضع خاص)
    }
  }, [items]);

  const add = useCallback((p: Product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      // الحد الأقصى 20 قطعة من المنتج في الطلب الواحد (مطابق للسيرفر)
      const cap = Math.min(Math.max(p.stock, 0), 20);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id ? { ...i, stock: cap, quantity: Math.min(i.quantity + qty, cap || 1) } : i,
        );
      }
      const image = p.media.find((m) => m.kind === 'IMAGE')?.url ?? null;
      return [
        ...prev,
        {
          productId: p.id,
          slug: p.slug,
          name: p.name,
          image,
          price: p.price,
          finalPrice: p.finalPrice,
          discountPercent: p.discountPercent,
          stock: cap,
          quantity: Math.min(qty, cap || 1),
        },
      ];
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, Math.min(qty, i.stock || 99)) } : i)),
    );
  }, []);

  const remove = useCallback((productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const total = items.reduce((s, i) => s + i.finalPrice * i.quantity, 0);
    return {
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: Math.round(subtotal * 1000) / 1000,
      total: Math.round(total * 1000) / 1000,
      discount: Math.round((subtotal - total) * 1000) / 1000,
      add,
      setQty,
      remove,
      clear,
    };
  }, [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
