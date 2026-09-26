import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { AdminEvent } from './types';

/**
 * إشعارات لحظية للوحة التحكم عبر SSE.
 * - version يزيد مع كل حدث؛ الصفحات تعتمد عليه لإعادة التحميل بصمت.
 * - unseen عدّاد "جديد" يُصفَّر عند فتح لوحة التحكم.
 */
type LiveCtx = {
  version: number;
  unseen: number;
  connected: boolean;
  recent: AdminEvent[];
  clearUnseen: () => void;
  /** زيادة الإصدار يدويًا (بعد تعديل محلي يؤثر على العدادات) */
  bump: () => void;
};

const LiveContext = createContext<LiveCtx>({
  version: 0,
  unseen: 0,
  connected: false,
  recent: [],
  clearUnseen: () => {},
  bump: () => {},
});

const TYPE_PREFIX: Record<AdminEvent['type'], string> = {
  'booking.created': 'حجز جديد',
  'order.created': 'طلب متجر جديد',
  'corporate.created': 'طلب شركة جديد',
  'status.changed': 'تحديث حالة',
};

export function LiveProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [version, setVersion] = useState(0);
  const [unseen, setUnseen] = useState(0);
  const [connected, setConnected] = useState(false);
  const [recent, setRecent] = useState<AdminEvent[]>([]);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(api.url('/admin/dashboard/events'), { withCredentials: true });
    const onActivity = (e: MessageEvent) => {
      let ev: AdminEvent;
      try {
        ev = JSON.parse(e.data) as AdminEvent;
      } catch {
        return;
      }
      setVersion((v) => v + 1);
      setRecent((r) => [ev, ...r].slice(0, 20));
      if (ev.type !== 'status.changed') {
        setUnseen((n) => n + 1);
        toastRef.current(`${TYPE_PREFIX[ev.type]}: ${ev.title}`, 'info');
      }
    };
    es.addEventListener('activity', onActivity as EventListener);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => {
      es.removeEventListener('activity', onActivity as EventListener);
      es.close();
    };
  }, []);

  const clearUnseen = useCallback(() => setUnseen(0), []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <LiveContext.Provider value={{ version, unseen, connected, recent, clearUnseen, bump }}>{children}</LiveContext.Provider>
  );
}

export const useLive = () => useContext(LiveContext);
