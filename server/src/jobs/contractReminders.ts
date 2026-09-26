import { prisma } from '../lib/prisma';
import { contractReminderMessage } from '../services/messages';
import { notifyAdmin } from '../services/whatsapp.service';

/**
 * يفحص العقود النشطة:
 * - يرسل تذكيرًا للإدارة قبل انتهاء العقد بعدد الأيام المحدد (مرة واحدة)
 * - يحوّل العقود المنتهية إلى EXPIRED
 */
export async function runContractReminders(now = new Date()) {
  await prisma.contract.updateMany({
    where: { deletedAt: null, status: 'ACTIVE', endDate: { lt: now } },
    data: { status: 'EXPIRED' },
  });

  const candidates = await prisma.contract.findMany({
    where: { deletedAt: null, status: 'ACTIVE', reminderSentAt: null, endDate: { gte: now } },
    include: { customer: { select: { name: true, companyName: true } } },
  });
  let sent = 0;
  for (const c of candidates) {
    const daysLeft = Math.ceil((c.endDate.getTime() - now.getTime()) / 86400_000);
    if (daysLeft > c.reminderDays) continue;
    await notifyAdmin(contractReminderMessage(c.customer.companyName ?? c.customer.name, c.number, c.endDate, daysLeft), {
      entityType: 'contract',
      entityId: c.id,
    });
    await prisma.contract.update({ where: { id: c.id }, data: { reminderSentAt: now } });
    sent++;
  }
  return { sent };
}

export function startContractReminderJob() {
  const run = () => runContractReminders().catch((e) => console.error('contract reminders failed', e));
  // أول تشغيل بعد دقيقة من الإقلاع، ثم كل 6 ساعات
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3600_000).unref();
}
