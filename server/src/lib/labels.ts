import type { BookingType, CorporateRequestType, ProductionImpact, RequestStatus, UrgencyLevel } from '@prisma/client';

export const STATUS_AR: Record<RequestStatus, string> = {
  NEW: 'جديد',
  UNDER_REVIEW: 'قيد المراجعة',
  PRICED: 'تم التسعير',
  CONFIRMED: 'مؤكد',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const BOOKING_TYPE_AR: Record<BookingType, string> = {
  INSPECTION: 'كشف أعطال بناء',
  PAINTING: 'أعمال دهان',
  CONSTRUCTION: 'أعمال بناء',
  METALWORK: 'أعمال معدنية',
  GENERAL: 'خدمات عامة',
};

export const CORPORATE_TYPE_AR: Record<CorporateRequestType, string> = {
  ANNUAL: 'عقد صيانة سنوي',
  URGENT: 'طلب صيانة عاجل',
};

export const PRODUCTION_IMPACT_AR: Record<ProductionImpact, string> = {
  NO_STOP_NEEDED: 'يمكن العمل دون إيقاف الإنتاج',
  CANNOT_STOP: 'لا يمكن إيقاف الإنتاج',
  PARTIAL_STOP: 'يمكن الإيقاف جزئيًا',
};

export const URGENCY_LEVEL_AR: Record<UrgencyLevel, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة — توقف كامل',
};

export const BUILDING_TYPE_AR: Record<string, string> = {
  HOUSE: 'منزل مستقل',
  APARTMENT: 'شقة',
  VILLA: 'فيلا',
  COMMERCIAL: 'تجاري',
};

export const PAINT_JOB_AR: Record<string, string> = { NEW: 'دهان جديد', RENEW: 'تجديد' };

/** أسماء حقول details بالعربية لعرضها في الرسائل ولوحة الأدمن */
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

export function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'buildingType' && typeof value === 'string') return BUILDING_TYPE_AR[value] ?? value;
  if (key === 'jobKind' && typeof value === 'string') return PAINT_JOB_AR[value] ?? value;
  return String(value ?? '');
}
