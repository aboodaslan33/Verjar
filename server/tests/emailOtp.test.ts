import { app, createAdmin, createCustomer, prisma, resetDb } from './helpers';
import { testOutbox } from '../src/services/email.service';

const lastCode = () => {
  const m = testOutbox[testOutbox.length - 1];
  return /رمز التحقق: (\d{6})/.exec(m.text)![1];
};

describe('رمز التحقق بالبريد (OTP)', () => {
  beforeEach(async () => {
    await resetDb();
    testOutbox.length = 0;
  });
  afterAll(() => prisma.$disconnect());

  it('يرسل رسالة مرتبة باسم العميل والشعار ويؤكد البريد برمز صحيح', async () => {
    const c = await createCustomer({ name: 'سارة خالد', email: 'sara@test.jo' });
    let me = await c.get('/api/v1/auth/me');
    expect(me.body.data.emailVerified).toBe(false);

    const sent = await c.post('/api/v1/account/email-otp/send').send({ purpose: 'VERIFY_EMAIL' });
    expect(sent.status).toBe(200);
    expect(sent.body.data.sentTo).toBe('sa**@test.jo');
    const mail = testOutbox[testOutbox.length - 1];
    expect(mail.to).toBe('sara@test.jo');
    expect(mail.subject).toContain('تأكيد بريدك الإلكتروني');
    expect(mail.html).toContain('مرحبًا سارة');
    expect(mail.html).toContain('/email/logo-light.png');
    expect(mail.html).toContain(lastCode());
    // الرمز لا يُخزن كنص
    const row = await prisma.emailOtp.findFirstOrThrow();
    expect(row.codeHash).not.toContain(lastCode());

    // إعادة الإرسال فورًا ممنوعة (مهلة 60 ثانية)
    expect((await c.post('/api/v1/account/email-otp/send').send({})).status).toBe(429);

    const code = lastCode();
    const wrong = await c.post('/api/v1/account/email-otp/verify').send({ code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toContain('متبقي 4');

    expect((await c.post('/api/v1/account/email-otp/verify').send({ code })).status).toBe(200);
    // لا يُقبل نفس الرمز مرتين
    expect((await c.post('/api/v1/account/email-otp/verify').send({ code })).status).toBe(400);
    me = await c.get('/api/v1/auth/me');
    expect(me.body.data.emailVerified).toBe(true);

    // تغيير البريد يلغي التأكيد
    expect((await c.patch('/api/v1/auth/profile').send({ email: 'sara2@test.jo' })).status).toBe(200);
    me = await c.get('/api/v1/auth/me');
    expect(me.body.data.emailVerified).toBe(false);
  });

  it('يقفل الرمز بعد 5 محاولات خاطئة وينتهي بعد مدته', async () => {
    const c = await createCustomer({ email: 'x@test.jo' });
    await c.post('/api/v1/account/email-otp/send').send({});
    const code = lastCode();
    const bad = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await c.post('/api/v1/account/email-otp/verify').send({ code: bad });
    const locked = await c.post('/api/v1/account/email-otp/verify').send({ code });
    expect(locked.status).toBe(400);
    expect(locked.body.error.message).toContain('محاولات كثيرة');

    await prisma.emailOtp.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    await c.post('/api/v1/account/email-otp/send').send({});
    await prisma.emailOtp.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await c.post('/api/v1/account/email-otp/verify').send({ code: lastCode() });
    expect(expired.body.error.message).toContain('انتهت صلاحية');
  });

  it('العميل بدون بريد لا يستطيع طلب رمز', async () => {
    const c = await createCustomer();
    const r = await c.post('/api/v1/account/email-otp/send').send({});
    expect(r.status).toBe(409);
  });

  it('الأدمن يعاين القالب ويرسل رسالة تجريبية', async () => {
    const a = await createAdmin();
    const p = await a.get('/api/v1/admin/settings/email/preview?purpose=LOGIN_2FA');
    expect(p.status).toBe(200);
    expect(p.body.data.html).toContain('رمز تسجيل الدخول');
    expect(p.body.data.html).toContain('482915');
    const t = await a.post('/api/v1/admin/settings/email/test').send({ purpose: 'LOGIN_2FA' });
    expect(t.status).toBe(200);
    expect(testOutbox[testOutbox.length - 1].subject).toContain('[تجربة]');
    expect(testOutbox[testOutbox.length - 1].to).toBe('admin@test.jo');
    // غير المسجّل لا يصل
    const request = (await import('supertest')).default;
    expect((await request(app).get('/api/v1/admin/settings/email/preview')).status).toBe(401);
  });
});
