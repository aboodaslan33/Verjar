import { execSync } from 'child_process';

/**
 * يطبّق الـ migrations على قاعدة بيانات الاختبار (غير تدميري).
 * كل ملف اختبار ينظف جداوله بنفسه عبر resetDb() — استخدم دائمًا قاعدة بيانات مخصصة للاختبار.
 */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/verjar_test';
  if (!/test/i.test(url)) {
    throw new Error('TEST_DATABASE_URL يجب أن يشير لقاعدة بيانات اختبار (يحتوي اسمها على "test")');
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
