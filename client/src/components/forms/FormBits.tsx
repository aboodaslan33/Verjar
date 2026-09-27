import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { WhatsAppResult } from '../../lib/types';
import { Button, ButtonA, ButtonLink, Icon, SuccessMark } from '../ui';

/** شريط أزرار التنقل بين الخطوات — ثابت أسفل الشاشة على الجوال */
export function StepActions({
  onBack,
  onNext,
  nextLabel = 'التالي',
  loading,
  backLabel = 'السابق',
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
  backLabel?: string;
}) {
  return (
    <div
      className="sticky z-30 -mx-4 mt-8 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-2"
      style={{ bottom: 'var(--tabbar-h)' }}
    >
      <div className="flex gap-2 sm:justify-between">
        {onBack ? (
          <Button variant="outline" size="lg" onClick={onBack} disabled={loading} className="shrink-0 px-4 sm:px-6">
            <Icon name="chevronRight" className="h-4 w-4" />
            {backLabel}
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button size="lg" onClick={onNext} loading={loading} className="flex-1 sm:min-w-[12rem] sm:flex-none">
          {nextLabel}
          {!loading && <Icon name="chevronLeft" className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/** عنوان الخطوة — يستلم التركيز عند الانتقال لقارئات الشاشة ولوحة المفاتيح */
export function StepHeading({ title, description, stepKey }: { title: string; description?: ReactNode; stepKey: string | number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus({ preventScroll: true });
  }, [stepKey]);
  return (
    <div className="mb-6">
      <h2 ref={ref} tabIndex={-1} className="text-xl outline-none md:text-[1.625rem]">
        {title}
      </h2>
      {description && <p className="mt-1 text-muted">{description}</p>}
    </div>
  );
}

/** قسم في صفحة المراجعة مع زر تعديل */
export function ReviewSection({ title, onEdit, rows }: { title: string; onEdit?: () => void; rows: [string, ReactNode][] }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <section className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-subtle/60 px-4 py-1.5">
        <h3 className="text-base">{title}</h3>
        {onEdit && (
          <button type="button" onClick={onEdit} className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-ink underline-offset-4 hover:underline">
            تعديل
          </button>
        )}
      </div>
      <dl className="divide-y divide-line">
        {visible.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-3 px-4 py-2.5 text-[15px]">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** شاشة نجاح الإرسال (حجز أو طلب شركة) */
export function SubmissionSuccess({
  title,
  number,
  refCode,
  whatsapp,
  message,
  children,
  intro,
  noun = 'الحجز',
}: {
  noun?: 'الحجز' | 'الطلب';
  title: string;
  number: number;
  refCode: string;
  whatsapp: WhatsAppResult;
  message: string;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="container max-w-2xl py-10 md:py-16">
      <div className="anim-rise overflow-hidden rounded-xl border border-line bg-surface">
        {/* رأس فحمي كالشعار */}
        <div className="bg-inverse px-6 pb-8 pt-10 text-center text-inverse-fg">
          <SuccessMark />
          <h1 ref={ref} tabIndex={-1} className="mt-5 text-2xl text-inverse-fg outline-none md:text-[2rem]">
            {title}
          </h1>
          <p className="mt-2 text-inverse-fg/65">
            رقم {noun} <span className="num font-display text-lg font-semibold text-inverse-fg">#{number}</span>
          </p>
        </div>

        {/* قسيمة المرجع */}
        <div className="relative flex items-center justify-between gap-4 border-b border-dashed border-line-strong px-6 py-5">
          <span className="absolute -start-3 -top-3 h-6 w-6 rounded-full bg-bg" aria-hidden />
          <span className="absolute -end-3 -top-3 h-6 w-6 rounded-full bg-bg" aria-hidden />
          <div>
            <p className="text-xs text-muted">رقم المرجع</p>
            <p className="ltr mt-0.5 select-all font-display text-2xl font-semibold tracking-wider text-ink">{refCode}</p>
          </div>
          <Link to="/account" className="text-sm font-semibold text-ink underline-offset-4 hover:underline">
            تابعه من حسابك
          </Link>
        </div>

        <div className="space-y-5 p-5 md:p-7">
          {intro}

          {children}

          <div>
            <ButtonA variant="whatsapp" size="lg" block href={whatsapp.link} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" className="h-6 w-6" />
              إرسال {noun} عبر واتساب
            </ButtonA>
            <p className="mt-2 text-center text-sm text-muted">
              {whatsapp.sent
                ? 'وصلت التفاصيل لفريقنا تلقائيًا على واتساب. الزر اختياري إن أردت متابعة المحادثة بنفسك.'
                : 'فتحنا لك واتساب بالتفاصيل جاهزة — اضغط إرسال هناك. إن لم يُفتح، اضغط الزر أعلاه.'}
            </p>
          </div>

          <details className="group rounded-xl border border-line">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium">
              نص الرسالة المرسلة
              <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <pre className="whitespace-pre-wrap break-words border-t border-line bg-subtle px-4 py-3 font-sans text-sm leading-relaxed text-ink">
              {message}
            </pre>
          </details>

          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink to="/account" variant="outline" size="lg" block>
              <Icon name="user" /> متابعة من صفحتي
            </ButtonLink>
            <ButtonLink to="/" variant="ghost" size="lg" block>
              العودة للرئيسية
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

/** حقل نعم / لا بخيارين كبيرين */
export const YES_NO: { value: boolean; label: string }[] = [
  { value: true, label: 'نعم' },
  { value: false, label: 'لا' },
];
