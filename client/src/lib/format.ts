import { isEn } from './i18n/lang';
import type { BookingType, CorporateType, RequestStatus } from './types';

const TZ = 'Asia/Amman';
/** لغة التواريخ والأوقات حسب لغة الواجهة */
const LOCALE = isEn() ? 'en-GB' : 'ar-JO-u-nu-latn';

/** 90 د.أ — 12.5 د.أ (JOD 90 بالإنجليزية) */
export function formatJOD(v: number | string | null | undefined): string {
  const n = Math.round(Number(v ?? 0) * 1000) / 1000;
  const s = Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return isEn() ? `JOD ${s}` : `${s} د.أ`;
}

export function formatDate(iso: string | Date, withTime = false): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    weekday: withTime ? 'long' : undefined,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(d);
}

export function formatDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(isEn() ? 'en-US' : LOCALE, { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
}

/** "14:00" → "2:00 م" */
export function formatSlot(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = isEn() ? (h < 12 ? 'AM' : 'PM') : h < 12 ? 'ص' : 'م';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** 962791234567 → 0791234567 */
export function displayPhone(p: string): string {
  if (/^9627\d{8}$/.test(p)) return '0' + p.slice(3);
  return p.startsWith('+') ? p : '+' + p;
}

/** اليوم بتوقيت عمّان YYYY-MM-DD */
export function todayAmman(): string {
  return formatDateShort(new Date());
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  NEW: 'جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  CONFIRMED: 'مؤكد',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const STATUS_ORDER: RequestStatus[] = ['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  INSPECTION: 'كشف أعطال بناء',
  PAINTING: 'أعمال دهان',
  CONSTRUCTION: 'أعمال بناء',
  METALWORK: 'أعمال معدنية',
  GENERAL: 'خدمات عامة',
};

/** مسار URL لكل نوع حجز */
export const BOOKING_TYPE_SLUG: Record<BookingType, string> = {
  INSPECTION: 'inspection',
  PAINTING: 'painting',
  CONSTRUCTION: 'construction',
  METALWORK: 'metalwork',
  GENERAL: 'general',
};

export const CORPORATE_TYPE_LABEL: Record<CorporateType, string> = {
  ANNUAL: 'عقد صيانة سنوي',
  URGENT: 'طلب صيانة عاجل',
};

export const DETAIL_LABELS: Record<string, string> = {
  faultType: 'نوع العطل',
  description: 'الوصف',
  paintType: 'نوعية الدهان',
  jobKind: 'نوع العمل',
  rooms: 'عدد الغرف',
  area: 'المساحة (م²)',
  colors: 'الألوان',
  decorations: 'ديكورات',
  tiles: 'تشطيب داخلي وخارجي',
  buildingType: 'نوع البناء',
  landArea: 'مساحة الأرض (م²)',
  buildArea: 'مساحة البناء المطلوبة (م²)',
  floors: 'عدد الطوابق',
  hasDesign: 'يوجد تصميم قائم',
  workType: 'نوع العمل',
  dimensions: 'المساحات والقياسات',
  quantity: 'العدد المطلوب',
};

const DETAIL_VALUE_LABELS: Record<string, Record<string, string>> = {
  buildingType: { HOUSE: 'منزل مستقل', APARTMENT: 'شقة', VILLA: 'فيلا', COMMERCIAL: 'تجاري' },
  jobKind: { NEW: 'دهان جديد', RENEW: 'تجديد' },
};

export function formatDetail(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  const map = DETAIL_VALUE_LABELS[key];
  if (map && typeof value === 'string') return map[value] ?? value;
  return String(value ?? '—');
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدًا',
  BANK_TRANSFER: 'تحويل بنكي',
  CLIQ: 'كليك',
  CARD: 'بطاقة',
  OTHER: 'أخرى',
};

export const FILE_KIND_LABEL: Record<string, string> = {
  EVALUATION: 'تقييم',
  QUOTE: 'عرض سعر',
  CONTRACT: 'عقد',
  INVOICE: 'فاتورة',
  OTHER: 'ملف',
};

export function waLink(number: string, text?: string) {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** تحقق فوري من رقم الهاتف الأردني (نفس منطق السيرفر) */
/** رقم جوال أردني فقط (07XXXXXXXX) — للتسجيل */
export function isJordanMobile(raw: string): boolean {
  let s = raw.replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('07')) s = '962' + s.slice(1);
  return /^9627[789]\d{7}$/.test(s);
}

export function isValidPhone(raw: string): boolean {
  let s = raw.replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('07') && s.length === 10) s = '962' + s.slice(1);
  if (!/^\d{8,15}$/.test(s)) return false;
  if (s.startsWith('962')) return /^9627[789]\d{7}$/.test(s) || /^9626\d{7}$/.test(s);
  return true;
}

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
