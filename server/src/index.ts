import { env } from './config/env';
import { createApp } from './app';
import { startContractReminderJob } from './jobs/contractReminders';
import { startMarketJobs } from './jobs/market';
import { prisma } from './lib/prisma';
import { markInterruptedCampaigns } from './services/email.service';
import { purgeOldEmailOtps } from './services/emailOtp.service';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`مجموعة فرجار API يعمل على المنفذ ${env.PORT} (${env.NODE_ENV})`);
  console.log(
    `واتساب: ${env.waCloudEnabled ? 'Cloud API' : 'روابط wa.me'} | الملفات: ${env.cloudinaryEnabled ? 'Cloudinary' : 'محلي'} | البريد: ${env.emailEnabled ? env.SMTP_USER : 'غير مفعّل'}`,
  );
  if (env.isProd && !env.cloudinaryEnabled) {
    console.warn('تحذير: CLOUDINARY_URL غير مضبوط — الملفات المرفوعة ستضيع عند إعادة تشغيل الخدمة على Render');
  }
});

startContractReminderJob();
startMarketJobs();
markInterruptedCampaigns().catch((e) => console.error('markInterruptedCampaigns', e));
// تنظيف رموز التحقق المنتهية يوميًا
const purge = () => purgeOldEmailOtps().catch((e) => console.error('purgeOldEmailOtps', e));
purge();
setInterval(purge, 24 * 60 * 60_000).unref();

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
