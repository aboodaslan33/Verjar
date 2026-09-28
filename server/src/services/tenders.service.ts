import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../lib/http';
import { round3, toNum } from '../lib/money';
import { prisma } from '../lib/prisma';
import { POLICIES, validateAndStore } from './upload.service';
import { getSettings } from './settings.service';

export type Attachment = { url: string; name: string; kind: string };

export const tenderInput = z.object({
  title: z.string().trim().min(3, 'عنوان العطاء مطلوب').max(200),
  description: z.string().trim().min(10, 'اكتب وصفًا للعمل المطلوب').max(10000),
  serviceId: z.string().min(1).nullable().optional(),
  location: z.string().trim().min(2, 'الموقع مطلوب').max(300),
  durationMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  deadline: z.coerce.date({ invalid_type_error: 'موعد التقديم غير صحيح' }),
  budget: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  requirements: z.string().trim().max(10000).nullable().optional(),
});

export const offerInput = z.object({
  price: z.coerce.number().positive('السعر مطلوب').max(100_000_000),
  proposal: z.string().trim().min(10, 'اكتب تفاصيل العرض').max(10000),
});

export function tenderData(input: Partial<z.infer<typeof tenderInput>>): Prisma.TenderUncheckedUpdateInput {
  const { budget, ...rest } = input;
  return { ...rest, ...(budget !== undefined ? { budget: budget === null ? null : new Prisma.Decimal(budget) } : {}) };
}

export async function checkService(serviceId?: string | null) {
  if (serviceId && !(await prisma.corporateService.findUnique({ where: { id: serviceId } }))) {
    throw badRequest('الخدمة غير موجودة', { fields: { serviceId: 'اختر الخدمة من القائمة' } });
  }
}

/** رفع مرفقات (صور أو PDF) وإرجاعها بصيغة موحّدة */
export async function storeAttachments(files: Express.Multer.File[] | undefined, folder: string): Promise<Attachment[]> {
  if (!files?.length) throw badRequest('اختر ملفًا واحدًا على الأقل');
  const stored = await validateAndStore(files, POLICIES.documents, folder);
  return stored.map((f) => ({ url: f.url, name: f.originalName, kind: f.kind }));
}

/** العطاء يقبل العروض فقط وهو مفتوح وقبل موعد التقديم */
export function assertOpen(t: { status: string; deadline: Date }) {
  if (t.status !== 'OPEN') throw conflict('العطاء غير مفتوح لاستقبال العروض');
  if (t.deadline < new Date()) throw conflict('انتهى موعد تقديم العروض');
}

/**
 * ترسية العطاء على عرض: العمولة بنسبة الإعدادات الحالية تُحسب وتُحفظ مع العطاء
 * (قيمة العقد، النسبة، عمولة المنصة، صافي مقدم الخدمة) — ولا يُعاد حسابها لاحقًا.
 */
export async function awardTender(tenderId: string, offerId: string) {
  const { tenderCommissionPercent } = await getSettings();
  return prisma.$transaction(async (tx) => {
    const t = await tx.tender.findFirst({ where: { id: tenderId, deletedAt: null } });
    if (!t) throw notFound('العطاء غير موجود');
    if (t.status === 'AWARDED' || t.status === 'CANCELLED') throw conflict('العطاء مُرسّى أو ملغي');
    const offer = await tx.tenderOffer.findFirst({ where: { id: offerId, tenderId: t.id, status: 'SUBMITTED' } });
    if (!offer) throw notFound('العرض غير موجود أو غير متاح');
    const amount = toNum(offer.price);
    const commission = round3((amount * tenderCommissionPercent) / 100);
    await tx.tenderOffer.updateMany({ where: { tenderId: t.id, id: { not: offer.id }, status: 'SUBMITTED' }, data: { status: 'REJECTED' } });
    await tx.tenderOffer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    return tx.tender.update({
      where: { id: t.id },
      data: {
        status: 'AWARDED',
        awardedOfferId: offer.id,
        awardedAt: new Date(),
        awardedAmount: new Prisma.Decimal(amount),
        commissionPercent: new Prisma.Decimal(tenderCommissionPercent),
        commissionAmount: new Prisma.Decimal(commission),
        providerAmount: new Prisma.Decimal(round3(amount - commission)),
      },
    });
  });
}
