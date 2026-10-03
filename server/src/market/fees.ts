import { Prisma } from '@prisma/client';
import { applyDiscount, round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/settings.service';

type Db = Prisma.TransactionClient | typeof prisma;
type Num = number | string | Prisma.Decimal | null | undefined;

/** أعلى نسبة فرجار مسموحة على منتج */
export const FEE_MAX = 50;

const clampFee = (n: number) => Math.min(Math.max(round3(n * 100) / 100, 0), FEE_MAX);

/**
 * تسعير المنتج من سعر المورد ونسبة فرجار — يُحسب في الخادم فقط.
 * سعر العميل = سعر المورد × (1 + النسبة). الخصم يُطبّق على الطرفين بنفس النسبة.
 */
export function productPricing(supplierPrice: Num, feePercent: Num, discountPercent = 0) {
  const sp = round3(Math.max(toNum(supplierPrice), 0));
  const fee = clampFee(toNum(feePercent));
  const price = round3(sp * (1 + fee / 100));
  const finalPrice = applyDiscount(price, discountPercent);
  const supplierFinal = applyDiscount(sp, discountPercent);
  return { supplierPrice: sp, feePercent: fee, feeAmount: round3(price - sp), price, finalPrice, supplierFinal, feeFinal: round3(finalPrice - supplierFinal) };
}

/** حقول Prisma للسعر بعد أي تغيير على سعر المورد أو النسبة أو الخصم */
export function pricingData(supplierPrice: Num, feePercent: Num, discountPercent = 0) {
  const r = productPricing(supplierPrice, feePercent, discountPercent);
  return {
    supplierPrice: new Prisma.Decimal(r.supplierPrice),
    platformFeePercent: new Prisma.Decimal(r.feePercent),
    price: new Prisma.Decimal(r.price),
    finalPrice: new Prisma.Decimal(r.finalPrice),
  };
}

/**
 * نسبة فرجار لمنتج جديد حسب الأولوية: المورد ← القسم (ثم القسم الرئيسي) ← الافتراضي العام.
 * منتجات فرجار نفسها (المورد الافتراضي) بلا نسبة. نقطة التوسعة لاحقًا: عروض، شرائح كمية، نوع العميل…
 */
export async function resolveFeePercent(db: Db, opts: { vendorId: string; categoryId: string }) {
  const vendor = await db.vendor.findUnique({ where: { id: opts.vendorId }, select: { isHouse: true, platformFeePercent: true } });
  if (vendor?.isHouse) return 0;
  if (vendor?.platformFeePercent != null) return clampFee(toNum(vendor.platformFeePercent));
  const cat = opts.categoryId
    ? await db.category.findUnique({
        where: { id: opts.categoryId },
        select: { platformFeePercent: true, parent: { select: { platformFeePercent: true } } },
      })
    : null;
  const catFee = cat?.platformFeePercent ?? cat?.parent?.platformFeePercent;
  if (catFee != null) return clampFee(toNum(catFee));
  return clampFee((await getSettings()).platformFeeDefault);
}

/**
 * بند طلب: المبالغ تُثبَّت من بيانات المنتج وقت البيع.
 * مستحق المورد = سعر المورد بعد الخصم × الكمية، ومبلغ فرجار = إجمالي البند − مستحق المورد.
 * منتجات فرجار نفسها: الإيراد كامل البند (كما في النظام السابق) ونسبة فرجار صفر.
 */
export function lineSplit(
  p: { supplierPrice: Num; platformFeePercent: Num; discountPercent: number; finalPrice: Num },
  quantity: number,
  isHouse: boolean,
) {
  const unitFinal = toNum(p.finalPrice);
  const lineTotal = round3(unitFinal * quantity);
  if (isHouse) {
    return { lineTotal, supplierUnitPrice: unitFinal, feePercent: 0, feeAmount: 0, commissionPercent: 100, commission: lineTotal, vendorNet: 0 };
  }
  const feePercent = clampFee(toNum(p.platformFeePercent));
  // سعر المورد محفوظ؛ لو كان صفرًا (بيانات قديمة) يُستخرج من سعر العميل
  const sp = toNum(p.supplierPrice) > 0 ? toNum(p.supplierPrice) : toNum(p.finalPrice) / (1 + feePercent / 100);
  const supplierUnitPrice = toNum(p.supplierPrice) > 0 ? applyDiscount(sp, p.discountPercent) : round3(sp);
  const vendorNet = Math.min(round3(supplierUnitPrice * quantity), lineTotal);
  const feeAmount = round3(lineTotal - vendorNet);
  return { lineTotal, supplierUnitPrice, feePercent, feeAmount, commissionPercent: feePercent, commission: feeAmount, vendorNet };
}
