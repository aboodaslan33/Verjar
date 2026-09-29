import type { CommissionRule, Prisma } from '@prisma/client';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export type DealType = 'PRODUCT_SALE' | 'RFQ_DEAL' | 'PROCUREMENT';

export type CommissionInput = { amount: number; categoryId?: string | null; planCode?: string | null; dealType?: DealType | null };
export type CommissionResult = { rule: CommissionRule | null; percent: number; amount: number; capped: boolean; floored: boolean };

/**
 * محرك العمولات: يختار القاعدة الأكثر تحديدًا من القواعد الفعّالة.
 * الأولوية: تطابق التصنيف (أو القسم الرئيسي) > مجموعة التصنيف > الباقة > نوع الصفقة، ثم حقل priority.
 * قاعدة فيها شرط لا يطابق تُستبعد؛ الحقول الفارغة تعني "الكل".
 * مثال: ماكينة 20,000 × 2% = 400، ومع حد أقصى 300 تصبح 300.
 */
export async function calcCommission(input: CommissionInput, db: Db = prisma): Promise<CommissionResult> {
  const amount = Math.max(0, input.amount);
  let categoryIds: string[] = [];
  let group: string | null = null;
  if (input.categoryId) {
    const cat = await db.category.findUnique({ where: { id: input.categoryId }, include: { parent: true } });
    if (cat) {
      categoryIds = [cat.id, ...(cat.parentId ? [cat.parentId] : [])];
      group = cat.commissionGroup ?? cat.parent?.commissionGroup ?? null;
    }
  }
  const rules = await db.commissionRule.findMany({ where: { active: true } });
  const score = (r: CommissionRule) => {
    if (r.categoryId && !categoryIds.includes(r.categoryId)) return -1;
    if (r.commissionGroup && r.commissionGroup !== group) return -1;
    if (r.planCode && r.planCode !== input.planCode) return -1;
    if (r.dealType && r.dealType !== input.dealType) return -1;
    return (r.categoryId ? 1000 : 0) + (r.commissionGroup ? 100 : 0) + (r.planCode ? 10 : 0) + (r.dealType ? 5 : 0) + r.priority / 1000;
  };
  const best = rules
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0]?.r;
  if (!best) return { rule: null, percent: 0, amount: 0, capped: false, floored: false };
  const percent = toNum(best.percent);
  let value = round3((amount * percent) / 100);
  let capped = false;
  let floored = false;
  if (best.maxAmount != null && value > toNum(best.maxAmount)) {
    value = toNum(best.maxAmount);
    capped = true;
  }
  if (best.minAmount != null && amount > 0 && value < toNum(best.minAmount)) {
    value = Math.min(toNum(best.minAmount), amount);
    floored = true;
  }
  return { rule: best, percent, amount: round3(value), capped, floored };
}
