import { useState, type ReactNode } from 'react';
import { Input } from '../../components/ui';
import type { InputHTMLAttributes } from 'react';

/** يقبل فقط مسارات داخلية لتجنب إعادة التوجيه لمواقع خارجية */
export function safeNext(next: string | null, fallback = '/account') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/admin') ? next : fallback;
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
export function PasswordInput({ label, error, hint, ...rest }: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input label={label} type={show ? 'text' : 'password'} dir="ltr" className="pl-16 text-end" error={error} hint={hint} {...rest} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute end-2 top-[2.1rem] rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-subtle hover:text-ink"
        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {show ? 'إخفاء' : 'إظهار'}
      </button>
    </div>
  );
}

export const linkClass = 'font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-200';
