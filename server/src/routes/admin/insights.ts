import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { toNum } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/auth';
import { customerCandidates, supplierCandidates } from '../../insights/candidates';
import { normalizeCode } from '../../insights/coupons';
import {
  comparePeriods,
  computeRange,
  currentPeriod,
  getPeriod,
  getSeries,
  growth,
  parsePeriod,
  periodKey,
  shiftPeriod,
  type Metrics,
} from '../../insights/metrics';
import { checkCoupon, couponInput, grantReward, REWARD_LABEL, revokeReward, rewardInput } from '../../insights/rewards';

/**
 * إحصائيات المنصة والتميز والمكافآت — للـ Super Admin فقط (صلاحيتا insights.view و rewards.manage لا تُمنحان لغيره).
 * النظام يقترح الموردين/العملاء المتميزين من البيانات، والاختيار ومنح المكافأة قرار يدوي.
 */
export const insightsRouter = Router();
const manage = requirePermission('rewards.manage');

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const periodLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_AR[m - 1]} ${y}`;
};

// ═════════ الإحصائيات ═════════

/** لوحة المنصة: الإجمالي منذ البداية، الشهر الحالي، النمو مقابل الشهر السابق، التميز والمكافآت */
insightsRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const cur = currentPeriod();
    const prev = shiftPeriod(cur, -1);
    const [lifetime, thisMonth, lastMonth, recognitions, rewards, maintenanceTotal] = await Promise.all([
      computeRange(new Date('2000-01-01T00:00:00Z'), new Date()),
      getPeriod(cur),
      getPeriod(prev),
      prisma.recognition.findMany({
        where: { period: { in: [periodKey(cur), periodKey(prev)] }, revokedAt: null },
        include: { vendor: { select: { id: true, name: true, slug: true, logoUrl: true } }, customer: { select: { id: true, name: true, companyName: true } }, rewards: { select: { id: true, type: true, title: true, status: true, endsAt: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.reward.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { vendor: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } }, coupon: { select: { code: true, usedCount: true, usageLimit: true } } },
      }),
      prisma.vendor.count({
        where: {
          status: 'APPROVED',
          active: true,
          isHouse: false,
          OR: [{ businessField: { contains: 'صيان' } }, { businessField: { contains: 'maint', mode: 'insensitive' } }],
        },
      }),
    ]);
    ok(res, {
      period: periodKey(cur),
      previous: periodKey(prev),
      platform: {
        totalSales: lifetime.metrics.totalSales,
        totalOrders: lifetime.metrics.totalOrders,
        totalCustomers: thisMonth.metrics.totalCustomers,
        totalSuppliers: thisMonth.metrics.totalSuppliers,
        totalMaintenanceCompanies: maintenanceTotal,
        totalRevenue: lifetime.metrics.farjarRevenue,
      },
      thisMonth: thisMonth.metrics,
      lastMonth: lastMonth.metrics,
      growth: growth(lastMonth.metrics, thisMonth.metrics),
      recognitions,
      rewards,
    });
  }),
);

/** إحصائيات شهر محدد + مقارنته بالشهر السابق */
insightsRouter.get(
  '/period',
  asyncHandler(async (req, res) => {
    const q = z.object({ period: z.string().optional(), refresh: z.enum(['1']).optional() }).parse(req.query);
    const p = parsePeriod(q.period);
    const [data, prev] = await Promise.all([getPeriod(p, { refresh: Boolean(q.refresh) }), getPeriod(shiftPeriod(p, -1))]);
    ok(res, { ...data, label: periodLabel(data.period), previous: { period: prev.period, label: periodLabel(prev.period), metrics: prev.metrics }, growth: growth(prev.metrics, data.metrics) });
  }),
);

/** مقارنة أي شهرين (مثل يناير مقابل فبراير، أو نفس الشهر بين سنتين) */
insightsRouter.get(
  '/compare',
  asyncHandler(async (req, res) => {
    const q = z.object({ a: z.string(), b: z.string() }).parse(req.query);
    const pa = parsePeriod(q.a);
    const pb = parsePeriod(q.b);
    const [a, b] = await Promise.all([getPeriod(pa), getPeriod(pb)]);
    ok(res, { a: { ...a, label: periodLabel(a.period) }, b: { ...b, label: periodLabel(b.period) }, growth: growth(a.metrics, b.metrics) });
  }),
);

/** سلسلة شهرية للرسوم البيانية + أفضل الأشهر وتجميع الفئات والمنتجات والمناطق عبر الفترة */
insightsRouter.get(
  '/series',
  asyncHandler(async (req, res) => {
    const q = z.object({ end: z.string().optional(), months: z.coerce.number().int().min(2).max(36).default(12) }).parse(req.query);
    const end = parsePeriod(q.end);
    const series = await getSeries(end, q.months);
    const sum = <T extends { name?: string; region?: string; id?: string }>(pick: (b: (typeof series)[number]['breakdown']) => T[], key: (x: T) => string, val: (x: T) => number) => {
      const m = new Map<string, { label: string; value: number }>();
      for (const s of series) for (const x of pick(s.breakdown)) {
        const k = key(x);
        const cur = m.get(k) ?? { label: x.name ?? x.region ?? k, value: 0 };
        cur.value += val(x);
        m.set(k, cur);
      }
      return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 8);
    };
    const best = (k: keyof Metrics) => series.reduce((a, b) => (b.metrics[k] > a.metrics[k] ? b : a), series[0]);
    ok(res, {
      points: series.map((s) => ({ period: s.period, label: periodLabel(s.period), final: s.final, metrics: s.metrics, revenueBySection: s.breakdown.revenueBySection })),
      bestSalesMonth: { period: best('totalSales').period, label: periodLabel(best('totalSales').period), value: best('totalSales').metrics.totalSales },
      bestOrdersMonth: { period: best('totalOrders').period, label: periodLabel(best('totalOrders').period), value: best('totalOrders').metrics.totalOrders },
      categories: sum((b) => b.topCategories, (x) => x.id, (x) => x.sales),
      products: sum((b) => b.topProducts, (x) => x.id, (x) => x.quantity),
      regions: sum((b) => b.topRegions, (x) => x.region, (x) => x.orders),
      suppliers: sum((b) => b.topSuppliers, (x) => x.id, (x) => x.sales),
      customers: sum((b) => b.topCustomers, (x) => x.id, (x) => x.spend),
    });
  }),
);

// ═════════ التميز الشهري ═════════

const periodParam = z.object({ period: z.string().optional() });

/** المرشحون (اقتراح من البيانات) والتميز المختار للشهر */
insightsRouter.get(
  '/recognition',
  asyncHandler(async (req, res) => {
    const p = parsePeriod(periodParam.parse(req.query).period);
    const [suppliers, customers, chosen] = await Promise.all([
      supplierCandidates(p),
      customerCandidates(p),
      prisma.recognition.findMany({
        where: { period: periodKey(p) },
        include: {
          vendor: { select: { id: true, name: true, slug: true, logoUrl: true } },
          customer: { select: { id: true, name: true, companyName: true, phone: true } },
          rewards: { include: { coupon: { select: { code: true, usedCount: true, usageLimit: true, endsAt: true } } }, orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);
    ok(res, { period: periodKey(p), label: periodLabel(periodKey(p)), suppliers, customers, chosen });
  }),
);

/** بحث يدوي عن مورد/عميل لاختياره خارج قائمة الترشيح */
insightsRouter.get(
  '/targets',
  asyncHandler(async (req, res) => {
    const q = z.object({ kind: z.enum(['SUPPLIER', 'CUSTOMER']), q: z.string().trim().min(1).max(60) }).parse(req.query);
    if (q.kind === 'SUPPLIER') {
      ok(res, await prisma.vendor.findMany({ where: { isHouse: false, status: 'APPROVED', name: { contains: q.q, mode: 'insensitive' } }, take: 10, select: { id: true, name: true, city: true } }));
    } else {
      ok(
        res,
        await prisma.customer.findMany({
          where: { deletedAt: null, OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q.replace(/^0/, '') } }, { companyName: { contains: q.q, mode: 'insensitive' } }] },
          take: 10,
          select: { id: true, name: true, phone: true, companyName: true },
        }),
      );
    }
  }),
);

/** اختيار مورد/عميل الشهر (يدويًا) مع المكافآت المختارة — كلها في خطوة واحدة */
insightsRouter.post(
  '/recognition',
  manage,
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        kind: z.enum(['SUPPLIER', 'CUSTOMER']),
        period: z.string(),
        vendorId: z.string().optional().nullable(),
        customerId: z.string().optional().nullable(),
        title: z.string().trim().max(80).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
        score: z.record(z.unknown()).optional().nullable(),
        rewards: z.array(rewardInput).max(8).default([]),
      })
      .parse(req.body);
    const p = parsePeriod(input.period);
    if (comparePeriods(p, currentPeriod()) > 0) throw badRequest('لا يمكن اختيار التميز لشهر قادم');
    const key = periodKey(p);
    if (input.kind === 'SUPPLIER' && !input.vendorId) throw badRequest('اختر المورد');
    if (input.kind === 'CUSTOMER' && !input.customerId) throw badRequest('اختر العميل');
    const existing = await prisma.recognition.findUnique({ where: { kind_period: { kind: input.kind, period: key } } });
    if (existing && !existing.revokedAt) throw conflict(`تم اختيار ${input.kind === 'SUPPLIER' ? 'مورد' : 'عميل'} ${periodLabel(key)} مسبقًا. ألغِ الاختيار الحالي أولًا.`);
    const title = input.title?.trim() || (input.kind === 'SUPPLIER' ? 'مورد الشهر' : 'عميل الشهر');
    const out = await prisma.$transaction(async (tx) => {
      // سجل سابق ملغى لنفس الشهر يبقى في الأرشيف باسم مختلف المفتاح: نحدّثه بدل التكرار
      const data = {
        kind: input.kind,
        period: key,
        title,
        vendorId: input.kind === 'SUPPLIER' ? input.vendorId! : null,
        customerId: input.kind === 'CUSTOMER' ? input.customerId! : null,
        score: (input.score ?? undefined) as Prisma.InputJsonValue | undefined,
        note: input.note ?? null,
        createdById: req.auth!.sub,
        revokedAt: null,
      };
      const rec = existing ? await tx.recognition.update({ where: { id: existing.id }, data }) : await tx.recognition.create({ data });
      const granted = [];
      for (const r of input.rewards) {
        granted.push(await grantReward(tx, { vendorId: rec.vendorId, customerId: rec.customerId }, r, { recognitionId: rec.id, adminId: req.auth!.sub, periodLabel: periodLabel(key) }));
      }
      return { rec, granted };
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'recognition_create', entity: 'recognition', entityId: out.rec.id, meta: { kind: input.kind, period: key, rewards: out.granted.map((g) => g.type) } });
    ok(res, { ...out.rec, rewards: out.granted }, 201);
  }),
);

/** إلغاء اختيار التميز (يبقى في الأرشيف ملغى) — مع إلغاء مكافآته اختياريًا */
insightsRouter.post(
  '/recognition/:id/revoke',
  manage,
  asyncHandler(async (req, res) => {
    const { revokeRewards } = z.object({ revokeRewards: z.boolean().default(false) }).parse(req.body ?? {});
    const rec = await prisma.recognition.findUnique({ where: { id: req.params.id }, include: { rewards: { where: { status: 'ACTIVE' } } } });
    if (!rec) throw notFound('السجل غير موجود');
    await prisma.$transaction(async (tx) => {
      await tx.recognition.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
      if (revokeRewards) for (const r of rec.rewards) await revokeReward(tx, r.id);
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'recognition_revoke', entity: 'recognition', entityId: rec.id, meta: { revokeRewards } });
    ok(res, { revoked: true });
  }),
);

// ═════════ المكافآت ═════════

insightsRouter.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']).optional(), vendorId: z.string().optional(), customerId: z.string().optional() }).parse(req.query);
    ok(
      res,
      await prisma.reward.findMany({
        where: { ...(q.status ? { status: q.status } : {}), ...(q.vendorId ? { vendorId: q.vendorId } : {}), ...(q.customerId ? { customerId: q.customerId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          vendor: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          coupon: { select: { code: true, usedCount: true, usageLimit: true, endsAt: true, active: true } },
          recognition: { select: { period: true, title: true } },
        },
      }),
    );
  }),
);

/** مكافأة مستقلة (بدون تميز شهري) لمورد أو عميل */
insightsRouter.post(
  '/rewards',
  manage,
  asyncHandler(async (req, res) => {
    const input = z.object({ vendorId: z.string().optional().nullable(), customerId: z.string().optional().nullable(), reward: rewardInput }).parse(req.body);
    const r = await prisma.$transaction((tx) => grantReward(tx, { vendorId: input.vendorId, customerId: input.customerId }, input.reward, { adminId: req.auth!.sub }));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'reward_grant', entity: 'reward', entityId: r.id, meta: { type: r.type } });
    ok(res, r, 201);
  }),
);

insightsRouter.post(
  '/rewards/:id/revoke',
  manage,
  asyncHandler(async (req, res) => {
    const r = await prisma.$transaction((tx) => revokeReward(tx, req.params.id));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'reward_revoke', entity: 'reward', entityId: r.id });
    ok(res, r);
  }),
);

/** أرشيف التميز والمكافآت حسب الشهر */
insightsRouter.get(
  '/archive',
  asyncHandler(async (_req, res) => {
    const recs = await prisma.recognition.findMany({
      orderBy: [{ period: 'desc' }, { kind: 'asc' }],
      include: {
        vendor: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, companyName: true } },
        rewards: { select: { id: true, type: true, title: true, status: true, startsAt: true, endsAt: true, coupon: { select: { code: true, usedCount: true } } } },
      },
    });
    const byPeriod = new Map<string, typeof recs>();
    for (const r of recs) byPeriod.set(r.period, [...(byPeriod.get(r.period) ?? []), r]);
    ok(res, [...byPeriod.entries()].map(([period, items]) => ({ period, label: periodLabel(period), items })));
  }),
);

insightsRouter.get('/reward-types', (_req, res) => ok(res, REWARD_LABEL));

// ═════════ الكوبونات ═════════

insightsRouter.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await prisma.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: { customer: { select: { id: true, name: true, phone: true } }, _count: { select: { redemptions: true } }, redemptions: { select: { discount: true } } },
      }).then((rows) => rows.map(({ redemptions, ...c }) => ({ ...c, totalDiscount: redemptions.reduce((n, r) => n + toNum(r.discount), 0) }))),
    );
  }),
);

insightsRouter.post(
  '/coupons',
  manage,
  asyncHandler(async (req, res) => {
    const input = couponInput.parse(req.body);
    checkCoupon({ type: input.type, value: input.value, startsAt: input.startsAt, endsAt: input.endsAt });
    if (await prisma.coupon.findUnique({ where: { code: input.code } })) throw conflict('كود الكوبون مستخدم', { field: 'code' });
    const c = await prisma.coupon.create({
      data: {
        ...input,
        value: new Prisma.Decimal(input.value),
        maxDiscount: input.maxDiscount != null ? new Prisma.Decimal(input.maxDiscount) : null,
        minOrder: input.minOrder != null ? new Prisma.Decimal(input.minOrder) : null,
        startsAt: input.startsAt ?? new Date(),
        endsAt: input.endsAt ?? null,
        customerId: input.customerId || null,
        createdById: req.auth!.sub,
      },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'coupon_create', entity: 'coupon', entityId: c.id, meta: { code: c.code } });
    ok(res, c, 201);
  }),
);

insightsRouter.patch(
  '/coupons/:id',
  manage,
  asyncHandler(async (req, res) => {
    const input = couponInput.partial().parse(req.body);
    const cur = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!cur) throw notFound('الكوبون غير موجود');
    checkCoupon({ type: input.type ?? cur.type, value: input.value ?? toNum(cur.value), startsAt: input.startsAt ?? cur.startsAt, endsAt: input.endsAt === undefined ? cur.endsAt : input.endsAt });
    if (input.code && normalizeCode(input.code) !== cur.code && (await prisma.coupon.findUnique({ where: { code: normalizeCode(input.code) } }))) throw conflict('كود الكوبون مستخدم', { field: 'code' });
    const { value, maxDiscount, minOrder, startsAt, customerId, ...rest } = input;
    const data: Prisma.CouponUncheckedUpdateInput = { ...rest };
    if (value != null) data.value = new Prisma.Decimal(value);
    if (maxDiscount !== undefined) data.maxDiscount = maxDiscount != null ? new Prisma.Decimal(maxDiscount) : null;
    if (minOrder !== undefined) data.minOrder = minOrder != null ? new Prisma.Decimal(minOrder) : null;
    if (startsAt) data.startsAt = startsAt;
    if (customerId !== undefined) data.customerId = customerId || null;
    const c = await prisma.coupon.update({ where: { id: cur.id }, data });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'coupon_update', entity: 'coupon', entityId: c.id });
    ok(res, c);
  }),
);

// ═════════ مستويات الولاء (للمرحلة القادمة) ═════════

insightsRouter.get(
  '/loyalty',
  asyncHandler(async (_req, res) => {
    const [tiers, customers, vendors] = await Promise.all([
      prisma.loyaltyTier.findMany({ orderBy: [{ audience: 'asc' }, { rank: 'asc' }] }),
      prisma.customer.groupBy({ by: ['loyaltyTier'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.vendor.groupBy({ by: ['loyaltyTier'], where: { isHouse: false }, _count: { _all: true } }),
    ]);
    ok(res, {
      tiers,
      counts: {
        CUSTOMER: Object.fromEntries(customers.map((c) => [c.loyaltyTier, c._count._all])),
        SUPPLIER: Object.fromEntries(vendors.map((v) => [v.loyaltyTier, v._count._all])),
      },
    });
  }),
);

insightsRouter.patch(
  '/loyalty/:id',
  manage,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(40).optional(), minPoints: z.coerce.number().int().min(0).max(10_000_000).optional(), minSpend: z.coerce.number().min(0).max(100_000_000).nullable().optional(), benefits: z.record(z.unknown()).optional() })
      .parse(req.body);
    const { minSpend, benefits, ...rest } = input;
    const data: Prisma.LoyaltyTierUpdateInput = { ...rest };
    if (minSpend !== undefined) data.minSpend = minSpend != null ? new Prisma.Decimal(minSpend) : null;
    if (benefits) data.benefits = benefits as Prisma.InputJsonValue;
    const t = await prisma.loyaltyTier.update({ where: { id: req.params.id }, data });
    ok(res, t);
  }),
);
