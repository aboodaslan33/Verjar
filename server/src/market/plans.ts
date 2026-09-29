import type { Prisma, SupplierPlan } from '@prisma/client';
import { HttpError } from '../lib/http';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export type PlanFeatures = {
  analytics: boolean;
  advancedReports: boolean;
  catalog: boolean;
  specialOffers: boolean;
  featuredBadge: boolean;
  campaigns: boolean;
};

export const FEATURE_KEYS: (keyof PlanFeatures)[] = ['analytics', 'advancedReports', 'catalog', 'specialOffers', 'featuredBadge', 'campaigns'];

export function planFeatures(plan: Pick<SupplierPlan, 'features'> | null | undefined): PlanFeatures {
  const f = (plan?.features ?? {}) as Partial<Record<keyof PlanFeatures, unknown>>;
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, f[k] === true])) as PlanFeatures;
}

/** الباقة الافتراضية (المجانية) — أول باقة isDefault فعّالة */
export async function defaultPlan(db: Db = prisma) {
  return (
    (await db.supplierPlan.findFirst({ where: { isDefault: true, active: true }, orderBy: { sortOrder: 'asc' } })) ??
    (await db.supplierPlan.findFirst({ where: { active: true }, orderBy: [{ price: 'asc' }, { sortOrder: 'asc' }] }))
  );
}

/**
 * الباقة الفعلية للمورد الآن: باقته إن لم تنتهِ، وإلا الباقة المجانية.
 * (الانتهاء لا يحذف منتجات المورد، لكنه يطبق حدود المجانية على الإضافات الجديدة.)
 */
export async function effectivePlan(vendor: { planId: string | null; planExpiresAt: Date | null; isHouse?: boolean }, db: Db = prisma) {
  if (vendor.planId && (!vendor.planExpiresAt || vendor.planExpiresAt > new Date() || vendor.isHouse)) {
    const p = await db.supplierPlan.findUnique({ where: { id: vendor.planId } });
    if (p) return p;
  }
  return defaultPlan(db);
}

/** حد المنتجات حسب الباقة */
export async function assertProductQuota(vendorId: string, db: Db = prisma) {
  const v = await db.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { planId: true, planExpiresAt: true, isHouse: true } });
  if (v.isHouse) return;
  const plan = await effectivePlan(v, db);
  if (plan?.maxProducts == null) return;
  const count = await db.product.count({ where: { vendorId, deletedAt: null } });
  if (count >= plan.maxProducts) {
    throw new HttpError(403, `وصلت للحد الأقصى من المنتجات في باقة ${plan.name} (${plan.maxProducts}). رقِّ باقتك لإضافة المزيد.`, 'PLAN_LIMIT');
  }
}

/** عدد طلبات عروض الأسعار المستلمة هذا الشهر مقابل حد الباقة */
export async function rfqQuotaLeft(vendor: { id: string; planId: string | null; planExpiresAt: Date | null; isHouse?: boolean }, db: Db = prisma) {
  const plan = await effectivePlan(vendor, db);
  if (vendor.isHouse || plan?.maxRfqPerMonth == null) return Infinity;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const used = await db.rfqRecipient.count({ where: { vendorId: vendor.id, sentAt: { gte: start } } });
  return Math.max(0, plan.maxRfqPerMonth - used);
}

/** عدد المستخدمين المسموح بهم في حساب المورد */
export async function assertMemberQuota(vendorId: string, db: Db = prisma) {
  const v = await db.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { planId: true, planExpiresAt: true, isHouse: true } });
  const plan = await effectivePlan(v, db);
  const count = await db.vendorMember.count({ where: { vendorId } });
  const max = plan?.maxUsers ?? 1;
  if (count >= max) throw new HttpError(403, `باقتك تسمح بـ ${max} مستخدم. رقِّ الباقة لإضافة المزيد.`, 'PLAN_LIMIT');
}
