/** نظام التوصيل: الحالات وتسمياتها وألوانها — مشتركة بين لوحة الإدارة والموظف والمورد والعميل */

export type DeliveryStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'PICKUP_ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'PAYMENT_COLLECTED'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'CUSTOMER_NOT_AVAILABLE'
  | 'CUSTOMER_REFUSED'
  | 'WRONG_ADDRESS'
  | 'RESCHEDULED'
  | 'CANCELLED';

export type FinancialStatus = 'PAID' | 'COD' | 'PARTIAL_PAYMENT' | 'PAYMENT_PENDING' | 'COLLECTED' | 'NOT_COLLECTED';

export const FLOW: DeliveryStatus[] = ['NEW', 'ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'];
export const FAILURES: DeliveryStatus[] = ['DELIVERY_FAILED', 'CUSTOMER_NOT_AVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS'];
export const ALL_STATUSES: DeliveryStatus[] = [...FLOW, ...FAILURES, 'RESCHEDULED', 'CANCELLED'];
export const DELIVERED_SET: DeliveryStatus[] = ['DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED'];

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  NEW: 'جديد',
  ACCEPTED: 'قيد التجهيز',
  PICKUP_ASSIGNED: 'مُسند للاستلام',
  PICKED_UP: 'تم الاستلام من المورد',
  IN_TRANSIT: 'في الطريق',
  ARRIVED: 'وصل للعميل',
  DELIVERED: 'تم التسليم',
  PAYMENT_COLLECTED: 'تم تحصيل المبلغ',
  COMPLETED: 'مكتمل',
  DELIVERY_FAILED: 'تعذر التسليم',
  CUSTOMER_NOT_AVAILABLE: 'العميل غير متاح',
  CUSTOMER_REFUSED: 'رفض العميل الاستلام',
  WRONG_ADDRESS: 'عنوان خاطئ',
  RESCHEDULED: 'أُعيدت جدولته',
  CANCELLED: 'ملغي',
};

export type Tone = 'neutral' | 'brand' | 'success' | 'danger' | 'dark' | 'sand';

export function statusTone(s: DeliveryStatus): Tone {
  if (s === 'COMPLETED' || s === 'PAYMENT_COLLECTED') return 'success';
  if (s === 'DELIVERED') return 'success';
  if (FAILURES.includes(s) || s === 'CANCELLED') return 'danger';
  if (s === 'RESCHEDULED') return 'sand';
  if (s === 'IN_TRANSIT' || s === 'ARRIVED') return 'dark';
  if (s === 'NEW') return 'neutral';
  return 'brand';
}

export const FINANCIAL_LABEL: Record<FinancialStatus, string> = {
  PAID: 'مدفوع',
  COD: 'الدفع عند الاستلام',
  PARTIAL_PAYMENT: 'دفع جزئي',
  PAYMENT_PENDING: 'بانتظار الدفع',
  COLLECTED: 'تم التحصيل',
  NOT_COLLECTED: 'لم يُحصَّل',
};

export function financialTone(s: FinancialStatus | null | undefined): Tone {
  if (s === 'PAID' || s === 'COLLECTED') return 'success';
  if (s === 'NOT_COLLECTED') return 'danger';
  if (s === 'PARTIAL_PAYMENT') return 'sand';
  return 'neutral';
}

export const PAY_LABEL: Record<string, string> = {
  COD: 'الدفع عند الاستلام',
  CASH: 'نقدًا',
  CLIQ: 'CliQ',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  OTHER: 'أخرى',
};

export const SOURCE_LABEL: Record<string, string> = { STORE: 'المتجر', SUPPLIER: 'المورد', ADMIN: 'الإدارة' };

/** مجموعات لوحة الإحصائيات */
export const BUCKETS = [
  { key: 'new', label: 'الطلبات الجديدة' },
  { key: 'preparing', label: 'قيد التجهيز' },
  { key: 'pickedUp', label: 'المستلمة من المورد' },
  { key: 'inTransit', label: 'قيد التوصيل' },
  { key: 'delivered', label: 'المسلّمة' },
  { key: 'failed', label: 'المتعثرة' },
  { key: 'cancelled', label: 'الملغاة' },
] as const;

/** رابط التنقل في خرائط Google: بالإحداثيات إن وُجدت، وإلا بالعنوان */
export function navigateUrl(p: { lat?: number | null; lng?: number | null; address?: string | null }) {
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  if (p.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`;
  return null;
}

/** الموقع الحالي من المتصفح (إن سمح المستخدم) — لا يمنع الإجراء إن رُفض */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
