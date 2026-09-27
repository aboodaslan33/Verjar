import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { WhatsAppResult } from '../../lib/types';
import { Button, ButtonA, ButtonLink, Icon } from '../ui';

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
    <div className="sticky bottom-0 z-40 -mx-4 mt-8 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-2">
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
      <h2 ref={ref} tabIndex={-1} className="text-xl outline-none md:text-2xl">
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
    <section className="rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h3 className="text-base">{title}</h3>
        {onEdit && (
          <button type="button" onClick={onEdit} className="min-h-[44px] rounded-lg px-2 text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
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
    <div className="container max-w-2xl py-10 md:py-14">
      <div className="card animate-fade-up overflow-hidden">
        <div className="border-b border-line bg-subtle px-6 py-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg ring-4 ring-brand-100 dark:ring-brand-500/20">
            <Icon name="check" className="h-7 w-7" />
          </span>
          <h1 ref={ref} tabIndex={-1} className="text-2xl text-ink outline-none md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-lg text-muted">
            رقم {noun} <span className="ltr font-bold">#{number}</span>
          </p>
        </div>

        <div className="space-y-5 p-5 md:p-7">
          {intro}

          <div className="rounded-xl bg-sand-50 p-4 dark:bg-sand-700/15">
            <p className="text-sm text-muted">رقم المرجع</p>
            <p className="ltr mt-0.5 text-2xl font-bold tracking-wider text-ink">{refCode}</p>
            <p className="mt-2 text-sm text-muted">
              تجده مع الحالة وعروض الأسعار والدفعات في{' '}
              <Link to="/account" className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-200">
                حسابك
              </Link>
              .
            </p>
          </div>

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
