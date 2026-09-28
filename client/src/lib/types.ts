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

export type VendorBrief = { id: string; name: string; slug: string; logoUrl: string | null; isHouse: boolean };

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
};

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
  vendor: { id: string; name: string; slug: string } | null;
};
export type StaffRole = 'ADMIN' | 'STAFF' | 'MANAGER' | 'DRIVER';
/** حساب إدارة أو توصيل مع صلاحياته الفعلية (RBAC) */
export type AdminMe = { id: string; name: string; email: string | null; username: string | null; phone: string | null; role: StaffRole; permissions: string[] };
/** المستخدم الحالي كما يعيده GET /auth/me */
export type SessionUser = CustomerMe | AdminMe;

export type Finance = { billed: number; paid: number; remaining: number };
