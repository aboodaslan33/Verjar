import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { FieldShell } from '../../components/ui';
import { cx } from '../../lib/format';

/** يقبل فقط مسارات داخلية لتجنب إعادة التوجيه لمواقع خارجية */
export function safeNext(next: string | null, fallback = '/account') {
  // يرفض // و /\ (تُعامل كرابط خارجي في المتصفح) وأي محارف تحكم
  if (!next || !next.startsWith('/') || /^\/[\/\\]/.test(next) || /[\\\u0000-\u001f]/.test(next)) return fallback;
  return next.startsWith('/admin') ? fallback : next;
}

export function AuthShell({ eyebrow, title, subtitle, children, footer }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container max-w-md py-10 md:py-16">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-1 text-2xl md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      <div className="card mt-6 p-5 sm:p-6">{children}</div>
      {footer && <div className="mt-6 space-y-2 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

/** حقل كلمة مرور مع زر إظهار/إخفاء نصي */
export function PasswordInput({
  label,
  error,
  hint,
  id,
  className,
  ...rest
}: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <FieldShell label={label} error={error} hint={hint} id={fid}>
      <div className="relative">
        <input
          id={fid}
          type={show ? 'text' : 'password'}
          dir="ltr"
          className={cx('input pl-16 text-end', error && 'input-error', className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-subtle hover:text-ink"
          aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {show ? 'إخفاء' : 'إظهار'}
        </button>
      </div>
    </FieldShell>
  );
}

export const linkClass = 'font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200';
