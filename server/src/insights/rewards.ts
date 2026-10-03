import { Prisma, type RewardType } from '@prisma/client';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { activateSubscription } from '../market/payments';
import { marketNotify } from '../market/notify';
import { normalizeCode } from './coupons';

type Db = Prisma.TransactionClient;

export const SUPPLIER_REWARDS: RewardType[] = ['FREE_SUBSCRIPTION', 'FEATURED_PLACEMENT', 'HOME_BANNER', 'EXTRA_PRODUCTS', 'SUBSCRIPTION_DISCOUNT', 'BADGE', 'POINTS'];
export const CUSTOMER_REWARDS: RewardType[] = ['COUPON', 'POINTS'];

export const REWARD_LABEL: Record<RewardType, string> = {
  FREE_SUBSCRIPTION: 'اشتراك مجاني',
  FEATURED_PLACEMENT: 'ظهور مميز',
  HOME_BANNER: 'Banner مجاني (مورد الشهر)',
  EXTRA_PRODUCTS: 'منتجات إضافية',
  SUBSCRIPTION_DISCOUNT: 'خصم على الاشتراك',
  BADGE: 'شارة تميز',
  COUPON: 'كوبون خصم',
  POINTS: 'نقاط ولاء',
};

export const couponInput = z.object({
  code: z.string().trim().min(3, 'الكود 3 أحرف على الأقل').max(30).regex(/^[A-Za-z0-9_-]+$/, 'أحرف إنجليزية وأرقام فقط').transform(normalizeCode),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  type: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  value: z.coerce.number().positive('قيمة الخصم أكبر من صفر').max(100_000),
  maxDiscount: z.coerce.number().positive().max(100_000).optional().nullable(),
  minOrder: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  usageLimit: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
  perCustomerLimit: z.coerce.number().int().min(1).max(1000).default(1),
  customerId: z.string().optional().nullable(),
  categoryIds: z.array(z.string()).max(50).default([]),
  productIds: z.array(z.string()).max(200).default([]),
  active: z.boolean().default(true),
});

export function checkCoupon(c: { type: string; value: number; startsAt?: Date | null; endsAt?: Date | null }) {
  if (c.type === 'PERCENT' && c.value > 100) throw badRequest('النسبة لا تتجاوز 100%', { fields: { value: 'النسبة لا تتجاوز 100%' } });
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) throw badRequest('تاريخ الانتهاء بعد تاريخ البداية', { fields: { endsAt: 'بعد تاريخ البداية' } });
}

export const rewardInput = z.object({
  type: z.enum(['FREE_SUBSCRIPTION', 'FEATURED_PLACEMENT', 'HOME_BANNER', 'EXTRA_PRODUCTS', 'SUBSCRIPTION_DISCOUNT', 'BADGE', 'COUPON', 'POINTS']),
  title: z.string().trim().max(80).optional().nullable(),
  planId: z.string().optional().nullable(),
  durationDays: z.coerce.number().int().min(1).max(730).optional().nullable(),
  value: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  coupon: couponInput.partial({ name: true, code: true }).optional().nullable(),
});
export type RewardInput = z.infer<typeof rewardInput>;

const days = (d: number) => d * 86400_000;

/**
 * منح مكافأة (بقرار الـ Super Admin فقط) وتطبيق أثرها فورًا:
 * اشتراك مجاني، إعلان مجاني، شارة، منتجات إضافية، خصم اشتراك، كوبون، أو نقاط — مع إشعار المستفيد.
 */
export async function grantReward(
  tx: Db,
  target: { vendorId?: string | null; customerId?: string | null },
  input: RewardInput,
  ctx: { recognitionId?: string | null; adminId: string; periodLabel?: string },
) {
  const vendorId = target.vendorId ?? null;
  const customerId = target.customerId ?? null;
  if (!vendorId === !customerId) throw badRequest('حدد موردًا أو عميلًا');
  if (vendorId && !SUPPLIER_REWARDS.includes(input.type)) throw badRequest('هذه المكافأة للعملاء فقط');
  if (customerId && !CUSTOMER_REWARDS.includes(input.type)) throw badRequest('هذه المكافأة للموردين فقط');
  const now = new Date();
  const duration = input.durationDays ?? 30;
  let endsAt: Date | null = new Date(now.getTime() + days(duration));
  let title = input.title?.trim() || REWARD_LABEL[input.type];
  const extra: { couponId?: string; adId?: string; subscriptionId?: string; planId?: string | null; value?: Prisma.Decimal | null } = {};
  let message = '';

  const vendor = vendorId ? await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, isHouse: true } }) : null;
  if (vendorId && !vendor) throw notFound('المورد غير موجود');
  if (vendor?.isHouse) throw badRequest('لا تُمنح مكافآت لمتجر FARJAR');
  const customer = customerId ? await tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true, name: true } }) : null;
  if (customerId && !customer) throw notFound('العميل غير موجود');

  switch (input.type) {
    case 'FREE_SUBSCRIPTION': {
      const plan = input.planId ? await tx.supplierPlan.findUnique({ where: { id: input.planId } }) : null;
      if (!plan) throw badRequest('اختر الباقة المجانية', { fields: { planId: 'اختر الباقة' } });
      const sub = await tx.vendorSubscription.create({ data: { vendorId: vendorId!, planId: plan.id, amount: new Prisma.Decimal(0), note: `مكافأة${ctx.periodLabel ? ` — ${ctx.periodLabel}` : ''}` } });
      const active = await activateSubscription(tx, sub.id);
      // مدة المكافأة كما حددها الـ Super Admin (بدل مدة الباقة الافتراضية)
      const startsAt = active.startsAt ?? now;
      endsAt = new Date(startsAt.getTime() + days(duration));
      await tx.vendorSubscription.update({ where: { id: sub.id }, data: { endsAt } });
      await tx.vendor.update({ where: { id: vendorId! }, data: { planExpiresAt: endsAt } });
      extra.subscriptionId = sub.id;
      extra.planId = plan.id;
      title = input.title?.trim() || `اشتراك ${plan.name} مجاني ${duration} يومًا`;
      message = `حصلت على اشتراك ${plan.name} مجاني لمدة ${duration} يومًا.`;
      break;
    }
    case 'FEATURED_PLACEMENT':
    case 'HOME_BANNER': {
      const ad = await tx.marketAd.create({
        data: {
          type: input.type === 'HOME_BANNER' ? 'SUPPLIER_OF_MONTH' : 'FEATURED_SUPPLIER',
          placement: 'MARKET_HOME',
          vendorId: vendorId!,
          title: input.title?.trim() || null,
          price: new Prisma.Decimal(0),
          startsAt: now,
          endsAt: endsAt!,
          status: 'ACTIVE',
          note: 'مكافأة التميز',
        },
      });
      extra.adId = ad.id;
      message = input.type === 'HOME_BANNER' ? `تظهر شركتك كـ"مورد الشهر" في الصفحة الرئيسية للسوق لمدة ${duration} يومًا.` : `تظهر شركتك ضمن الموردين المميزين لمدة ${duration} يومًا.`;
      break;
    }
    case 'EXTRA_PRODUCTS': {
      const count = Math.round(input.value ?? 0);
      if (count < 1) throw badRequest('حدد عدد المنتجات الإضافية', { fields: { value: 'عدد المنتجات' } });
      await tx.vendor.update({ where: { id: vendorId! }, data: { extraProducts: count, extraProductsUntil: endsAt } });
      extra.value = new Prisma.Decimal(count);
      title = input.title?.trim() || `${count} منتج إضافي`;
      message = `يمكنك إضافة ${count} منتج إضافي فوق حد باقتك لمدة ${duration} يومًا.`;
      break;
    }
    case 'SUBSCRIPTION_DISCOUNT': {
      const pct = Math.round(input.value ?? 0);
      if (pct < 1 || pct > 100) throw badRequest('نسبة الخصم بين 1 و 100', { fields: { value: 'نسبة الخصم' } });
      await tx.vendor.update({ where: { id: vendorId! }, data: { subscriptionDiscountPct: pct, subscriptionDiscountUntil: endsAt } });
      extra.value = new Prisma.Decimal(pct);
      title = input.title?.trim() || `خصم ${pct}% على الاشتراك`;
      message = `خصم ${pct}% على اشتراكك أو ترقيتك القادمة خلال ${duration} يومًا.`;
      break;
    }
    case 'BADGE': {
      const badge = input.title?.trim() || 'مورد الشهر';
      await tx.vendor.update({ where: { id: vendorId! }, data: { awardTitle: badge, awardUntil: endsAt } });
      title = badge;
      message = `تظهر شارة "${badge}" بجانب اسم شركتك في السوق لمدة ${duration} يومًا.`;
      break;
    }
    case 'COUPON': {
      const c: Partial<NonNullable<RewardInput['coupon']>> = input.coupon ?? {};
      const type = c.type ?? 'PERCENT';
      const value = c.value ?? input.value ?? 10;
      const startsAt = c.startsAt ?? now;
      endsAt = c.endsAt ?? new Date(startsAt.getTime() + days(duration));
      checkCoupon({ type, value, startsAt, endsAt });
      const code = c.code ? normalizeCode(c.code) : `VIP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      if (await tx.coupon.findUnique({ where: { code } })) throw badRequest('كود الكوبون مستخدم، اختر كودًا آخر', { fields: { code: 'الكود مستخدم' } });
      const coupon = await tx.coupon.create({
        data: {
          code,
          name: c.name ?? 'VIP Customer Coupon',
          description: c.description ?? null,
          type,
          value: new Prisma.Decimal(value),
          maxDiscount: c.maxDiscount != null ? new Prisma.Decimal(c.maxDiscount) : null,
          minOrder: c.minOrder != null ? new Prisma.Decimal(c.minOrder) : null,
          startsAt,
          endsAt,
          usageLimit: c.usageLimit ?? 1,
          perCustomerLimit: c.perCustomerLimit ?? c.usageLimit ?? 1,
          customerId: customerId!,
          categoryIds: c.categoryIds ?? [],
          productIds: c.productIds ?? [],
          createdById: ctx.adminId,
        },
      });
      extra.couponId = coupon.id;
      extra.value = new Prisma.Decimal(value);
      const label = type === 'PERCENT' ? `${value}%` : `${value} د.أ`;
      title = input.title?.trim() || `كوبون خصم ${label}`;
      message = `كود الخصم ${code}: خصم ${label}${c.maxDiscount ? ` (بحد أقصى ${c.maxDiscount} د.أ)` : ''} على طلبك القادم من المتجر، صالح حتى ${endsAt.toISOString().slice(0, 10)}.`;
      break;
    }
    case 'POINTS': {
      const points = Math.round(input.value ?? 0);
      if (points < 1) throw badRequest('حدد عدد النقاط', { fields: { value: 'عدد النقاط' } });
      await tx.loyaltyPointsLedger.create({ data: { vendorId, customerId, points, reason: title, refType: 'reward' } });
      if (vendorId) await tx.vendor.update({ where: { id: vendorId }, data: { loyaltyPoints: { increment: points } } });
      if (customerId) await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } });
      extra.value = new Prisma.Decimal(points);
      endsAt = null;
      title = input.title?.trim() || `${points} نقطة ولاء`;
      message = `أُضيفت ${points} نقطة ولاء إلى حسابك.`;
      break;
    }
  }

  const reward = await tx.reward.create({
    data: {
      recognitionId: ctx.recognitionId ?? null,
      vendorId,
      customerId,
      type: input.type,
      title,
      durationDays: input.type === 'POINTS' ? null : duration,
      startsAt: now,
      endsAt,
      note: input.note ?? null,
      createdById: ctx.adminId,
      planId: extra.planId ?? null,
      value: extra.value ?? (input.value != null ? new Prisma.Decimal(input.value) : null),
      couponId: extra.couponId ?? null,
      adId: extra.adId ?? null,
      subscriptionId: extra.subscriptionId ?? null,
    },
  });
  await marketNotify(tx, vendorId ? { vendorIds: [vendorId] } : { customerIds: [customerId!] }, {
    title: `🎉 مكافأة من FARJAR: ${title}`,
    body: message,
    link: vendorId ? '/vendor' : '/account?tab=rewards',
    cta: 'عرض المكافأة',
  });
  return reward;
}

/** إلغاء مكافأة وإزالة أثرها (الإعلان ينتهي، الشارة تختفي، الكوبون يتعطل…) — يبقى سجلها في الأرشيف */
export async function revokeReward(tx: Db, id: string) {
  const r = await tx.reward.findUnique({ where: { id } });
  if (!r) throw notFound('المكافأة غير موجودة');
  if (r.status === 'REVOKED') return r;
  const now = new Date();
  if (r.adId) await tx.marketAd.updateMany({ where: { id: r.adId, status: 'ACTIVE' }, data: { status: 'ENDED', endsAt: now } });
  if (r.couponId) await tx.coupon.update({ where: { id: r.couponId }, data: { active: false } });
  if (r.subscriptionId && r.vendorId) {
    await tx.vendorSubscription.update({ where: { id: r.subscriptionId }, data: { status: 'CANCELLED', endsAt: now } });
    const v = await tx.vendor.findUniqueOrThrow({ where: { id: r.vendorId }, select: { planExpiresAt: true } });
    if (v.planExpiresAt && r.endsAt && v.planExpiresAt.getTime() === r.endsAt.getTime()) await tx.vendor.update({ where: { id: r.vendorId }, data: { planExpiresAt: now } });
  }
  if (r.vendorId && r.type === 'BADGE') await tx.vendor.update({ where: { id: r.vendorId }, data: { awardUntil: now } });
  if (r.vendorId && r.type === 'EXTRA_PRODUCTS') await tx.vendor.update({ where: { id: r.vendorId }, data: { extraProducts: 0, extraProductsUntil: null } });
  if (r.vendorId && r.type === 'SUBSCRIPTION_DISCOUNT') await tx.vendor.update({ where: { id: r.vendorId }, data: { subscriptionDiscountPct: 0, subscriptionDiscountUntil: null } });
  return tx.reward.update({ where: { id }, data: { status: 'REVOKED', revokedAt: now } });
}

/** المكافآت التي انتهت مدتها تصبح "منتهية" في السجل (من المهام الدورية) */
export async function expireRewards() {
  const r = await prisma.reward.updateMany({ where: { status: 'ACTIVE', endsAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  return r.count;
}

/** مزايا المكافآت الفعّالة على المورد (تُستخدم في حد المنتجات وسعر الاشتراك) */
export function activePerks(v: { extraProducts: number; extraProductsUntil: Date | null; subscriptionDiscountPct: number; subscriptionDiscountUntil: Date | null }, now = new Date()) {
  return {
    extraProducts: v.extraProductsUntil && v.extraProductsUntil > now ? v.extraProducts : 0,
    subscriptionDiscountPct: v.subscriptionDiscountUntil && v.subscriptionDiscountUntil > now ? v.subscriptionDiscountPct : 0,
  };
}
