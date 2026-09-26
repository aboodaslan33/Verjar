import { env } from './config/env';
import { createApp } from './app';
import { startContractReminderJob } from './jobs/contractReminders';
import { prisma } from './lib/prisma';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`مجموعة فرجا API يعمل على المنفذ ${env.PORT} (${env.NODE_ENV})`);
  console.log(`واتساب: ${env.waCloudEnabled ? 'Cloud API' : 'روابط wa.me'} | الملفات: ${env.cloudinaryEnabled ? 'Cloudinary' : 'محلي'}`);
  if (env.isProd && !env.cloudinaryEnabled) {
    console.warn('تحذير: CLOUDINARY_URL غير مضبوط — الملفات المرفوعة ستضيع عند إعادة تشغيل الخدمة على Render');
  }
});

startContractReminderJob();

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
