import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { BRAND } from '../../lib/brand';
import { displayPhone } from '../../lib/format';
import { Icon, type IconName } from '../ui';
import { Logo } from './Logo';

const SERVICES = [
  { to: '/bookings/inspection', label: 'كشف أعطال البناء' },
  { to: '/bookings/painting', label: 'أعمال الدهان' },
  { to: '/bookings/construction', label: 'أعمال البناء' },
  { to: '/bookings/metalwork', label: 'الأعمال المعدنية' },
  { to: '/corporate', label: 'عقود صيانة الشركات' },
];

const COMPANY = [
  { to: '/work', label: 'أعمالنا' },
  { to: '/store', label: 'السوق' },
  { to: '/about', label: 'من نحن' },
  { to: '/contact', label: 'تواصل معنا' },
  { to: '/account', label: 'حسابي' },
];

/** الفوتر: فحمي كخلفية الشعار، مع شريط دعوة للحجز وخط القياس الكهرماني */
export function SiteFooter() {
  const { settings } = useSite();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-inverse text-inverse-fg">
      {/* دعوة للحجز */}
      <div className="border-b border-inverse-fg/10">
        <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between md:py-12">
          <div>
            <p className="font-display text-2xl font-semibold text-inverse-fg md:text-[1.75rem]">ابدأ بكشف على موقعك</p>
            <p className="mt-2 max-w-lg text-inverse-fg/65">نزورك في الموعد الذي تختاره، ونعطيك سعرًا مكتوبًا قبل أي التزام.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/bookings/inspection"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover active:translate-y-px"
            >
              احجز كشفًا <Icon name="arrowLeft" className="h-4 w-4" />
            </Link>
            <a
              href={`https://wa.me/${settings.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-inverse-fg/20 px-5 font-semibold transition-colors hover:border-inverse-fg/50"
            >
              <Icon name="whatsapp" className="h-5 w-5" /> واتساب
            </a>
          </div>
        </div>
      </div>

      <div className="container grid gap-10 py-12 sm:grid-cols-2 md:py-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo light />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-inverse-fg/60">
            تصميم وديكور، مطابخ، بناء، صيانة، دهان، وأعمال معدنية للبيوت والشركات في عمّان وكل المحافظات.
          </p>
        </div>

        <FooterList title="الخدمات" items={SERVICES} className="lg:col-span-2" />
        <FooterList title="الشركة" items={COMPANY} className="lg:col-span-2" />

        <div className="lg:col-span-4">
          <h2 className="mb-4 text-xs font-semibold tracking-wide text-inverse-fg/50">تواصل معنا</h2>
          <ul className="space-y-3 text-sm text-inverse-fg/80">
            <ContactLine icon="phone" href={`tel:${settings.phone}`}>
              <span className="ltr">{settings.phone}</span>
            </ContactLine>
            <ContactLine icon="whatsapp" href={`https://wa.me/${settings.whatsappNumber}`} external>
              <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
            </ContactLine>
            <ContactLine icon="mail" href={`mailto:${settings.email}`}>
              <span className="ltr">{settings.email}</span>
            </ContactLine>
            <ContactLine icon="pin">{settings.address}</ContactLine>
            <ContactLine icon="clock">{settings.workingHoursText}</ContactLine>
          </ul>
        </div>
      </div>

      <div className="container">
        <div className="measure !bg-inverse-fg/10" aria-hidden />
        <div className="flex flex-col gap-2 py-6 text-xs text-inverse-fg/50 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © <span className="num">{year}</span> {BRAND.ar} ({BRAND.en}). جميع الحقوق محفوظة.
          </span>
          <span>عمّان — الأردن</span>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, items, className }: { title: string; items: { to: string; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      <h2 className="mb-4 text-xs font-semibold tracking-wide text-inverse-fg/50">{title}</h2>
      <ul className="space-y-2.5 text-sm">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="text-inverse-fg/80 transition-colors hover:text-primary">
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactLine({ icon, href, external, children }: { icon: IconName; href?: string; external?: boolean; children: ReactNode }) {
  const body = (
    <>
      <Icon name={icon} className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0">{children}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="flex items-center gap-3 transition-colors hover:text-inverse-fg"
        >
          {body}
        </a>
      ) : (
        <span className="flex items-center gap-3">{body}</span>
      )}
    </li>
  );
}
