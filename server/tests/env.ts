// بيئة الاختبار: قاعدة بيانات منفصلة (TEST_DATABASE_URL)
process.env.NODE_ENV = 'test';
if (!/test/i.test(process.env.TEST_DATABASE_URL ?? 'test')) throw new Error('TEST_DATABASE_URL must point to a test database');
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/verjar_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret';
process.env.CLOUDINARY_URL = '';
process.env.WA_TOKEN = '';
process.env.WA_PHONE_ID = '';
process.env.ADMIN_WHATSAPP = '962780192930';
