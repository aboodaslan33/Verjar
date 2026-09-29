import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { cx, formatDate, formatTime } from '../../lib/format';
import { Button, Icon } from '../ui';

export type ThreadMessage = { id: string; senderType: 'CUSTOMER' | 'VENDOR' | 'ADMIN'; senderName: string; body: string; masked: boolean; createdAt: string };

/**
 * محادثة داخل المنصة (العميل ↔ المورد، والإدارة تتدخل عند الحاجة).
 * تتحدث كل 15 ثانية أثناء فتحها. أرقام الهواتف والبريد تُخفى قبل قبول العرض.
 */
export function MessageThread({ path, me, disabled, hint }: { path: string; me: 'CUSTOMER' | 'VENDOR' | 'ADMIN'; disabled?: string | null; hint?: string }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<ThreadMessage[]>(path)
      .then(setMessages)
      .catch(() => setMessages((m) => m ?? []));
  }, [path]);

  useEffect(() => {
    setMessages(null);
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.post<ThreadMessage>(path, { body: text });
      setMessages((l) => [...(l ?? []), m]);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الإرسال');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div ref={list} className="max-h-[26rem] min-h-[10rem] space-y-3 overflow-y-auto p-3 sm:p-4" aria-live="polite">
        {messages === null ? (
          <p className="py-6 text-center text-sm text-muted">جاري التحميل…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">لا توجد رسائل بعد. ابدأ المحادثة.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderType === me;
            return (
              <div key={m.id} className={cx('flex', mine ? 'justify-start' : 'justify-end')}>
                <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px]', mine ? 'rounded-ss-sm bg-primary/15' : m.senderType === 'ADMIN' ? 'rounded-se-sm bg-ink text-bg' : 'rounded-se-sm bg-subtle')}>
                  <p className={cx('mb-0.5 text-xs font-semibold', m.senderType === 'ADMIN' && !mine ? 'text-primary' : 'text-muted')}>{mine ? 'أنت' : m.senderName}</p>
                  <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                  <p className={cx('mt-1 text-[11px]', m.senderType === 'ADMIN' && !mine ? 'text-bg/60' : 'text-muted')}>
                    {formatDate(m.createdAt)} · {formatTime(m.createdAt)}
                    {m.masked && ' · أُخفيت بيانات تواصل'}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      {disabled ? (
        <p className="border-t border-line bg-subtle px-4 py-3 text-sm text-muted">{disabled}</p>
      ) : (
        <form onSubmit={send} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
              }}
              rows={2}
              maxLength={4000}
              placeholder="اكتب رسالتك…"
              aria-label="نص الرسالة"
              className="input min-h-[2.75rem] flex-1 resize-none py-2"
            />
            <Button type="submit" loading={busy} disabled={!body.trim()} aria-label="إرسال">
              <Icon name="arrowLeft" className="h-5 w-5" />
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
        </form>
      )}
    </div>
  );
}
