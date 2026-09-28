import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * مرجع متسلسل لكل بادئة وسنة: MC-2026-00001، TEN-2026-00001، SET-2026-00001.
 * الزيادة ذرّية في قاعدة البيانات، فلا يتكرر المرجع مع الطلبات المتزامنة.
 */
export async function nextRef(db: Db, prefix: 'MC' | 'TEN' | 'SET', now = new Date()) {
  const year = now.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const row = await db.refCounter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return `${key}-${String(row.value).padStart(5, '0')}`;
}
