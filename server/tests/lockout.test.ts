import request from 'supertest';
import { app, createAdmin, createCustomer, prisma, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const login = (identifier: string, password: string) => request(app).post('/api/auth/login').send({ identifier, password });

describe('قفل تسجيل الدخول', () => {
  it('5 محاولات خاطئة ← قفل 10 دقائق، حتى بكلمة المرور الصحيحة، مع تحذير قبل القفل', async () => {
    await createCustomer({ phone: '0791234000', password: 'Right@1234' });
    const statuses: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const r = await login('0791234000', 'wrong-pass');
      statuses.push(r.status);
      if (i === 3) expect(r.body.error.message).toContain('بقي لك محاولتان');
      if (i === 4) expect(r.body.error.message).toContain('محاولة واحدة');
      if (i === 5) {
        expect(r.body.error.code).toBe('LOGIN_LOCKED');
        expect(r.body.error.message).toContain('10 دقائق');
      }
    }
    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    // نفس الرقم بصيغة أخرى مقفول أيضًا، والكلمة الصحيحة لا تفتحه
    const blocked = await login('+962791234000', 'Right@1234');
    expect(blocked.status).toBe(429);
  });

  it('بعد انتهاء القفل يعمل الدخول ويُصفّر العداد، والقفل التالي أطول (20 دقيقة)', async () => {
    await createCustomer({ phone: '0791234001', password: 'Right@1234' });
    for (let i = 0; i < 5; i++) await login('0791234001', 'wrong-pass');
    await prisma.loginLock.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });

    // مستوى القفل محفوظ: 5 خاطئة أخرى ← 20 دقيقة
    for (let i = 0; i < 4; i++) expect((await login('0791234001', 'wrong-pass')).status).toBe(401);
    const second = await login('0791234001', 'wrong-pass');
    expect(second.status).toBe(429);
    expect(second.body.error.message).toContain('20 دقيقة');

    await prisma.loginLock.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login('0791234001', 'Right@1234')).status).toBe(200);
    expect(await prisma.loginLock.count()).toBe(0);
  });

  it('المحاولات المتزامنة لا تتجاوز الحد', async () => {
    await createCustomer({ phone: '0791234002', password: 'Right@1234' });
    const results = await Promise.all(Array.from({ length: 12 }, () => login('0791234002', 'wrong-pass')));
    expect(results.filter((r) => r.status === 401).length).toBeLessThanOrEqual(4);
    const lock = await prisma.loginLock.findFirstOrThrow();
    expect(lock.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('يقفل المعرّفات غير الموجودة أيضًا (لا يكشف وجود الحساب) ويشمل دخول الأدمن', async () => {
    for (let i = 0; i < 5; i++) await login('ghost@example.com', 'x');
    expect((await login('ghost@example.com', 'x')).status).toBe(429);

    await createAdmin();
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/admin/login').send({ email: 'admin@test.jo', password: 'nope' });
    const locked = await request(app).post('/api/auth/admin/login').send({ email: 'admin@test.jo', password: 'Admin@12345' });
    expect(locked.status).toBe(429);
    // صفحة الدخول العامة تشارك نفس القفل لبريد الأدمن
    expect((await login('admin@test.jo', 'Admin@12345')).status).toBe(429);
  });
});
