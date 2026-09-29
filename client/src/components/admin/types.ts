import type { Availability, MarketFile } from '../../lib/market';
/** أنواع بيانات لوحة التحكم — مطابقة لاستجابات /api/v1/admin */
import type { AdminSettings, BookingType, CorporateType, MediaKind, RequestStatus, SpecField } from '../../lib/types';

export type Urgency = 'NORMAL' | 'URGENT' | 'EMERGENCY';
export type AreaZone = 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN';
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
export type FileKind = 'EVALUATION' | 'QUOTE' | 'CONTRACT' | 'INVOICE' | 'OTHER';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CLIQ' | 'CARD' | 'OTHER';
export type WaResult = { link: string; sent: boolean } | null;

export type Technician = {
  id: string;
  name: string;
  phone: string;
  specialty: string | null;
  active: boolean;
  activeBookings?: number;
  createdAt: string;
};

export type QuoteFile = {
  id: string;
  customerId: string;
  bookingId: string | null;
  orderId: string | null;
  corporateRequestId: string | null;
  contractId: string | null;
  kind: FileKind;
  title: string;
  url: string;
  amount: number | null;
  createdAt: string;
};

export type Payment = {
  id: string;
  customerId: string;
  bookingId: string | null;
  orderId: string | null;
  contractId: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  booking?: { number: number } | null;
  order?: { number: number } | null;
  contract?: { number: number } | null;
  recordedBy?: { name: string } | null;
};

export type WhatsAppLog = {
  id: string;
  to: string;
  channel: 'LINK' | 'CLOUD_API';
  status: 'PREPARED' | 'SENT' | 'FAILED';
  message: string;
  link: string | null;
  error: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  actorType: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
  actor: { name: string } | null;
};

export type BookingRow = {
  id: string;
  number: number;
  ref: string;
  type: BookingType;
  status: RequestStatus;
  customerId: string;
  name: string;
  phone: string;
  locationText: string;
  lat: number | null;
  lng: number | null;
  floor: string | null;
  scheduledAt: string;
  notes: string | null;
  urgency: Urgency;
  zone: AreaZone | null;
  inspectionFee: number | null;
  quotedAmount: number | null;
  details: Record<string, unknown>;
  technicianId: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  technician: { id: string; name: string } | null;
  _count?: { media: number };
};

export type BookingMedia = {
  id: string;
  kind: MediaKind;
  purpose: string;
  url: string;
  originalName: string | null;
};

export type BookingDetail = Omit<BookingRow, 'technician'> & {
  whatsappText: string;
  localDate: string;
  localTime: string;
  media: BookingMedia[];
  technician: Technician | null;
  customer: { id: string; name: string; phone: string };
  quoteFiles: QuoteFile[];
  payments: Payment[];
  whatsappLogs: WhatsAppLog[];
};

export type CalendarItem = {
  id: string;
  number: number;
  type: BookingType;
  status: RequestStatus;
  name: string;
  scheduledAt: string;
  urgency: Urgency;
  locationText: string;
  technician: { name: string } | null;
  localDate: string;
  localTime: string;
};

export type OrderRow = {
  id: string;
  number: number;
  ref: string;
  customerId: string;
  customerName: string;
  phone: string;
  address: string;
  notes: string | null;
  status: RequestStatus;
  subtotal: number;
  discountTotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
  vendorOrders?: { id: string; number: number; status: RequestStatus; vendor: { id: string; name: string } }[];
};

export type AdminVendorOrder = {
  id: string;
  number: number;
  status: RequestStatus;
  subtotal: number;
  total: number;
  commissionTotal: number;
  vendorNet: number;
  payoutId: string | null;
  vendor: { id: string; name: string; slug: string; isHouse: boolean };
  payout: { id: string; paidAt: string } | null;
};

export type OrderDetail = Omit<OrderRow, 'vendorOrders'> & {
  whatsappText: string;
  items: {
    id: string;
    productId: string;
    vendorOrderId: string;
    name: string;
    unitPrice: number;
    discountPercent: number;
    unitFinalPrice: number;
    quantity: number;
    lineTotal: number;
    commissionPercent: number;
    commissionAmount: number;
    vendorNet: number;
    product: { slug: string; media: { url: string; kind: MediaKind }[] } | null;
  }[];
  vendorOrders: AdminVendorOrder[];
  customer: { id: string; name: string; phone: string };
  payments: Payment[];
  whatsappLogs: WhatsAppLog[];
  quoteFiles?: QuoteFile[];
  paymentMethod: string | null;
  code: string | null;
  deliveryStatus: import('../../lib/delivery').DeliveryStatus;
  financialStatus: import('../../lib/delivery').FinancialStatus | null;
  deliveryFee: number;
  deliveryNote: string | null;
  codAmount: number | null;
  codStatus: 'PENDING' | 'COLLECTED' | 'SETTLED' | null;
  codCollected: number | null;
  driver: { id: string; name: string } | null;
  deliveryCompany: { id: string; name: string } | null;
  settlement: { id: string; ref: string } | null;
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  specFields: SpecField[];
  sortOrder: number;
  visible: boolean;
  productCount: number;
  childCount: number;
  commissionGroup?: string | null;
  description?: string | null;
};

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type VendorTotals = {
  salesTotal: number;
  commissionTotal: number;
  vendorNetTotal: number;
  ordersCount: number;
  due: number;
  dueOrders: number;
  pending: number;
  paid: number;
};

export type AdminVendor = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  commissionPercent: number;
  active: boolean;
  isHouse: boolean;
  createdAt: string;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  productCount?: number;
  pendingCount?: number;
  totals?: VendorTotals;
};

export type VendorPayout = {
  id: string;
  amount: number;
  salesTotal: number;
  commissionTotal: number;
  ordersCount: number;
  method: PaymentMethod;
  reference: string | null;
  note?: string | null;
  paidAt: string;
  recordedBy?: { name: string } | null;
};

export type DueVendorOrder = {
  id: string;
  number: number;
  total: number;
  commissionTotal: number;
  vendorNet: number;
  createdAt: string;
  order?: { id: string; number: number };
};

export type VendorReportRow = VendorTotals & { vendor: AdminVendor };

export type ProductMedia = { id: string; kind: MediaKind; url: string; sortOrder: number };

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPercent: number;
  finalPrice: number;
  stock: number;
  visible: boolean;
  featured: boolean;
  categoryId: string;
  category: { id: string; name: string };
  vendorId: string;
  vendor?: { id: string; name: string; slug: string; isHouse: boolean };
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  specs: Record<string, string | number>;
  media: ProductMedia[];
  createdAt: string;
  sku: string | null;
  partNumber: string | null;
  manufacturer: string | null;
  brand: string | null;
  originCountry: string | null;
  priceOnRequest: boolean;
  minOrderQty: number;
  availability: Availability;
  leadTimeDays: number | null;
  warranty: string | null;
  videoUrl: string | null;
  keywords: string | null;
  documents: MarketFile[];
  views?: number;
};

export type ProductionImpact = 'NO_STOP_NEEDED' | 'CANNOT_STOP' | 'PARTIAL_STOP';
export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Contract = {
  id: string;
  number: number;
  corporateRequestId: string | null;
  customerId: string;
  title: string;
  startDate: string;
  endDate: string;
  value: number;
  status: ContractStatus;
  fileUrl: string | null;
  reminderDays: number;
  notes: string | null;
  createdAt: string;
  customer?: { id: string; name: string; phone: string; companyName: string | null };
  corporateRequest?: { id: string; number: number; companyName: string } | null;
  // ── عقود الصيانة ──
  ref?: string | null;
  type?: 'MAINTENANCE' | 'ANNUAL_CORPORATE';
  displayStatus?: ContractStatus | 'EXPIRING_SOON';
  paid?: number;
  remaining?: number;
  visitsIncluded?: number | null;
  visitsUsed?: number;
  visitsRemaining?: number | null;
  services?: { id: string; key: string; name: string }[];
};

export type CorporateRow = {
  id: string;
  number: number;
  ref: string;
  type: CorporateType;
  status: RequestStatus;
  customerId: string;
  companyName: string;
  contactName: string;
  managerPhone: string;
  maintenancePhone: string;
  locationText: string;
  lat: number | null;
  lng: number | null;
  commercialRegisterUrl: string | null;
  licenseUrl: string | null;
  workLocation: string | null;
  productionImpact: ProductionImpact | null;
  productionLineAffected: boolean | null;
  urgencyLevel: UrgencyLevel | null;
  notes: string | null;
  adminNotes: string | null;
  quotedAmount: number | null;
  createdAt: string;
  updatedAt: string;
  services: { id?: string; name: string }[];
  _count?: { contracts: number };
};

export type CorporateDetail = CorporateRow & {
  customer: { id: string; name: string; phone: string; companyName: string | null };
  contracts: Contract[];
  quoteFiles: QuoteFile[];
};

export type FinanceSummary = { billed: number; paid: number; remaining: number };

export type FinanceRow = FinanceSummary & { id: string; name: string; phone: string; companyName: string | null };

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  companyName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { bookings: number; orders: number; corporateRequests: number };
};

export type CustomerDetail = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  vendor: { id: string; name: string; slug: string; active: boolean; commissionPercent: number } | null;
  bookings: BookingRow[];
  orders: (OrderRow & { items: { id: string; name: string; quantity: number }[] })[];
  corporateRequests: CorporateRow[];
  contracts: Contract[];
  quoteFiles: QuoteFile[];
  payments: Payment[];
  finance: FinanceSummary;
};

type OpsPeriod = { orders: number; delivered: number; failed: number; cancelled: number; sales: number; codCollected: number; codPending: number; onlinePayments: number; deliveryFees: number };

export type DashboardStats = {
  bookingsToday: number;
  newBookings: number;
  newOrders: number;
  pendingCorporate: number;
  salesMonth: number;
  ordersMonth: number;
  expiringContracts: number;
  /** منتجات موردين بانتظار المراجعة */
  pendingProducts: number;
  /** التوصيل والتحصيل والعقود (اليوم/الشهر) */
  ops?: {
    today: OpsPeriod;
    month: OpsPeriod & { tenderCommissions: number };
    activeContracts: number;
    expiringContracts: number;
    cashWithCarriers: number;
  };
  upcoming: {
    id: string;
    number: number;
    type: BookingType;
    name: string;
    scheduledAt: string;
    status: RequestStatus;
    locationText: string;
    urgency: Urgency;
  }[];
  activity: {
    kind: 'booking' | 'order' | 'corporate';
    id: string;
    number: number;
    title: string;
    sub: string | number;
    status: RequestStatus;
    at: string;
  }[];
};

export type SettingsResponse = {
  settings: AdminSettings;
  system: { whatsappMode: 'LINK' | 'CLOUD_API'; cloudinary: boolean; email: boolean };
};

export type AdminEvent = {
  type: 'booking.created' | 'order.created' | 'corporate.created' | 'status.changed' | 'product.pending' | 'rfq.new' | 'rfq.awarded' | 'supplier.pending';
  id: string;
  title: string;
  at: string;
};
