import type { Coupon, Prisma } from '@prisma/client';
import { badRequest } from '../lib/http';
import { round3, toNum } from '../lib/money';

type Db = Prisma.TransactionClient;

/** سطر من السلة لتقييم الكوبون: المنتج وفئته (والفئة الأم) وقيمة السطر بعد خصم المنتج */
export type CouponLine = { productId: string; categoryId: string; parentCategoryId: string | null; lineTotal: number };

export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

/**
 * يتحقق من صلاحية الكوبون للعميل والسلة ويحسب الخصم.
 * - الخصم على المنتجات/الفئات المشمولة فقط (أو كل السلة إن لم تُحدَّد)، والنسبة مقيّدة بالحد الأقصى.
 * - الكوبون الخاص بعميل لا يعمل لغيره، ويُحترم حد الاستخدام الكلي ولكل عميل.
 */
export async function evaluateCoupon(db: Db, rawCode: string, customerId: string, lines: CouponLine[]): Promise<{ coupon: Coupon; discount: number; eligible: number }> {
  const code = normalizeCode(rawCode);
  const coupon = await db.coupon.findUnique({ where: { code } });
  const fail = (msg: string) => badRequest(msg, { fields: { couponCode: msg } });
  if (!coupon || !coupon.active) throw fail('كود الخصم غير صحيح');
  const now = new Date();
  if (coupon.startsAt > now) throw fail('كود الخصم لم يبدأ بعد');
  if (coupon.endsAt && coupon.endsAt < now) throw fail('انتهت صلاحية كود الخصم');
  if (coupon.customerId && coupon.customerId !== customerId) throw fail('كود الخصم غير مخصص لحسابك');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw fail('استُخدم كود الخصم بالكامل');
  const mine = await db.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
  if (mine >= coupon.perCustomerLimit) throw fail('استخدمت كود الخصم من قبل');

  const scoped = coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
  const eligible = round3(
    lines
      .filter((l) => !scoped || coupon.productIds.includes(l.productId) || coupon.categoryIds.includes(l.categoryId) || (l.parentCategoryId != null && coupon.categoryIds.includes(l.parentCategoryId)))
      .reduce((n, l) => n + l.lineTotal, 0),
  );
  if (eligible <= 0) throw fail('كود الخصم لا يشمل المنتجات في سلتك');
  if (coupon.minOrder != null && eligible < toNum(coupon.minOrder)) throw fail(`الحد الأدنى لاستخدام الكود ${toNum(coupon.minOrder)} د.أ`);

  let discount = coupon.type === 'PERCENT' ? (eligible * toNum(coupon.value)) / 100 : toNum(coupon.value);
  if (coupon.maxDiscount != null) discount = Math.min(discount, toNum(coupon.maxDiscount));
  discount = round3(Math.min(discount, eligible));
  return { coupon, discount, eligible };
}

/** تسجيل استخدام الكوبون ضمن معاملة الطلب (مع حماية حد الاستخدام من الطلبات المتزامنة) */
export async function redeemCoupon(db: Db, coupon: Coupon, orderId: string, customerId: string, discount: number) {
  const updated = await db.coupon.updateMany({
    where: { id: coupon.id, ...(coupon.usageLimit != null ? { usedCount: { lt: coupon.usageLimit } } : {}) },
    data: { usedCount: { increment: 1 } },
  });
  if (updated.count === 0) throw badRequest('استُخدم كود الخصم بالكامل', { fields: { couponCode: 'استُخدم كود الخصم بالكامل' } });
  await db.couponRedemption.create({ data: { couponId: coupon.id, orderId, customerId, discount } });
}
