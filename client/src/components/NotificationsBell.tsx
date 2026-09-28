import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { cx, formatDate, formatTime } from '../lib/format';
import { Icon } from './ui';

export type AppNotification = { id: string; title: string; body: string; orderId: string | null; readAt: string | null; createdAt: string; recipientType: 'USER' | 'CUSTOMER' | 'VENDOR' };

const POLL_MS = 45_000;

/**
 * جرس الإشعارات (لكل الحسابات): يُحدَّث كل 45 ثانية وعند عودة التبويب، ويعلّم المقروء عند الفتح.
 * hrefFor يحدد رابط كل إشعار حسب اللوحة (إدارة/توصيل/مورد/عميل).
 */
export function NotificationsBell({ hrefFor, className }: { hrefFor: (n: AppNotification) => string | null; className?: string }) {
  const [data, setData] = useState<{ items: AppNotification[]; unread: number } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<{ items: AppNotification[]; unread: number }>('/notifications')
      .then(setData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data?.unread) {
      api.post('/notifications/read', {}).then(() => setData((d) => (d ? { ...d, unread: 0 } : d))).catch(() => undefined);
    }
  };

  const unread = data?.unread ?? 0;
  return (
    <div ref={box} className={cx('relative', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread ? `الإشعارات (${unread} جديد)` : 'الإشعارات'}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 end-0 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-fade absolute end-0 top-11 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-overlay">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">الإشعارات</p>
          {!data?.items.length ? (
            <p className="px-4 py-6 text-center text-sm text-muted">لا توجد إشعارات.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {data.items.map((n) => {
                const href = hrefFor(n);
                const body = (
                  <>
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium">{n.title}</span>
                      {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {formatDate(n.createdAt)} · <span className="ltr">{formatTime(n.createdAt)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link to={href} onClick={() => setOpen(false)} className="block px-4 py-3 text-sm hover:bg-subtle/70">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3 text-sm">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
