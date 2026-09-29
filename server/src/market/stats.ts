import { prisma } from '../lib/prisma';
import { ammanParts } from '../lib/time';

type StatField = 'profileViews' | 'productViews' | 'rfqs' | 'quotes' | 'adImpressions' | 'adClicks';

/** إحصائيات المورد اليومية — لا تُفشل الطلب الأصلي أبدًا */
export function bumpStat(vendorId: string, field: StatField, by = 1) {
  const day = ammanParts(new Date()).date;
  return prisma.vendorDailyStat
    .upsert({
      where: { vendorId_day: { vendorId, day } },
      create: { vendorId, day, [field]: by },
      update: { [field]: { increment: by } },
    })
    .catch(() => undefined);
}
