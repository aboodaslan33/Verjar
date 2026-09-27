import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { LogoMark } from '../../components/layout/Logo';
import { FieldShell, Icon } from '../../components/ui';
import { WORKS } from '../../lib/works';
import { cx } from '../../lib/format';

/** يقبل فقط مسارات داخلية لتجنب إعادة التوجيه لمواقع خارجية */
export function safeNext(next: string | null, fallback = '/account') {
  // يرفض // و /\ (تُعامل كرابط خارجي في المتصفح) وأي محارف تحكم
  if (!next || !next.startsWith('/') || /^\/[\/\\]/.test(next) || /[\\\u0000-\u001f]/.test(next)) return fallback;
  return next.startsWith('/admin') ? fallback : next;
}

/**
 * صفحات الدخول والتسجيل: النموذج في عمود مريح للقراءة،
 * وعلى الشاشات الكبيرة لوحة فحمية بالهوية وما يحصل عليه العميل من حسابه.
 */
export function AuthShell({ eyebrow, title, subtitle, children, footer }: { eyebrow: string; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const image = WORKS[1];
  return (
    <div className="container py-8 md:py-12">
      <div className="grid overflow-hidden rounded-2xl border border-line lg:grid-cols-2">
        <div className="px-5 py-10 sm:px-10 md:py-14 lg:px-14">
          <div className="mx-auto max-w-md">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-4 text-[1.75rem] md:text-[2.125rem]">{title}</h1>
            {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 space-y-2 border-t border-line pt-6 text-center text-sm text-muted">{footer}</div>}
          </div>
        </div>
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-inverse p-12 text-inverse-fg lg:flex" aria-hidden>
          <img src={image.src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" loading="lazy" />
          <LogoMark light className="relative h-11 w-auto" />
          <div className="relative">
            <p className="max-w-sm font-display text-2xl font-semibold leading-relaxed text-inverse-fg">حسابك مكان واحد لكل حجوزاتك وطلباتك.</p>
            <ul className="mt-8 space-y-4 text-[15px] text-inverse-fg/75">
              {['حالة كل حجز وطلب لحظة بلحظة', 'عروض الأسعار والعقود والفواتير', 'الدفعات والرصيد المتبقي'].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-fg">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
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

export const linkClass = 'font-semibold text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink';
