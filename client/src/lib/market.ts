/** السوق الصناعي: أنواع وتسميات مشتركة بين صفحات الزوار والعميل والمورد والإدارة */

export type Availability = 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
export type MarketFile = { url: string; name: string; kind: string };
export type VendorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type RfqStatus = 'NEW' | 'DISTRIBUTED' | 'QUOTED' | 'NEGOTIATING' | 'AWARDED' | 'CLOSED' | 'CANCELLED';
export type QuoteStatus = 'SUBMITTED' | 'WITHDRAWN' | 'ACCEPTED' | 'REJECTED';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  IN_STOCK: 'متوفر',
  ON_ORDER: 'حسب الطلب',
  OUT_OF_STOCK: 'غير متوفر',
};

export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = {
  PENDING: 'بانتظار المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  SUSPENDED: 'معلّق',
};

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  NEW: 'جديد',
  DISTRIBUTED: 'أُرسل للموردين',
  QUOTED: 'وصلت عروض',
  NEGOTIATING: 'قيد التفاوض',
  AWARDED: 'تم اختيار عرض',
  CLOSED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  SUBMITTED: 'مقدَّم',
  WITHDRAWN: 'مسحوب',
  ACCEPTED: 'مقبول',
  REJECTED: 'لم يُختر',
};

export type Tone = 'neutral' | 'brand' | 'success' | 'danger' | 'dark' | 'sand';

export function rfqTone(s: RfqStatus): Tone {
  if (s === 'AWARDED' || s === 'CLOSED') return 'success';
  if (s === 'CANCELLED') return 'danger';
  if (s === 'QUOTED' || s === 'NEGOTIATING') return 'brand';
  return 'neutral';
}

export function vendorStatusTone(s: VendorStatus): Tone {
  return s === 'APPROVED' ? 'success' : s === 'PENDING' ? 'brand' : 'danger';
}

export const INVOICE_PURPOSE_LABEL: Record<string, string> = {
  SUBSCRIPTION: 'اشتراك',
  AD: 'إعلان',
  LEAD_FEE: 'رسوم Lead',
  COMMISSION: 'عمولة',
  ORDER: 'طلب',
  PROCUREMENT: 'إدارة مشتريات',
  OTHER: 'أخرى',
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'بانتظار الدفع',
  PAID: 'مدفوعة',
  FAILED: 'فشل الدفع',
  CANCELLED: 'ملغاة',
  REFUNDED: 'مستردة',
};

export const AD_TYPE_LABEL: Record<string, string> = {
  FEATURED_PRODUCT: 'منتج مميز',
  FEATURED_SUPPLIER: 'مورد مميز',
  INDUSTRIAL_DEAL: 'عرض صناعي',
  PRODUCT_OF_WEEK: 'منتج الأسبوع',
  SUPPLIER_OF_MONTH: 'مورد الشهر',
};

export const AD_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'طلب جديد',
  PENDING_PAYMENT: 'بانتظار الدفع',
  ACTIVE: 'فعّال',
  PAUSED: 'متوقف',
  ENDED: 'منتهي',
  REJECTED: 'مرفوض',
};

export const PLACEMENT_LABEL: Record<string, string> = {
  MARKET_HOME: 'الصفحة الرئيسية للسوق',
  SEARCH_TOP: 'أعلى نتائج البحث',
};

export const FEATURE_LABEL: Record<string, string> = {
  analytics: 'إحصائيات المشاهدات والمنتجات',
  advancedReports: 'تقارير متقدمة',
  catalog: 'رفع الكتالوج وعرضه',
  specialOffers: 'نشر عروض خاصة',
  featuredBadge: 'ظهور مميز',
  campaigns: 'حملات إعلانية',
};

export const REVENUE_MODE_LABEL: Record<string, string> = {
  LEAD: 'Leads فقط (بدون عمولة)',
  COMMISSION: 'عمولة على الصفقات',
  ONLINE_PAYMENT: 'دفع إلكتروني + عمولة',
};

export const DEAL_TYPE_LABEL: Record<string, string> = {
  PRODUCT_SALE: 'بيع منتج',
  RFQ_DEAL: 'صفقة عرض سعر',
  PROCUREMENT: 'مشتريات',
};

export const COMMISSION_GROUPS: { value: string; label: string }[] = [
  { value: 'spare_parts', label: 'قطع الغيار والمنتجات الصغيرة' },
  { value: 'machines', label: 'الماكينات وخطوط الإنتاج' },
  { value: 'equipment', label: 'المعدات الصناعية' },
  { value: 'fabrication', label: 'التصنيع والستانلس والحديد' },
  { value: 'services', label: 'الخدمات' },
];

export const groupLabel = (v: string | null | undefined) => COMMISSION_GROUPS.find((g) => g.value === v)?.label ?? v ?? '—';

/** مدة التوريد للعرض */
export function leadTimeText(days: number | null | undefined) {
  if (days == null) return null;
  if (days === 0) return 'فوري';
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}

/** سجل أحداث طلب عرض السعر بصياغة محايدة (للإدارة) */
export const RFQ_EVENT_LABEL: Record<string, string> = {
  created: 'أُنشئ الطلب',
  distributed: 'وُزّع على الموردين',
  viewed: 'اطّلع مورد على الطلب',
  quoted: 'قُدّم عرض سعر',
  quote_updated: 'حُدّث عرض سعر',
  quote_withdrawn: 'سُحب عرض سعر',
  declined: 'اعتذر مورد',
  negotiating: 'بدأ التفاوض',
  accepted: 'قُبل عرض',
  closed: 'اكتمل الطلب',
  cancelled: 'أُلغي الطلب',
  reviewed: 'قُيّم المورد',
  admin_updated: 'تحديث من الإدارة',
  delivery_order: 'أُنشئ طلب توصيل',
};
