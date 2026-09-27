import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { SiteSettings } from '../lib/types';

/** قيم احتياطية تُعرض قبل وصول الإعدادات من السيرفر */
export const FALLBACK_SETTINGS: SiteSettings = {
  whatsappNumber: '962780192930',
  phone: '0780192930',
  email: 'farjarweb@gmail.com',
  address: 'عمّان — الأردن',
  inspectionFeeNormal: 25,
  inspectionFeeUrgent: 50,
  inspectionFeeEmergency: 70,
  paintingFeeInside: 15,
  paintingFeeOutside: 25,
  emergencyNote: '',
  workingDays: [0, 1, 2, 3, 4, 6],
  workStart: '08:00',
  workEnd: '18:00',
  bookingGapHours: 3,
  maxDaysAhead: 60,
  aboutTitle: 'مجموعة فرجا للتصميم والمقاولات والصيانة',
  aboutContent: '',
  heroTitle: 'صيانة وبناء ودهان في عمّان وكل المحافظات',
  heroSubtitle: 'احجز كشفًا على موقعك، واستلم سعرًا واضحًا قبل البدء.',
  mapUrl: '',
  workingHoursText: 'السبت – الخميس، 8 صباحًا – 6 مساءً',
  instagram: '',
  facebook: '',
  whatsappMode: 'LINK',
};

type Ctx = { settings: SiteSettings; loaded: boolean; refresh: () => void };
const SiteContext = createContext<Ctx>({ settings: FALLBACK_SETTINGS, loaded: false, refresh: () => {} });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const load = () =>
    api
      .get<SiteSettings>('/site/settings')
      .then((s) => {
        setSettings(s);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  useEffect(() => {
    load();
  }, []);
  return <SiteContext.Provider value={{ settings, loaded, refresh: load }}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
