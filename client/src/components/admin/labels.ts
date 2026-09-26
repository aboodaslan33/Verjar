import type { ContractStatus, FileKind, PaymentMethod, ProductionImpact, UrgencyLevel } from './types';

export const URGENCY_LABEL = { NORMAL: 'عادي', URGENT: 'عاجل', EMERGENCY: 'طارئ' } as const;
export const ZONE_LABEL = { INSIDE_AMMAN: 'داخل عمّان', OUTSIDE_AMMAN: 'خارج عمّان' } as const;

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  ACTIVE: 'ساري',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
};

export const PRODUCTION_IMPACT_LABEL: Record<ProductionImpact, string> = {
  NO_STOP_NEEDED: 'يمكن العمل دون إيقاف الإنتاج',
  CANNOT_STOP: 'لا يمكن إيقاف الإنتاج',
  PARTIAL_STOP: 'يمكن الإيقاف جزئيًا',
};

export const URGENCY_LEVEL_LABEL: Record<UrgencyLevel, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  CRITICAL: 'حرجة',
};

export const FILE_KINDS: FileKind[] = ['EVALUATION', 'QUOTE', 'CONTRACT', 'INVOICE', 'OTHER'];
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CLIQ', 'CARD', 'OTHER'];

export const WA_STATUS_LABEL = { PREPARED: 'رابط جاهز', SENT: 'أُرسلت', FAILED: 'فشل' } as const;
export const WA_CHANNEL_LABEL = { LINK: 'رابط wa.me', CLOUD_API: 'Cloud API' } as const;

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  login: 'تسجيل دخول',
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  upload: 'رفع ملف',
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  user: 'مستخدم',
  booking: 'حجز',
  order: 'طلب متجر',
  product: 'منتج',
  category: 'تصنيف',
  corporate: 'طلب شركة',
  contract: 'عقد',
  quoteFile: 'ملف',
  payment: 'دفعة',
  customer: 'عميل',
  settings: 'الإعدادات',
  technician: 'فني',
};

export const ACTOR_TYPE_LABEL: Record<string, string> = {
  admin: 'الإدارة',
  customer: 'عميل',
  system: 'النظام',
  public: 'زائر',
};

/** لون موحد لكل حالة (نقطة/شريط) — للتقويم والقوائم المضغوطة */
export const STATUS_DOT: Record<string, string> = {
  NEW: 'bg-sand-400',
  UNDER_REVIEW: 'bg-amber-500',
  PRICED: 'bg-sky-500',
  CONFIRMED: 'bg-brand-400',
  IN_PROGRESS: 'bg-brand-500',
  COMPLETED: 'bg-brand-800 dark:bg-brand-200',
  CANCELLED: 'bg-line',
};

/** "2026-09-29" من ISO بتوقيت عمّان مناسب لـ <input type=date> */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

/** عدد الأيام المتبقية حتى تاريخ */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);
}

/** قيمة رقمية من مدخل نصي، أو null إن كان فارغًا */
export function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
