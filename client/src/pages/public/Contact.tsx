import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonA, Icon, Input, PageHeader, Textarea, type IconName } from '../../components/ui';
import { useSite } from '../../context/SiteContext';
import { displayPhone, waLink } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

const BOOKING_LINKS = [
  { to: '/bookings/inspection', label: 'كشف أعطال بناء' },
  { to: '/bookings/painting', label: 'أعمال دهان' },
  { to: '/bookings/construction', label: 'أعمال بناء' },
  { to: '/bookings/metalwork', label: 'أعمال معدنية' },
  { to: '/bookings/general', label: 'خدمات عامة' },
  { to: '/corporate', label: 'عقود صيانة الشركات' },
];

export default function Contact() {
  useDocumentTitle('تواصل معنا');
  const { settings } = useSite();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({});

  const check = (n: string, m: string) => ({
    name: n.trim().length < 2 ? 'اكتب اسمك' : undefined,
    message: m.trim().length < 5 ? 'اكتب رسالتك (5 أحرف على الأقل)' : undefined,
  });

  const send = (e: FormEvent) => {
    e.preventDefault();
    const errs = check(name, message);
    setErrors(errs);
    if (errs.name || errs.message) return;
    const text = `مرحبًا، أنا ${name.trim()}.\n${message.trim()}`;
    window.open(waLink(settings.whatsappNumber, text), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <PageHeader
        eyebrow="تواصل"
        title="تواصل معنا"
        description="أسرع طريقة هي واتساب: أرسل وصفًا وصورًا للمشكلة ونرد عليك خلال ساعات العمل."
      />

      <div className="container grid gap-8 py-10 md:py-14 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-5" aria-label="طرق التواصل">
          <ButtonA
            href={waLink(settings.whatsappNumber)}
            target="_blank"
            rel="noopener noreferrer"
            variant="whatsapp"
            size="lg"
            block
          >
            <Icon name="whatsapp" /> واتساب <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
          </ButtonA>

          <ul className="card divide-y divide-line">
            <Method icon="phone" label="اتصال هاتفي">
              <a href={`tel:${settings.phone}`} className="ltr inline-block min-h-[44px] py-2 hover:text-brand-600 dark:hover:text-brand-200">
                {settings.phone}
              </a>
            </Method>
            <Method icon="mail" label="البريد الإلكتروني">
              <a href={`mailto:${settings.email}`} className="ltr inline-block min-h-[44px] break-all py-2 hover:text-brand-600 dark:hover:text-brand-200">
                {settings.email}
              </a>
            </Method>
            <Method icon="pin" label="العنوان">
              <span className="block py-1">{settings.address}</span>
            </Method>
            <Method icon="clock" label="ساعات العمل">
              <span className="block py-1">{settings.workingHoursText}</span>
            </Method>
          </ul>

          <div className="card p-5">
            <h2 className="text-base">احجز مباشرة</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {BOOKING_LINKS.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="flex min-h-[44px] items-center justify-between gap-1 rounded-xl border border-line px-3 text-sm font-medium hover:border-brand-300 hover:bg-subtle"
                  >
                    {l.label}
                    <Icon name="chevronLeft" className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-6 lg:col-span-7" aria-labelledby="quick-msg">
          <form onSubmit={send} noValidate className="card space-y-5 p-5 sm:p-6">
            <div>
              <h2 id="quick-msg" className="text-xl">
                رسالة سريعة
              </h2>
              <p className="mt-1 text-sm text-muted">تُفتح رسالتك في واتساب جاهزة للإرسال. لا نحفظ أي بيانات هنا.</p>
            </div>
            <Input
              label="الاسم"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((s) => ({ ...s, name: check(e.target.value, message).name }));
              }}
              onBlur={() => setErrors((s) => ({ ...s, name: check(name, message).name }))}
              error={errors.name}
              maxLength={100}
            />
            <Textarea
              label="الرسالة"
              rows={5}
              placeholder="مثال: عندي رطوبة في سقف الحمام في شقة بخلدا، وبدي كشف هذا الأسبوع."
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (errors.message) setErrors((s) => ({ ...s, message: check(name, e.target.value).message }));
              }}
              onBlur={() => setErrors((s) => ({ ...s, message: check(name, message).message }))}
              error={errors.message}
              maxLength={1500}
            />
            <Button type="submit" variant="whatsapp" size="lg" block>
              <Icon name="whatsapp" /> إرسال عبر واتساب
            </Button>
          </form>

          {settings.mapUrl.trim() && (
            <div className="card overflow-hidden">
              <iframe
                src={settings.mapUrl}
                title="موقعنا على الخريطة"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block aspect-[4/3] w-full border-0 sm:aspect-[16/9]"
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Method({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <Icon name={icon} className="mt-2.5 h-5 w-5 shrink-0 text-sand-600 dark:text-sand-300" />
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <div className="font-medium">{children}</div>
      </div>
    </li>
  );
}
