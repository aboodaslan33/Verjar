import { Link } from 'react-router-dom';
import { ButtonLink, Icon } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useAsync';

const LINKS = [
  { to: '/bookings/inspection', label: 'احجز كشفًا' },
  { to: '/store', label: 'المتجر' },
  { to: '/corporate', label: 'خدمات الشركات' },
  { to: '/account', label: 'حسابي' },
  { to: '/contact', label: 'تواصل معنا' },
];

export default function NotFound() {
  useDocumentTitle('الصفحة غير موجودة');
  return (
    <section className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="ltr text-6xl font-bold text-sand-600 dark:text-sand-300 md:text-7xl">404</p>
      <span className="mt-4 block h-px w-16 bg-sand-300 dark:bg-sand-600" aria-hidden />
      <h1 className="mt-6 text-2xl md:text-3xl">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-md text-muted">ربما تغيّر الرابط أو حُذفت الصفحة. هذه أكثر الصفحات استخدامًا:</p>
      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface px-4 text-[15px] hover:border-brand-300 hover:bg-subtle"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <ButtonLink to="/" size="lg" className="mt-8">
        <Icon name="chevronRight" className="h-4 w-4" /> الصفحة الرئيسية
      </ButtonLink>
    </section>
  );
}
