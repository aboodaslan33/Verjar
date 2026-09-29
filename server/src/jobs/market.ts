import { prisma } from '../lib/prisma';
import { marketNotify } from '../market/notify';
import { getSettings } from '../services/settings.service';

/**
 * مهام السوق اليومية: تذكير المورد قبل انتهاء اشتراكه، إنهاء الاشتراكات والإعلانات المنتهية.
 * (عند انتهاء الاشتراك تُطبَّق حدود الباقة المجانية تلقائيًا — انظر effectivePlan)
 */
export async function runMarketJobs(now = new Date()) {
  const s = await getSettings();
  const from = new Date(now.getTime() + (s.subscriptionReminderDays - 1) * 86400_000);
  const to = new Date(now.getTime() + s.subscriptionReminderDays * 86400_000);
  const expiring = await prisma.vendor.findMany({
    where: { active: true, isHouse: false, planExpiresAt: { gt: from, lte: to }, plan: { price: { gt: 0 } } },
    select: { id: true, planExpiresAt: true, plan: { select: { name: true } } },
  });
  for (const v of expiring) {
    await marketNotify(prisma, { vendorIds: [v.id] }, {
      title: `اشتراكك سينتهي خلال ${s.subscriptionReminderDays} أيام`,
      body: `تنتهي باقة ${v.plan?.name ?? ''} بتاريخ ${v.planExpiresAt!.toISOString().slice(0, 10)}. جدّد الآن للحفاظ على مزاياك.`,
      link: '/vendor/subscription',
      cta: 'تجديد الاشتراك',
    });
  }
  const expired = await prisma.vendorSubscription.updateMany({ where: { status: 'ACTIVE', endsAt: { lt: now } }, data: { status: 'EXPIRED' } });
  const ended = await prisma.marketAd.updateMany({ where: { status: 'ACTIVE', endsAt: { lt: now } }, data: { status: 'ENDED' } });
  return { reminded: expiring.length, expired: expired.count, adsEnded: ended.count };
}

export function startMarketJobs() {
  const run = () => runMarketJobs().catch((e) => console.error('market jobs failed', e));
  setTimeout(run, 30_000).unref();
  setInterval(run, 24 * 60 * 60_000).unref();
}
