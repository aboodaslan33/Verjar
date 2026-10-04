export type RequestStatus = 'NEW' | 'UNDER_REVIEW' | 'PRICED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BookingType = 'INSPECTION' | 'PAINTING' | 'CONSTRUCTION' | 'METALWORK' | 'GENERAL';
export type CorporateType = 'ANNUAL' | 'URGENT';
export type MediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };

export type SiteSettings = {
  whatsappNumber: string;
  /** أجرة التوصيل الافتراضية لطلبات الموردين */
  deliveryFeeDefault?: number;
  phone: string;
  email: string;
  address: string;
  inspectionFeeNormal: number;
  inspectionFeeUrgent: number;
  inspectionFeeEmergency: number;
  paintingFeeInside: number;
  paintingFeeOutside: number;
  emergencyNote: string;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  bookingGapHours: number;
  maxDaysAhead: number;
  bookingPolicy: string;
  storePolicy: string;
  aboutTitle: string;
  aboutContent: string;
  heroTitle: string;
  heroSubtitle: string;
  mapUrl: string;
  workingHoursText: string;
  instagram: string;
  facebook: string;
  whatsappMode: 'LINK' | 'CLOUD_API';
};

export type AdminSettings = Omit<SiteSettings, 'whatsappMode'> & {
  slotMinutes: number;
  contractReminderDays: number;
  tenderCommissionPercent: number;
  deliveryFeeDefault: number;
  deliveryOtpRequired: boolean;
  deliveryPhotoRequired: boolean;
  marketRevenueMode: 'LEAD' | 'COMMISSION' | 'ONLINE_PAYMENT';
  leadFeeStandard: number;
  leadFeeLarge: number;
  leadLargeThreshold: number;
  leadFeesEnabled: boolean;
  rfqAutoDistribute: boolean;
  rfqSuppliersPerRequest: number;
  supplierApprovalRequired: boolean;
  hideContactsUntilAward: boolean;
  subscriptionReminderDays: number;
  platformFeeDefault: number;
  platformFeeEditPolicy: 'ADMIN_ONLY' | 'SUPPLIER_REQUEST';
  paymentBankName: string;
  paymentAccountName: string;
  paymentCliq: string;
  paymentIban: string;
  paymentInstructions: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
  children?: { id: string; name: string; slug: string; productCount: number }[];
};

/** حقل مواصفات يحدده الأدمن لكل قسم */
export type SpecField = { key: string; label: string; type: 'text' | 'number' | 'select'; options: string[]; required: boolean };

export type VendorBrief = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isHouse: boolean;
  verified?: boolean;
  city?: string | null;
  plan?: { code: string; badge: string | null } | null;
  /** شارة التميز (مثل "مورد الشهر") حتى تاريخ — يمنحها الـ Super Admin */
  awardTitle?: string | null;
  awardUntil?: string | null;
};

export type VendorStore = VendorBrief & { description: string; createdAt: string; productCount: number };

export type Media = { id: string; kind: MediaKind; url: string };

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPercent: number;
  finalPrice: number;
  stock: number;
  featured: boolean;
  specs?: Record<string, string | number>;
  category: { id: string; name: string; slug: string; parent?: { id: string; name: string; slug: string } | null };
  vendor: VendorBrief;
  media: Media[];
  /** في صفحة المنتج فقط: المواصفات بأسمائها */
  specList?: { key: string; label: string; value: string }[];
  // ── بيانات صناعية ──
  sku?: string | null;
  partNumber?: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  originCountry?: string | null;
  priceOnRequest?: boolean;
  minOrderQty?: number;
  availability?: 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
  leadTimeDays?: number | null;
  warranty?: string | null;
  videoUrl?: string | null;
  documents?: { url: string; name: string; kind: string }[];
  /** خيارات يختارها العميل (اللون، المقاس…) — قيمة واحدة من كل خيار */
  options?: ProductOption[];
};

export type ProductOption = { name: string; values: { label: string; mediaId?: string | null; stock?: number | null }[] };
/** اختيار العميل: [{ name: "اللون", value: "أحمر" }] */
export type OptionSelection = { name: string; value: string }[];

export const variantText = (sel: OptionSelection | undefined) => (sel ?? []).map((s) => `${s.name}: ${s.value}`).join(' · ');

export type Slot = { time: string; available: boolean; reason?: 'past' | 'booked' };
export type DaySlots = {
  date: string;
  open: boolean;
  reason: 'closed' | 'out_of_range' | null;
  gapHours: number;
  slots: Slot[];
};

export type WhatsAppResult = { link: string; sent: boolean };

export type BookingCreated = {
  id: string;
  number: number;
  ref: string;
  type: BookingType;
  status: RequestStatus;
  scheduledAt: string;
  inspectionFee: number | null;
  mediaCount: number;
  message: string;
  whatsapp: WhatsAppResult;
};

export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  /** الخيار المختار: "اللون: أحمر" */
  variant?: string | null;
  unitPrice: number;
  discountPercent: number;
  unitFinalPrice: number;
  quantity: number;
  lineTotal: number;
};

export type OrderCreated = {
  id: string;
  number: number;
  ref: string;
  status: RequestStatus;
  subtotal: number;
  discountTotal: number;
  total: number;
  items: OrderItem[];
  vendorOrders: { id: string; number: number; total: number; status: RequestStatus; vendor: { name: string; slug: string } }[];
  message: string;
  whatsapp: WhatsAppResult;
};

export type CorporateService = { id: string; key: string; name: string; kind: CorporateType };

export type CorporateCreated = {
  id: string;
  number: number;
  ref: string;
  type: CorporateType;
  status: RequestStatus;
  services: string[];
  message: string;
  whatsapp: WhatsAppResult;
};

export type CustomerMe = {
  role: 'CUSTOMER';
  id: string;
  name: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  hasPassword: boolean;
  emailOptIn: boolean;
  /** متجر العميل إن كان لديه صلاحية مورد */
  vendor: { id: string; name: string; slug: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'; verified?: boolean; role?: 'OWNER' | 'STAFF' } | null;
};
export type StaffRole = 'ADMIN' | 'STAFF' | 'MANAGER' | 'DRIVER';
/** حساب إدارة أو توصيل مع صلاحياته الفعلية (RBAC) */
export type AdminMe = { id: string; name: string; email: string | null; username: string | null; phone: string | null; role: StaffRole; permissions: string[] };
/** المستخدم الحالي كما يعيده GET /auth/me */
export type SessionUser = CustomerMe | AdminMe;

export type Finance = { billed: number; paid: number; remaining: number };
