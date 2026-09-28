import { Prisma, type ContractStatus } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from '../lib/http';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';

/**
 * "قارب على الانتهاء" حالة معروضة وليست مخزّنة: عقد نشط ينتهي خلال أيام التذكير الخاصة به
 * (نفس قاعدة مهمة التذكير الحالية). التحويل إلى EXPIRED يبقى كما هو في المهمة الدورية.
 */
export type ContractDisplayStatus = ContractStatus | 'EXPIRING_SOON';

export function contractDisplayStatus(c: { status: ContractStatus; endDate: Date; reminderDays: number }, now = new Date()): ContractDisplayStatus {
  if (c.status !== 'ACTIVE') return c.status;
  if (c.endDate < now) return 'EXPIRED';
  const daysLeft = (c.endDate.getTime() - now.getTime()) / 86400_000;
  return daysLeft <= c.reminderDays ? 'EXPIRING_SOON' : 'ACTIVE';
}

/** شرط قاعدة البيانات لحالة "قارب على الانتهاء" (تقريب بأقصى مدة تذكير، ثم يُصفّى بالدالة أعلاه) */
export const expiringWhere = (): Prisma.ContractWhereInput => ({
  status: 'ACTIVE',
  endDate: { gte: new Date(), lte: new Date(Date.now() + 180 * 86400_000) },
});

/** المدفوع والمتبقي والزيارات لكل عقد */
export async function contractTotals(ids: string[]) {
  if (!ids.length) return new Map<string, { paid: number; visitsUsed: number; visitsScheduled: number; requests: number }>();
  const [paid, visits, requests] = await Promise.all([
    prisma.payment.groupBy({ by: ['contractId'], where: { contractId: { in: ids }, deletedAt: null }, _sum: { amount: true } }),
    prisma.contractVisit.groupBy({ by: ['contractId', 'status'], where: { contractId: { in: ids } }, _count: { _all: true } }),
    prisma.corporateRequest.groupBy({ by: ['contractId'], where: { contractId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
  ]);
  const map = new Map(ids.map((id) => [id, { paid: 0, visitsUsed: 0, visitsScheduled: 0, requests: 0 }]));
  for (const p of paid) if (p.contractId) map.get(p.contractId)!.paid = round3(toNum(p._sum.amount));
  for (const v of visits) {
    const t = map.get(v.contractId)!;
    if (v.status === 'COMPLETED') t.visitsUsed += v._count._all;
    if (v.status === 'SCHEDULED') t.visitsScheduled += v._count._all;
  }
  for (const r of requests) if (r.contractId) map.get(r.contractId)!.requests = r._count._all;
  return map;
}

/** يضيف للعقد: الحالة المعروضة، المدفوع، المتبقي، والزيارات */
export function withContractSummary<T extends { id: string; status: ContractStatus; endDate: Date; reminderDays: number; value: Prisma.Decimal; visitsIncluded: number | null }>(
  c: T,
  t: { paid: number; visitsUsed: number; visitsScheduled: number; requests: number } | undefined,
) {
  const paid = t?.paid ?? 0;
  const used = t?.visitsUsed ?? 0;
  return {
    ...c,
    displayStatus: contractDisplayStatus(c),
    paid,
    remaining: round3(toNum(c.value) - paid),
    visitsUsed: used,
    visitsScheduled: t?.visitsScheduled ?? 0,
    visitsRemaining: c.visitsIncluded != null ? Math.max(0, c.visitsIncluded - used) : null,
    requestsCount: t?.requests ?? 0,
  };
}

export const contractFieldsSchema = z.object({
  title: z.string().trim().min(2, 'عنوان العقد مطلوب').max(150),
  type: z.enum(['MAINTENANCE', 'ANNUAL_CORPORATE']),
  startDate: z.coerce.date({ invalid_type_error: 'تاريخ البداية غير صحيح' }),
  endDate: z.coerce.date({ invalid_type_error: 'تاريخ النهاية غير صحيح' }),
  value: z.coerce.number().min(0, 'المبلغ لا يمكن أن يكون سالبًا').max(10_000_000),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED']),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CLIQ', 'CARD', 'OTHER']).nullable(),
  serviceIds: z.array(z.string().min(1)).max(30),
  visitsIncluded: z.coerce.number().int().min(0).max(1000).nullable(),
  responseHours: z.coerce.number().int().min(0).max(8760).nullable(),
  technicianId: z.string().min(1).nullable(),
  terms: z.string().max(20000).nullable(),
  renewalStatus: z.enum(['NONE', 'PENDING', 'RENEWED', 'NOT_RENEWING']),
  reminderDays: z.coerce.number().int().min(1).max(180),
  notes: z.string().max(3000).nullable(),
});

export async function checkContractRefs(input: { serviceIds?: string[]; technicianId?: string | null }) {
  if (input.serviceIds?.length) {
    const n = await prisma.corporateService.count({ where: { id: { in: input.serviceIds } } });
    if (n !== new Set(input.serviceIds).size) throw badRequest('خدمة غير موجودة', { fields: { serviceIds: 'اختر الخدمات من القائمة' } });
  }
  if (input.technicianId && !(await prisma.technician.findUnique({ where: { id: input.technicianId } }))) {
    throw badRequest('الفني غير موجود', { fields: { technicianId: 'اختر فنيًا من القائمة' } });
  }
}
