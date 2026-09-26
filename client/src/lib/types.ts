export type RequestStatus = 'NEW' | 'UNDER_REVIEW' | 'PRICED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type BookingType = 'INSPECTION' | 'PAINTING' | 'CONSTRUCTION' | 'METALWORK' | 'GENERAL';
export type CorporateType = 'ANNUAL' | 'URGENT';
export type MediaKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pages: number };

export type SiteSettings = {
  whatsappNumber: string;
  phone: string;
  email: string;
  address: string;
  inspectionFeeInside: number;
  inspectionFeeOutside: number;
  emergencyFeeInside: number;
  emergencyFeeOutside: number;
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
};

export type Category = { id: string; name: string; slug: string; productCount?: number };

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
  category: { id: string; name: string; slug: string };
  media: Media[];
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

export type CustomerMe = { id: string; name: string; phone: string; companyName: string | null; hasPassword: boolean };
export type AdminMe = { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF' };

export type Finance = { billed: number; paid: number; remaining: number };
