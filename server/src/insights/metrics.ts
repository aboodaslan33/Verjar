import { Prisma } from '@prisma/client';
import { badRequest } from '../lib/http';
import { prisma } from '../lib/prisma';
import { ammanParts, ammanToUtc } from '../lib/time';

/**
 * إحصائيات المنصة الشهرية — تُحسب من البيانات الفعلية (الطلبات، الصيانة، العقود، الفواتير، العمولات).
 * كل شهر يُحفظ في MonthlySnapshot: الشهر المكتمل يُجمَّد (أرشيف دائم)، والشهر الجاري يُحدَّث عند كل عرض.
 *
 * التعريفات (تظهر أيضًا في الواجهة):
 * - المبيعات (GMV): طلبات المتجر + الحجوزات + عقود الصيانة + طلبات الشركات المسعّرة + صفقات عروض الأسعار + العطاءات المرسّاة.
 * - الطلبات: طلبات المتجر + الحجوزات + طلبات الشركات + طلبات عروض الأسعار (غير الملغاة).
 * - إيرادات FARJAR: مبيعات منتجات متجر FARJAR + عمولات المتجر + خدمات FARJAR (حجوزات/عقود/شركات)
 *   + فواتير السوق المدفوعة (اشتراكات، إعلانات، Leads، عمولات) + عمولات العطاءات − خصومات الكوبونات.
 */

export type Period = { year: number; month: number };
export const periodKey = (p: Period) => `${p.year}-${String(p.month).padStart(2, '0')}`;

export function parsePeriod(s: string | undefined | null): Period {
  if (!s) return currentPeriod();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) throw badRequest('الشهر بصيغة YYYY-MM');
  const p = { year: Number(m[1]), month: Number(m[2]) };
  if (p.month < 1 || p.month > 12 || p.year < 2020 || p.year > 2100) throw badRequest('شهر غير صالح');
  return p;
}

export function currentPeriod(now = new Date()): Period {
  const [y, m] = ammanParts(now).date.split('-').map(Number);
  return { year: y, month: m };
}

export function shiftPeriod(p: Period, by: number): Period {
  const i = p.year * 12 + (p.month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export const comparePeriods = (a: Period, b: Period) => a.year * 12 + a.month - (b.year * 12 + b.month);

/** حدود الشهر بتوقيت عمّان [start, end) */
export function periodRange(p: Period) {
  const next = shiftPeriod(p, 1);
  return { start: ammanToUtc(`${periodKey(p)}-01`, '00:00'), end: ammanToUtc(`${periodKey(next)}-01`, '00:00') };
}

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

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export async function computePeriod(p: Period): Promise<{ metrics: Metrics; breakdown: Breakdown }> {
  const { start, end } = periodRange(p);
  return computeRange(start, end);
}

/** نفس المؤشرات لأي فترة (مثل إجمالي المنصة منذ البداية) */
export async function computeRange(start: Date, end: Date): Promise<{ metrics: Metrics; breakdown: Breakdown }> {
  const inRange = (col: string) => Prisma.sql`${Prisma.raw(col)} >= ${start} AND ${Prisma.raw(col)} < ${end}`;

  const [store] = await prisma.$queryRaw<{ orders: bigint; sales: unknown; coupons: unknown }[]>`
    SELECT COUNT(*) AS orders, COALESCE(SUM("total"),0) AS sales, COALESCE(SUM("couponDiscount"),0) AS coupons
    FROM "Order" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}`;

  const [items] = await prisma.$queryRaw<{ qty: unknown; value: unknown; house: unknown; commissions: unknown }[]>`
    SELECT COALESCE(SUM(i."quantity"),0) AS qty, COALESCE(SUM(i."lineTotal"),0) AS value,
      COALESCE(SUM(CASE WHEN v."isHouse" THEN i."lineTotal" ELSE 0 END),0) AS house,
      COALESCE(SUM(CASE WHEN v."isHouse" THEN 0 ELSE i."commissionAmount" END),0) AS commissions
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" JOIN "Vendor" v ON v."id" = i."vendorId"
    WHERE o."deletedAt" IS NULL AND o."status" <> 'CANCELLED' AND ${inRange('o."createdAt"')}`;

  const [svc] = await prisma.$queryRaw<{ bookings: bigint; bookingValue: unknown; corp: bigint; corpValue: unknown; contracts: bigint; contractValue: unknown }[]>`
    SELECT
      (SELECT COUNT(*) FROM "Booking" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}) AS bookings,
      (SELECT COALESCE(SUM(COALESCE("quotedAmount","inspectionFee",0)),0) FROM "Booking" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}) AS "bookingValue",
      (SELECT COUNT(*) FROM "CorporateRequest" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}) AS corp,
      (SELECT COALESCE(SUM(COALESCE(r."quotedAmount",0)),0) FROM "CorporateRequest" r WHERE r."deletedAt" IS NULL AND r."status" <> 'CANCELLED' AND ${inRange('r."createdAt"')}
        AND NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."corporateRequestId" = r."id" AND c."deletedAt" IS NULL)) AS "corpValue",
      (SELECT COUNT(*) FROM "Contract" WHERE "deletedAt" IS NULL AND "status" NOT IN ('CANCELLED','DRAFT') AND ${inRange('"createdAt"')}) AS contracts,
      (SELECT COALESCE(SUM("value"),0) FROM "Contract" WHERE "deletedAt" IS NULL AND "status" NOT IN ('CANCELLED','DRAFT') AND ${inRange('"createdAt"')}) AS "contractValue"`;

  const [mkt] = await prisma.$queryRaw<{ rfqs: bigint; deals: bigint; dealValue: unknown; tenderValue: unknown; tenderCommission: unknown }[]>`
    SELECT
      (SELECT COUNT(*) FROM "Rfq" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}) AS rfqs,
      (SELECT COUNT(DISTINCT e."rfqId") FROM "RfqEvent" e WHERE e."action" = 'accepted' AND ${inRange('e."createdAt"')}) AS deals,
      (SELECT COALESCE(SUM(COALESCE(q."finalValue", q."expectedValue", 0)),0) FROM "Rfq" q WHERE q."deletedAt" IS NULL AND q."status" IN ('AWARDED','CLOSED')
        AND EXISTS (SELECT 1 FROM "RfqEvent" e WHERE e."rfqId" = q."id" AND e."action" = 'accepted' AND ${inRange('e."createdAt"')})) AS "dealValue",
      (SELECT COALESCE(SUM("awardedAmount"),0) FROM "Tender" WHERE "deletedAt" IS NULL AND "status" = 'AWARDED' AND ${inRange('"awardedAt"')}) AS "tenderValue",
      (SELECT COALESCE(SUM("commissionAmount"),0) FROM "Tender" WHERE "deletedAt" IS NULL AND "status" = 'AWARDED' AND ${inRange('"awardedAt"')}) AS "tenderCommission"`;

  const invoices = await prisma.$queryRaw<{ purpose: string; total: unknown; count: bigint }[]>`
    SELECT "purpose"::text AS purpose, COALESCE(SUM("amount"),0) AS total, COUNT(*) AS count
    FROM "MarketInvoice" WHERE "status" = 'PAID' AND ${inRange('"paidAt"')} GROUP BY 1`;
  const inv = (purpose: string) => invoices.find((i) => i.purpose === purpose);

  const [people] = await prisma.$queryRaw<{
    totalCustomers: bigint;
    newCustomers: bigint;
    activeCustomers: bigint;
    buyers: bigint;
    returning: bigint;
    totalSuppliers: bigint;
    newSuppliers: bigint;
    activeSuppliers: bigint;
    activeMaintenance: bigint;
    newProducts: bigint;
    totalProducts: bigint;
  }[]>`
    WITH active AS (
      SELECT "customerId" AS id FROM "Order" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}
      UNION SELECT "customerId" FROM "Booking" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}
      UNION SELECT "customerId" FROM "CorporateRequest" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}
      UNION SELECT "customerId" FROM "Rfq" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}
      UNION SELECT "customerId" FROM "Payment" WHERE "deletedAt" IS NULL AND ${inRange('"paidAt"')}
    ), buyers AS (
      SELECT DISTINCT "customerId" AS id FROM "Order" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}
    ), vendor_active AS (
      SELECT DISTINCT vo."vendorId" AS id FROM "VendorOrder" vo JOIN "Order" o ON o."id" = vo."orderId"
        WHERE o."deletedAt" IS NULL AND ${inRange('o."createdAt"')}
      UNION SELECT "vendorId" FROM "Quote" WHERE ${inRange('"createdAt"')}
      UNION SELECT "vendorId" FROM "TenderOffer" WHERE "vendorId" IS NOT NULL AND ${inRange('"submittedAt"')}
    ), maint AS (
      SELECT v."id" FROM "Vendor" v WHERE v."status" = 'APPROVED' AND v."active" AND NOT v."isHouse"
        AND (v."businessField" ILIKE '%صيان%' OR v."businessField" ILIKE '%maint%'
          OR EXISTS (SELECT 1 FROM "Category" c WHERE c."id" = ANY(v."categoryIds") AND (c."name" ILIKE '%صيان%' OR c."slug" LIKE '%maintenance%')))
    )
    SELECT
      (SELECT COUNT(*) FROM "Customer" WHERE "deletedAt" IS NULL AND "createdAt" < ${end}) AS "totalCustomers",
      (SELECT COUNT(*) FROM "Customer" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}) AS "newCustomers",
      (SELECT COUNT(*) FROM active a JOIN "Customer" c ON c."id" = a.id WHERE c."deletedAt" IS NULL) AS "activeCustomers",
      (SELECT COUNT(*) FROM buyers) AS buyers,
      (SELECT COUNT(*) FROM buyers b WHERE EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = b.id AND o."deletedAt" IS NULL AND o."status" <> 'CANCELLED' AND o."createdAt" < ${start})) AS returning,
      (SELECT COUNT(*) FROM "Vendor" WHERE "status" = 'APPROVED' AND "active" AND NOT "isHouse" AND "createdAt" < ${end}) AS "totalSuppliers",
      (SELECT COUNT(*) FROM "Vendor" WHERE NOT "isHouse" AND ${inRange('"createdAt"')}) AS "newSuppliers",
      (SELECT COUNT(*) FROM vendor_active a JOIN "Vendor" v ON v."id" = a.id WHERE NOT v."isHouse") AS "activeSuppliers",
      (SELECT COUNT(*) FROM maint m WHERE m."id" IN (SELECT id FROM vendor_active)) AS "activeMaintenance",
      (SELECT COUNT(*) FROM "Product" WHERE "deletedAt" IS NULL AND ${inRange('"createdAt"')}) AS "newProducts",
      (SELECT COUNT(*) FROM "Product" WHERE "deletedAt" IS NULL AND "approvalStatus" = 'APPROVED' AND "createdAt" < ${end}) AS "totalProducts"`;

  const storeSales = n(store.sales);
  const bookingValue = n(svc.bookingValue);
  const contractValue = n(svc.contractValue);
  const corpValue = n(svc.corpValue);
  const servicesSales = bookingValue + contractValue + corpValue;
  const dealValue = n(mkt.dealValue);
  const tenderValue = n(mkt.tenderValue);
  const storeOrders = Number(store.orders);
  const coupons = n(store.coupons);
  const storeCommissions = n(items.commissions);
  const houseSales = n(items.house);
  const marketplace = n(inv('SUBSCRIPTION')?.total) + n(inv('AD')?.total) + n(inv('LEAD_FEE')?.total) + n(inv('COMMISSION')?.total) + n(inv('PROCUREMENT')?.total);
  const tenderCommission = n(mkt.tenderCommission);
  const storeRevenue = houseSales + storeCommissions - coupons;
  const totalSuppliers = Number(people.totalSuppliers);
  const activeSuppliers = Number(people.activeSuppliers);
  const buyers = Number(people.buyers);

  const metrics: Metrics = {
    totalSales: r3(storeSales + servicesSales + dealValue + tenderValue),
    storeSales: r3(storeSales),
    productSales: r3(n(items.value)),
    servicesSales: r3(servicesSales),
    maintenanceContractsValue: r3(contractValue),
    rfqDealsValue: r3(dealValue),
    tenderValue: r3(tenderValue),
    totalOrders: storeOrders + Number(svc.bookings) + Number(svc.corp) + Number(mkt.rfqs),
    storeOrders,
    bookings: Number(svc.bookings),
    corporateRequests: Number(svc.corp),
    rfqs: Number(mkt.rfqs),
    rfqDeals: Number(mkt.deals),
    contracts: Number(svc.contracts),
    productsSold: n(items.qty),
    avgOrderValue: storeOrders ? r3(storeSales / storeOrders) : 0,
    totalCustomers: Number(people.totalCustomers),
    newCustomers: Number(people.newCustomers),
    activeCustomers: Number(people.activeCustomers),
    returningCustomers: Number(people.returning),
    returningRate: buyers ? Math.round((Number(people.returning) / buyers) * 1000) / 10 : 0,
    totalSuppliers,
    newSuppliers: Number(people.newSuppliers),
    activeSuppliers,
    activeSupplierRate: totalSuppliers ? Math.round((activeSuppliers / totalSuppliers) * 1000) / 10 : 0,
    activeMaintenanceCompanies: Number(people.activeMaintenance),
    newProducts: Number(people.newProducts),
    totalProducts: Number(people.totalProducts),
    farjarRevenue: r3(storeRevenue + servicesSales + marketplace + tenderCommission),
    farjarCommissions: r3(storeCommissions + n(inv('COMMISSION')?.total) + tenderCommission),
    subscriptionsRevenue: r3(n(inv('SUBSCRIPTION')?.total)),
    subscriptionsCount: Number(inv('SUBSCRIPTION')?.count ?? 0),
    adsRevenue: r3(n(inv('AD')?.total)),
    leadFeesRevenue: r3(n(inv('LEAD_FEE')?.total)),
    couponDiscounts: r3(coupons),
  };

  // ── التفاصيل ──
  const topCategories = await prisma.$queryRaw<{ id: string; name: string; sales: unknown; quantity: unknown }[]>`
    SELECT COALESCE(pc."id", c."id") AS id, COALESCE(pc."name", c."name") AS name, SUM(i."lineTotal") AS sales, SUM(i."quantity") AS quantity
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    JOIN "Product" p ON p."id" = i."productId" JOIN "Category" c ON c."id" = p."categoryId" LEFT JOIN "Category" pc ON pc."id" = c."parentId"
    WHERE o."deletedAt" IS NULL AND o."status" <> 'CANCELLED' AND ${inRange('o."createdAt"')}
    GROUP BY 1, 2 ORDER BY sales DESC LIMIT 10`;
  const topProducts = await prisma.$queryRaw<{ id: string; name: string; quantity: unknown; sales: unknown }[]>`
    SELECT COALESCE(i."productId", i."name") AS id, MAX(i."name") AS name, SUM(i."quantity") AS quantity, SUM(i."lineTotal") AS sales
    FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
    WHERE o."deletedAt" IS NULL AND o."status" <> 'CANCELLED' AND ${inRange('o."createdAt"')}
    GROUP BY 1 ORDER BY quantity DESC, sales DESC LIMIT 10`;
  const topRegions = await prisma.$queryRaw<{ region: string; orders: bigint; sales: unknown }[]>`
    SELECT region, SUM(orders)::bigint AS orders, SUM(sales) AS sales FROM (
      SELECT COALESCE(NULLIF(TRIM("area"),''), 'غير محدد') AS region, COUNT(*) AS orders, SUM("total") AS sales
        FROM "Order" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')} GROUP BY 1
      UNION ALL
      SELECT CASE "zone" WHEN 'INSIDE_AMMAN' THEN 'عمّان' WHEN 'OUTSIDE_AMMAN' THEN 'خارج عمّان' ELSE 'غير محدد' END, COUNT(*), SUM(COALESCE("quotedAmount","inspectionFee",0))
        FROM "Booking" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')} GROUP BY 1
    ) t GROUP BY region ORDER BY orders DESC LIMIT 10`;
  const topSuppliers = await prisma.$queryRaw<{ id: string; name: string; sales: unknown; orders: bigint }[]>`
    SELECT v."id", v."name", SUM(vo."total") AS sales, COUNT(*) AS orders
    FROM "VendorOrder" vo JOIN "Order" o ON o."id" = vo."orderId" JOIN "Vendor" v ON v."id" = vo."vendorId"
    WHERE o."deletedAt" IS NULL AND vo."status" <> 'CANCELLED' AND ${inRange('o."createdAt"')}
    GROUP BY 1, 2 ORDER BY sales DESC LIMIT 10`;
  const topCustomers = await prisma.$queryRaw<{ id: string; name: string; spend: unknown; orders: bigint }[]>`
    SELECT c."id", c."name", SUM(t.amount) AS spend, SUM(t.cnt)::bigint AS orders FROM (
      SELECT "customerId", "total" AS amount, 1 AS cnt FROM "Order" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}
      UNION ALL SELECT "customerId", COALESCE("quotedAmount","inspectionFee",0), 1 FROM "Booking" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND ${inRange('"createdAt"')}
      UNION ALL SELECT "customerId", "value", 1 FROM "Contract" WHERE "deletedAt" IS NULL AND "status" NOT IN ('CANCELLED','DRAFT') AND ${inRange('"createdAt"')}
    ) t JOIN "Customer" c ON c."id" = t."customerId" WHERE c."deletedAt" IS NULL
    GROUP BY 1, 2 ORDER BY spend DESC LIMIT 10`;

  const breakdown: Breakdown = {
    topCategories: topCategories.map((x) => ({ id: x.id, name: x.name, sales: r3(n(x.sales)), quantity: n(x.quantity) })),
    topProducts: topProducts.map((x) => ({ id: x.id, name: x.name, quantity: n(x.quantity), sales: r3(n(x.sales)) })),
    topRegions: topRegions.map((x) => ({ region: x.region, orders: Number(x.orders), sales: r3(n(x.sales)) })),
    topSuppliers: topSuppliers.map((x) => ({ id: x.id, name: x.name, sales: r3(n(x.sales)), orders: Number(x.orders) })),
    topCustomers: topCustomers.map((x) => ({ id: x.id, name: x.name, spend: r3(n(x.spend)), orders: Number(x.orders) })),
    revenueBySection: {
      store: r3(storeRevenue),
      services: r3(servicesSales),
      marketplace: r3(marketplace),
      tenders: r3(tenderCommission),
    },
  };
  return { metrics, breakdown };
}

export type PeriodData = { period: string; final: boolean; computedAt: Date; metrics: Metrics; breakdown: Breakdown };

/**
 * إحصائيات شهر محفوظة: الشهر المكتمل يُحسب مرة ويُجمَّد، والجاري يُحسب ويُحدَّث.
 * refresh يعيد حساب الشهر المكتمل (عند تصحيح بيانات قديمة) — ولا يحذف الأرشيف.
 */
export async function getPeriod(p: Period, opts: { refresh?: boolean } = {}): Promise<PeriodData> {
  const key = periodKey(p);
  const cmp = comparePeriods(p, currentPeriod());
  if (cmp > 0) throw badRequest('لا توجد بيانات لشهر قادم');
  const closed = cmp < 0;
  if (closed && !opts.refresh) {
    const snap = await prisma.monthlySnapshot.findUnique({ where: { period: key } });
    if (snap?.final) return { period: key, final: true, computedAt: snap.computedAt, metrics: snap.metrics as Metrics, breakdown: snap.breakdown as Breakdown };
  }
  const { metrics, breakdown } = await computePeriod(p);
  const data = { metrics: metrics as unknown as Prisma.InputJsonValue, breakdown: breakdown as unknown as Prisma.InputJsonValue, final: closed, computedAt: new Date() };
  const snap = await prisma.monthlySnapshot.upsert({ where: { period: key }, create: { period: key, ...data }, update: data });
  return { period: key, final: snap.final, computedAt: snap.computedAt, metrics, breakdown };
}

/** سلسلة شهرية للرسوم البيانية (من الأقدم للأحدث) */
export async function getSeries(end: Period, months: number) {
  const out: PeriodData[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(await getPeriod(shiftPeriod(end, -i)));
  return out;
}

export const GROWTH_KEYS = ['totalSales', 'totalOrders', 'activeCustomers', 'newCustomers', 'activeSuppliers', 'newSuppliers', 'farjarRevenue', 'productsSold', 'newProducts', 'avgOrderValue'] as const;

/** نسبة النمو بين شهرين (null إذا كانت قيمة الأساس صفرًا) */
export function growth(a: Metrics, b: Metrics) {
  return Object.fromEntries(
    GROWTH_KEYS.map((k) => {
      const from = a[k];
      const to = b[k];
      return [k, { from, to, change: r3(to - from), pct: from ? Math.round(((to - from) / from) * 1000) / 10 : to ? null : 0 }];
    }),
  ) as Record<(typeof GROWTH_KEYS)[number], { from: number; to: number; change: number; pct: number | null }>;
}

/** يجمّد الأشهر المكتملة التي لم تُحفظ بعد (تُستدعى من المهام الدورية) */
export async function snapshotClosedMonths(back = 3) {
  const cur = currentPeriod();
  for (let i = back; i >= 1; i--) {
    const p = shiftPeriod(cur, -i);
    const snap = await prisma.monthlySnapshot.findUnique({ where: { period: periodKey(p) }, select: { final: true } });
    if (!snap?.final) await getPeriod(p);
  }
  await getPeriod(cur);
}
