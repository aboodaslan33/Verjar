import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { OptionSelection, Product } from '../lib/types';
import { useAuth } from './Auth';

/** عنصر السلة — نسخة مختصرة من المنتج لعرضها دون طلب إضافي. الأسعار النهائية يحسبها السيرفر */
export type CartItem = {
  /** مفتاح البند: المنتج + الخيار المختار (كنباية حمراء وكنباية زرقاء بندان منفصلان) */
  key: string;
  productId: string;
  /** الخيار المختار — يتحقق منه السيرفر عند الطلب */
  options?: OptionSelection;
  slug: string;
  name: string;
  image: string | null;
  price: number;
  finalPrice: number;
  discountPercent: number;
  stock: number;
  quantity: number;
  /** المورد — السلة تقبل منتجات من أكثر من مورد، والطلب ينقسم عند الإرسال */
  vendorName?: string;
  vendorSlug?: string;
};

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  total: number;
  discount: number;
  add: (p: Product, qty?: number, options?: OptionSelection) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const KEY = 'vj-cart-v1';
const CartContext = createContext<CartCtx | null>(null);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
    // سلة محفوظة من قبل الخيارات: المفتاح = المنتج
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.productId && i.quantity > 0).map((i) => ({ ...i, key: i.key ?? i.productId })) : [];
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

  const add = useCallback((p: Product, qty = 1, options?: OptionSelection) => {
    const sel = options?.length ? options : undefined;
    const key = cartKey(p.id, sel);
    setItems((prev) => {
      // الحد الأقصى 20 قطعة من المنتج في الطلب الواحد (مطابق للسيرفر)
      const cap = Math.min(Math.max(p.stock, 0), 20);
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, stock: cap, quantity: Math.min(i.quantity + qty, cap || 1) } : i));
      }
      // صورة اللون المختار إن وُجدت، وإلا أول صورة
      const optionMedia = sel
        ?.map((s) => p.options?.find((g) => g.name === s.name)?.values.find((v) => v.label === s.value)?.mediaId)
        .find(Boolean);
      const image = p.media.find((m) => m.id === optionMedia && m.kind === 'IMAGE')?.url ?? p.media.find((m) => m.kind === 'IMAGE')?.url ?? null;
      return [
        ...prev,
        {
          key,
          productId: p.id,
          options: sel,
          slug: p.slug,
          name: p.name,
          image,
          price: p.price,
          finalPrice: p.finalPrice,
          discountPercent: p.discountPercent,
          stock: cap,
          quantity: Math.min(qty, cap || 1),
          vendorName: p.vendor?.name,
          vendorSlug: p.vendor?.slug,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.min(qty, i.stock || 99)) } : i)));
  }, []);

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => i.key !== key)), []);
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

export const cartKey = (productId: string, sel?: OptionSelection) =>
  sel?.length ? `${productId}|${sel.map((s) => `${s.name}=${s.value}`).join('|')}` : productId;
