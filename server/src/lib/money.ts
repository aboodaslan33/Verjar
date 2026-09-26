import { Prisma } from '@prisma/client';

type Num = number | string | Prisma.Decimal | null | undefined;

/** تقريب لثلاث خانات (فلس) */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function toNum(v: Num): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v.toString());
}

/** السعر بعد الخصم */
export function applyDiscount(price: Num, discountPercent: number): number {
  const p = toNum(price);
  return round3(p * (1 - Math.min(Math.max(discountPercent, 0), 100) / 100));
}

/** تنسيق المبلغ بالدينار: 90 د.أ، 12.5 د.أ */
export function formatJOD(v: Num): string {
  const n = round3(toNum(v));
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${s} د.أ`;
}
