import { Link } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { displayPhone } from '../../lib/format';
import { Icon } from '../ui';
import { Logo } from './Logo';

export function SiteFooter() {
  const { settings } = useSite();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-brand-900 text-sand-100">
      <div className="container grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-sand-100/75">
            بناء، صيانة، دهان، وأعمال معدنية للبيوت والشركات. نكشف على الموقع ونعطيك سعرًا مكتوبًا قبل البدء.
          </p>
        </div>

        <div className="md:col-span-3">
          <h2 className="mb-3 text-sm font-semibold text-white">الخدمات</h2>
          <ul className="space-y-2 text-sm text-sand-100/80">
            <li><Link className="hover:text-white" to="/bookings/inspection">كشف أعطال البناء</Link></li>
            <li><Link className="hover:text-white" to="/bookings/painting">أعمال الدهان</Link></li>
            <li><Link className="hover:text-white" to="/bookings/construction">أعمال البناء</Link></li>
            <li><Link className="hover:text-white" to="/bookings/metalwork">الأعمال المعدنية</Link></li>
            <li><Link className="hover:text-white" to="/corporate">عقود صيانة الشركات</Link></li>
          </ul>
        </div>

        <div className="md:col-span-5">
          <h2 className="mb-3 text-sm font-semibold text-white">تواصل معنا</h2>
          <ul className="space-y-3 text-sm">
            <li>
              <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 hover:text-white">
                <Icon name="whatsapp" className="h-4 w-4 text-sand-300" />
                واتساب: <span className="ltr">{displayPhone(settings.whatsappNumber)}</span>
              </a>
            </li>
            <li>
              <a href={`tel:${settings.phone}`} className="flex items-center gap-2.5 hover:text-white">
                <Icon name="phone" className="h-4 w-4 text-sand-300" />
                هاتف: <span className="ltr">{settings.phone}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.email}`} className="flex items-center gap-2.5 hover:text-white">
                <Icon name="mail" className="h-4 w-4 text-sand-300" />
                <span className="ltr">{settings.email}</span>
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="pin" className="h-4 w-4 text-sand-300" />
              {settings.address}
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="clock" className="h-4 w-4 text-sand-300" />
              {settings.workingHoursText}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-5 text-xs text-sand-100/60 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} فيرجار. جميع الحقوق محفوظة.</span>
          <span className="flex gap-4">
            <Link to="/account" className="hover:text-white">حسابي</Link>
            <Link to="/contact" className="hover:text-white">تواصل</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
