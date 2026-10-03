import { prisma } from '../lib/prisma';
import { periodRange, type Period } from './metrics';

/**
 * ترشيح المورد/العميل المتميز من بيانات الشهر الفعلية — اقتراح فقط، والقرار للـ Super Admin.
 * النتيجة من 100: مجموع مؤشرات موزونة، كل مؤشر منسوب لأعلى قيمة بين المرشحين.
 */

const n = (v: unknown) => (v == null ? 0 : Number(v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ratio = (v: number, max: number) => (max > 0 ? v / max : 0);

export type SupplierCandidate = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  city: string | null;
  verified: boolean;
  plan: string | null;
  sales: number;
  orders: number;
  customers: number;
  completionRate: number | null;
  cancelRate: number | null;
  rating: number | null;
  ratingCount: number;
  prepHours: number | null;
  score: number;
};

export async function supplierCandidates(p: Period, limit = 10): Promise<SupplierCandidate[]> {
  const { start, end } = periodRange(p);
  const rows = await prisma.$queryRaw<
    { id: string; sales: unknown; orders: bigint; customers: bigint; completed: bigint; cancelled: bigint; prep: unknown; deals: unknown; dealCount: bigint }[]
  >`
    WITH so AS (
      SELECT vo."vendorId" AS id, vo."total", vo."status", o."customerId", o."createdAt", o."pickedUpAt"
      FROM "VendorOrder" vo JOIN "Order" o ON o."id" = vo."orderId"
      WHERE o."deletedAt" IS NULL AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
    ), dl AS (
      SELECT q."vendorId" AS id, q."total", r."customerId"
      FROM "Quote" q JOIN "Rfq" r ON r."id" = q."rfqId"
      WHERE q."status" = 'ACCEPTED' AND EXISTS (SELECT 1 FROM "RfqEvent" e WHERE e."rfqId" = r."id" AND e."action" = 'accepted' AND e."createdAt" >= ${start} AND e."createdAt" < ${end})
    ), ids AS (SELECT id FROM so UNION SELECT id FROM dl)
    SELECT ids.id,
      COALESCE((SELECT SUM("total") FROM so WHERE so.id = ids.id AND so."status" <> 'CANCELLED'),0) AS sales,
      (SELECT COUNT(*) FROM so WHERE so.id = ids.id) AS orders,
      (SELECT COUNT(DISTINCT c) FROM (SELECT "customerId" AS c FROM so WHERE so.id = ids.id AND so."status" <> 'CANCELLED' UNION SELECT "customerId" FROM dl WHERE dl.id = ids.id) x) AS customers,
      (SELECT COUNT(*) FROM so WHERE so.id = ids.id AND so."status" = 'COMPLETED') AS completed,
      (SELECT COUNT(*) FROM so WHERE so.id = ids.id AND so."status" = 'CANCELLED') AS cancelled,
      (SELECT AVG(EXTRACT(EPOCH FROM ("pickedUpAt" - "createdAt")) / 3600) FROM so WHERE so.id = ids.id AND "pickedUpAt" IS NOT NULL) AS prep,
      COALESCE((SELECT SUM("total") FROM dl WHERE dl.id = ids.id),0) AS deals,
      (SELECT COUNT(*) FROM dl WHERE dl.id = ids.id) AS "dealCount"
    FROM ids`;
  if (!rows.length) return [];
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: rows.map((r) => r.id) }, isHouse: false, status: 'APPROVED' },
    select: { id: true, name: true, slug: true, logoUrl: true, city: true, verified: true, plan: { select: { name: true } } },
  });
  const ratings = await prisma.supplierReview.groupBy({ by: ['vendorId'], where: { vendorId: { in: vendors.map((v) => v.id) }, visible: true, createdAt: { lt: end } }, _avg: { overall: true }, _count: { _all: true } });
  const list = vendors.map((v) => {
    const r = rows.find((x) => x.id === v.id)!;
    const rt = ratings.find((x) => x.vendorId === v.id);
    const orders = Number(r.orders) + Number(r.dealCount);
    const storeOrders = Number(r.orders);
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      logoUrl: v.logoUrl,
      city: v.city,
      verified: v.verified,
      plan: v.plan?.name ?? null,
      sales: r3(n(r.sales) + n(r.deals)),
      orders,
      customers: Number(r.customers),
      completionRate: storeOrders ? r1((Number(r.completed) / storeOrders) * 100) : null,
      cancelRate: storeOrders ? r1((Number(r.cancelled) / storeOrders) * 100) : null,
      rating: rt?._avg.overall != null ? r1(rt._avg.overall) : null,
      ratingCount: rt?._count._all ?? 0,
      prepHours: r.prep != null ? r1(n(r.prep)) : null,
      score: 0,
    };
  });
  const max = { sales: Math.max(...list.map((x) => x.sales)), orders: Math.max(...list.map((x) => x.orders)), customers: Math.max(...list.map((x) => x.customers)) };
  const preps = list.map((x) => x.prepHours).filter((x): x is number => x != null && x > 0);
  const fastest = preps.length ? Math.min(...preps) : 0;
  for (const x of list) {
    x.score = Math.round(
      35 * ratio(x.sales, max.sales) +
        15 * ratio(x.orders, max.orders) +
        10 * ratio(x.customers, max.customers) +
        15 * ((x.completionRate ?? 50) / 100) +
        10 * ((x.rating ?? 3) / 5) +
        8 * (x.prepHours && fastest ? fastest / x.prepHours : 0.5) +
        7 * (1 - (x.cancelRate ?? 0) / 100),
    );
  }
  return list.sort((a, b) => b.score - a.score || b.sales - a.sales).slice(0, limit);
}

export type CustomerCandidate = {
  id: string;
  name: string;
  companyName: string | null;
  phone: string;
  spend: number;
  orders: number;
  activeDays90: number;
  maintenance: number;
  paymentRate: number | null;
  lastLoginAt: Date | null;
  score: number;
};

export async function customerCandidates(p: Period, limit = 10): Promise<CustomerCandidate[]> {
  const { start, end } = periodRange(p);
  const since90 = new Date(end.getTime() - 90 * 86400_000);
  const rows = await prisma.$queryRaw<{ id: string; spend: unknown; orders: bigint; maintenance: bigint }[]>`
    SELECT t."customerId" AS id, SUM(t.amount) AS spend, SUM(t.cnt)::bigint AS orders, SUM(t.maint)::bigint AS maintenance FROM (
      SELECT "customerId", "total" AS amount, 1 AS cnt, 0 AS maint FROM "Order" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      UNION ALL SELECT "customerId", COALESCE("quotedAmount","inspectionFee",0), 1, 1 FROM "Booking" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      UNION ALL SELECT "customerId", "value", 1, 1 FROM "Contract" WHERE "deletedAt" IS NULL AND "status" NOT IN ('CANCELLED','DRAFT') AND "createdAt" >= ${start} AND "createdAt" < ${end}
      UNION ALL SELECT "customerId", COALESCE("quotedAmount",0), 1, 1 FROM "CorporateRequest" WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      UNION ALL SELECT r."customerId", COALESCE(r."finalValue", 0), 1, 0 FROM "Rfq" r WHERE r."deletedAt" IS NULL AND r."status" <> 'CANCELLED' AND r."createdAt" >= ${start} AND r."createdAt" < ${end}
    ) t GROUP BY 1 ORDER BY spend DESC LIMIT 40`;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [customers, activity, finance] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, companyName: true, phone: true, lastLoginAt: true } }),
    // تكرار النشاط: عدد الأيام التي فيها طلب/حجز/طلب عرض سعر خلال 90 يومًا حتى نهاية الشهر
    prisma.$queryRaw<{ id: string; days: bigint }[]>`
      SELECT "customerId" AS id, COUNT(DISTINCT d)::bigint AS days FROM (
        SELECT "customerId", DATE("createdAt") AS d FROM "Order" WHERE "deletedAt" IS NULL AND "createdAt" >= ${since90} AND "createdAt" < ${end}
        UNION ALL SELECT "customerId", DATE("createdAt") FROM "Booking" WHERE "deletedAt" IS NULL AND "createdAt" >= ${since90} AND "createdAt" < ${end}
        UNION ALL SELECT "customerId", DATE("createdAt") FROM "Rfq" WHERE "deletedAt" IS NULL AND "createdAt" >= ${since90} AND "createdAt" < ${end}
      ) t WHERE "customerId" = ANY(${ids}) GROUP BY 1`,
    // الالتزام بالدفع: المدفوع ÷ المطلوب (كل الفترة حتى نهاية الشهر)
    prisma.$queryRaw<{ id: string; billed: unknown; paid: unknown }[]>`
      SELECT c."id",
        (COALESCE((SELECT SUM("total") FROM "Order" WHERE "customerId" = c."id" AND "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" < ${end}),0)
         + COALESCE((SELECT SUM(COALESCE("quotedAmount","inspectionFee",0)) FROM "Booking" WHERE "customerId" = c."id" AND "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" < ${end}),0)
         + COALESCE((SELECT SUM("value") FROM "Contract" WHERE "customerId" = c."id" AND "deletedAt" IS NULL AND "status" <> 'CANCELLED' AND "createdAt" < ${end}),0)) AS billed,
        COALESCE((SELECT SUM("amount") FROM "Payment" WHERE "customerId" = c."id" AND "deletedAt" IS NULL AND "paidAt" < ${end}),0)
         + COALESCE((SELECT SUM(COALESCE("codCollected",0)) FROM "Order" WHERE "customerId" = c."id" AND "deletedAt" IS NULL AND "codCollectedAt" < ${end}
             AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = "Order"."id" AND p."deletedAt" IS NULL)),0) AS paid
      FROM "Customer" c WHERE c."id" = ANY(${ids})`,
  ]);
  const list = customers.map((c) => {
    const r = rows.find((x) => x.id === c.id)!;
    const f = finance.find((x) => x.id === c.id);
    const billed = n(f?.billed);
    return {
      id: c.id,
      name: c.name,
      companyName: c.companyName,
      phone: c.phone,
      spend: r3(n(r.spend)),
      orders: Number(r.orders),
      activeDays90: Number(activity.find((x) => x.id === c.id)?.days ?? 0),
      maintenance: Number(r.maintenance),
      paymentRate: billed > 0 ? r1(Math.min(100, (n(f?.paid) / billed) * 100)) : null,
      lastLoginAt: c.lastLoginAt,
      score: 0,
    };
  });
  const max = { spend: Math.max(...list.map((x) => x.spend)), orders: Math.max(...list.map((x) => x.orders)), days: Math.max(...list.map((x) => x.activeDays90)), maint: Math.max(...list.map((x) => x.maintenance)) };
  for (const x of list) {
    const recentLogin = x.lastLoginAt && x.lastLoginAt >= start ? 1 : 0;
    x.score = Math.round(
      40 * ratio(x.spend, max.spend) +
        15 * ratio(x.orders, max.orders) +
        15 * ratio(x.activeDays90, max.days) +
        10 * ratio(x.maintenance, max.maint) +
        15 * ((x.paymentRate ?? 50) / 100) +
        5 * recentLogin,
    );
  }
  return list.sort((a, b) => b.score - a.score || b.spend - a.spend).slice(0, limit);
}
