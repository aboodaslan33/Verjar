import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { BRAND } from '../../lib/brand';
import { displayPhone } from '../../lib/format';
import { Icon, type IconName } from '../ui';
import { Logo } from './Logo';
import { useI18n, type MessageKey } from '../../lib/i18n';

const SERVICES: { to: string; key: MessageKey }[] = [
  { to: '/bookings/inspection', key: 'svc.inspection' },
  { to: '/bookings/painting', key: 'svc.painting' },
  { to: '/bookings/construction', key: 'svc.construction' },
  { to: '/bookings/metalwork', key: 'svc.metalwork' },
  { to: '/corporate', key: 'svc.corporate' },
];

const COMPANY: { to: string; key: MessageKey }[] = [
  { to: '/work', key: 'nav.work' },
  { to: '/store', key: 'nav.store' },
  { to: '/about', key: 'nav.about' },
  { to: '/contact', key: 'footer.contact' },
  { to: '/track', key: 'footer.track' },
  { to: '/account', key: 'nav.account' },
];

/** الفوتر: فحمي كخلفية الشعار، مع شريط دعوة للحجز وخط القياس الكهرماني */
export function SiteFooter() {
  const { settings } = useSite();
  const { t, lang } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-inverse text-inverse-fg">
      {/* دعوة للحجز */}
      <div className="border-b border-inverse-fg/10">
        <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between md:py-12">
          <div>
            <p className="font-display text-2xl font-semibold text-inverse-fg md:text-[1.75rem]">{t('footer.ctaTitle')}</p>
            <p className="mt-2 max-w-lg text-inverse-fg/65">{t('footer.ctaText')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/bookings/inspection"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-semibold text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] transition-colors hover:bg-primary-hover active:translate-y-px"
            >
              {t('footer.ctaButton')} <Icon name="arrowLeft" className="h-4 w-4" />
            </Link>
            <a
              href={`https://wa.me/${settings.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-inverse-fg/20 px-5 font-semibold transition-colors hover:border-inverse-fg/50"
            >
              <Icon name="whatsapp" className="h-5 w-5" /> {t('nav.whatsapp')}
            </a>
          </div>
        </div>
      </div>

      <div className="container grid gap-10 py-12 sm:grid-cols-2 md:py-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo light />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-inverse-fg/60">
            {t('footer.about')}
          </p>
        </div>

        <FooterList title={t('footer.services')} items={SERVICES.map((i) => ({ to: i.to, label: t(i.key) }))} className="lg:col-span-2" />
        <FooterList title={t('footer.company')} items={COMPANY.map((i) => ({ to: i.to, label: t(i.key) }))} className="lg:col-span-2" />

        <div className="lg:col-span-4">
          <h2 className="mb-4 text-xs font-semibold tracking-wide text-inverse-fg/50">{t('footer.contact')}</h2>
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
            © <span className="num">{year}</span> {lang === 'ar' ? `${BRAND.ar} (${BRAND.en})` : BRAND.en}. {t('footer.rights')}
          </span>
          <span>{t('footer.city')}</span>
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
