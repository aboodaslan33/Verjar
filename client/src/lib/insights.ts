/** أنواع وتسميات إحصائيات المنصة والتميز والمكافآت (لوحة الـ Super Admin) */

export type Metrics = {
  totalSales: number;
  storeSales: number;
  productSales: number;
  servicesSales: number;
  maintenanceContractsValue: number;
  rfqDealsValue: number;
  tenderValue: number;
  totalOrders: number;
  storeOrders: number;
  bookings: number;
  corporateRequests: number;
  rfqs: number;
  rfqDeals: number;
  contracts: number;
  productsSold: number;
  avgOrderValue: number;
  totalCustomers: number;
  newCustomers: number;
  activeCustomers: number;
  returningCustomers: number;
  returningRate: number;
  totalSuppliers: number;
  newSuppliers: number;
  activeSuppliers: number;
  activeSupplierRate: number;
  activeMaintenanceCompanies: number;
  newProducts: number;
  totalProducts: number;
  farjarRevenue: number;
  farjarCommissions: number;
  subscriptionsRevenue: number;
  subscriptionsCount: number;
  adsRevenue: number;
  leadFeesRevenue: number;
  couponDiscounts: number;
};

export type Breakdown = {
  topCategories: { id: string; name: string; sales: number; quantity: number }[];
  topProducts: { id: string; name: string; quantity: number; sales: number }[];
  topRegions: { region: string; orders: number; sales: number }[];
  topSuppliers: { id: string; name: string; sales: number; orders: number }[];
  topCustomers: { id: string; name: string; spend: number; orders: number }[];
  revenueBySection: { store: number; services: number; marketplace: number; tenders: number };
};

export type Growth = Record<GrowthKey, { from: number; to: number; change: number; pct: number | null }>;
export type GrowthKey = 'totalSales' | 'totalOrders' | 'activeCustomers' | 'newCustomers' | 'activeSuppliers' | 'newSuppliers' | 'farjarRevenue' | 'productsSold' | 'newProducts' | 'avgOrderValue';

export type PeriodData = {
  period: string;
  label: string;
  final: boolean;
  computedAt: string;
  metrics: Metrics;
  breakdown: Breakdown;
  previous: { period: string; label: string; metrics: Metrics };
  growth: Growth;
};

export type SeriesData = {
  points: { period: string; label: string; final: boolean; metrics: Metrics; revenueBySection: Breakdown['revenueBySection'] }[];
  bestSalesMonth: { period: string; label: string; value: number };
  bestOrdersMonth: { period: string; label: string; value: number };
  categories: { label: string; value: number }[];
  products: { label: string; value: number }[];
  regions: { label: string; value: number }[];
  suppliers: { label: string; value: number }[];
  customers: { label: string; value: number }[];
};

export type MetricFormat = 'money' | 'count' | 'percent';
export const METRIC: Record<keyof Metrics, { label: string; format: MetricFormat; hint?: string }> = {
  totalSales: { label: 'إجمالي المبيعات', format: 'money', hint: 'المتجر + الصيانة والعقود + طلبات الشركات + صفقات عروض الأسعار + العطاءات' },
  storeSales: { label: 'مبيعات المتجر', format: 'money' },
  productSales: { label: 'قيمة المنتجات المباعة', format: 'money' },
  servicesSales: { label: 'مبيعات الصيانة والخدمات', format: 'money', hint: 'الحجوزات + عقود الصيانة + طلبات الشركات المسعّرة' },
  maintenanceContractsValue: { label: 'قيمة عقود الصيانة', format: 'money' },
  rfqDealsValue: { label: 'صفقات عروض الأسعار', format: 'money' },
  tenderValue: { label: 'العطاءات المرسّاة', format: 'money' },
  totalOrders: { label: 'إجمالي الطلبات', format: 'count', hint: 'طلبات المتجر + الحجوزات + طلبات الشركات + طلبات عروض الأسعار' },
  storeOrders: { label: 'طلبات المتجر', format: 'count' },
  bookings: { label: 'حجوزات الصيانة', format: 'count' },
  corporateRequests: { label: 'طلبات الشركات', format: 'count' },
  rfqs: { label: 'طلبات عروض الأسعار', format: 'count' },
  rfqDeals: { label: 'صفقات مُرسّاة', format: 'count' },
  contracts: { label: 'عقود صيانة جديدة', format: 'count' },
  productsSold: { label: 'المنتجات المباعة (قطعة)', format: 'count' },
  avgOrderValue: { label: 'متوسط قيمة الطلب', format: 'money', hint: 'مبيعات المتجر ÷ عدد طلبات المتجر' },
  totalCustomers: { label: 'إجمالي العملاء', format: 'count' },
  newCustomers: { label: 'عملاء جدد', format: 'count' },
  activeCustomers: { label: 'عملاء نشطون', format: 'count', hint: 'لديهم طلب أو حجز أو طلب عرض سعر أو دفعة خلال الشهر' },
  returningCustomers: { label: 'عملاء عائدون', format: 'count' },
  returningRate: { label: 'نسبة العملاء العائدين', format: 'percent', hint: 'من اشتروا هذا الشهر وسبق لهم الشراء' },
  totalSuppliers: { label: 'إجمالي الموردين', format: 'count' },
  newSuppliers: { label: 'موردون جدد', format: 'count' },
  activeSuppliers: { label: 'موردون نشطون', format: 'count', hint: 'لديهم طلبات متجر أو عروض أسعار أو عطاءات خلال الشهر' },
  activeSupplierRate: { label: 'نسبة الموردين النشطين', format: 'percent' },
  activeMaintenanceCompanies: { label: 'شركات صيانة نشطة', format: 'count', hint: 'موردون معتمدون في مجال الصيانة لديهم نشاط خلال الشهر' },
  newProducts: { label: 'منتجات جديدة', format: 'count' },
  totalProducts: { label: 'إجمالي المنتجات المعتمدة', format: 'count' },
  farjarRevenue: { label: 'إيرادات FARJAR', format: 'money', hint: 'منتجات FARJAR + عمولات المتجر + خدمات FARJAR + فواتير السوق المدفوعة + عمولات العطاءات − الكوبونات' },
  farjarCommissions: { label: 'عمولات FARJAR', format: 'money' },
  subscriptionsRevenue: { label: 'إيرادات الاشتراكات', format: 'money' },
  subscriptionsCount: { label: 'اشتراكات مدفوعة', format: 'count' },
  adsRevenue: { label: 'إيرادات الإعلانات', format: 'money' },
  leadFeesRevenue: { label: 'رسوم الـ Leads', format: 'money' },
  couponDiscounts: { label: 'خصومات الكوبونات', format: 'money' },
};

export const SECTION_LABEL: Record<keyof Breakdown['revenueBySection'], string> = {
  store: 'المتجر (منتجات FARJAR + العمولات)',
  services: 'الصيانة والخدمات',
  marketplace: 'السوق (اشتراكات، إعلانات، Leads، عمولات)',
  tenders: 'عمولات العطاءات',
};

export const REWARD_TYPE_LABEL: Record<string, string> = {
  FREE_SUBSCRIPTION: 'اشتراك مجاني',
  FEATURED_PLACEMENT: 'ظهور مميز',
  HOME_BANNER: 'Banner مجاني (مورد الشهر)',
  EXTRA_PRODUCTS: 'منتجات إضافية',
  SUBSCRIPTION_DISCOUNT: 'خصم على الاشتراك',
  BADGE: 'شارة تميز',
  COUPON: 'كوبون خصم',
  POINTS: 'نقاط ولاء',
};

export const REWARD_STATUS_LABEL: Record<string, string> = { ACTIVE: 'فعّالة', EXPIRED: 'منتهية', REVOKED: 'ملغاة' };

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthName = (m: number) => MONTHS_AR[m - 1];
export function periodLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_AR[m - 1]} ${y}`;
}
/** الشهر الحالي بتوقيت عمّان YYYY-MM */
export function currentPeriodKey() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}
export function shiftKey(key: string, by: number) {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function formatMetric(v: number, f: MetricFormat) {
  if (f === 'money') return `${v.toLocaleString('en-US', { maximumFractionDigits: 3 })} د.أ`;
  if (f === 'percent') return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('en-US');
}

export function formatPct(p: number | null) {
  if (p == null) return 'جديد';
  return `${p > 0 ? '+' : ''}${p.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}
