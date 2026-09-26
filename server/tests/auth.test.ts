import jwt from 'jsonwebtoken';
import request from 'supertest';
import { passwordFingerprint } from '../src/middleware/auth';
import { app, createAdmin, nextWorkingDate, prisma, resetDb } from './helpers';

const account = { name: 'سارة خليل', phone: '0791112233', email: 'Sara@Example.com', password: 'Pass@1234' };

function booking(phone: string, time: string, date = nextWorkingDate()) {
  return {
    type: 'INSPECTION',
    name: 'ضيف',
    phone,
    locationText: 'عمّان — الصويفية',
    date,
    time,
    zone: 'INSIDE_AMMAN',
    urgency: 'NORMAL',
    details: { faultType: 'تسريب مياه', description: 'رطوبة في الجدار' },
  };
}

function sessionCookie(res: request.Response) {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).find((c) => c.startsWith('vj_session='));
}

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /api/auth/register', () => {
  it('ينشئ حساب عميل ويضع جلسة httpOnly لمدة 30 يومًا', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send(account);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ role: 'CUSTOMER', name: account.name, phone: '962791112233', email: 'sara@example.com', hasPassword: true });
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=2592000/);

    const db = await prisma.customer.findUniqueOrThrow({ where: { phone: '962791112233' } });
    expect(db.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(db.registeredAt).not.toBeNull();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('CUSTOMER');
  });

  it('يرفض الأرقام غير الأردنية وكلمة المرور القصيرة برسائل عربية', async () => {
    const bad = await request(app).post('/api/auth/register').send({ ...account, phone: '0551234567', password: '123' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.phone).toContain('07XXXXXXXX');
    expect(bad.body.error.fields.password).toContain('8 أحرف');
  });

  it('يمنع تكرار الرقم أو البريد', async () => {
    await request(app).post('/api/auth/register').send(account);
    const dupPhone = await request(app).post('/api/auth/register').send({ ...account, email: '' });
    expect(dupPhone.status).toBe(409);
    expect(dupPhone.body.error.message).toContain('مسجّل مسبقًا');
    const dupEmail = await request(app).post('/api/auth/register').send({ ...account, phone: '0781112233' });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.details.field).toBe('email');
  });

  it('رقم له حجوزات سابقة من النظام القديم (بدون كلمة مرور): يطلب رقم المرجع ثم يربط الحجوزات بالحساب', async () => {
    // محاكاة عميل قديم أُنشئ من حجز كضيف قبل إلغاء الحجز بدون حساب
    const legacy = request.agent(app);
    await legacy.post('/api/auth/register').send(account);
    const guest = await legacy.post('/api/v1/bookings').send(booking(account.phone, '10:00'));
    expect(guest.status).toBe(201);
    await prisma.customer.update({ where: { phone: '962791112233' }, data: { passwordHash: null, registeredAt: null, email: null } });

    const noRef = await request(app).post('/api/auth/register').send(account);
    expect(noRef.status).toBe(409);
    expect(noRef.body.error.code).toBe('CLAIM_REQUIRED');

    const wrong = await request(app).post('/api/auth/register').send({ ...account, ref: 'B-WRONG1' });
    expect(wrong.status).toBe(400);

    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/register').send({ ...account, ref: guest.body.data.ref.toLowerCase() });
    expect(ok.status).toBe(201);
    const overview = await agent.get('/api/account/overview');
    expect(overview.body.data.bookings).toHaveLength(1);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(account);
  });

  it('يدخل برقم الهاتف أو البريد', async () => {
    const byPhone = await request(app).post('/api/auth/login').send({ identifier: '0791112233', password: account.password });
    expect(byPhone.status).toBe(200);
    expect(sessionCookie(byPhone)).toBeDefined();
    const byEmail = await request(app).post('/api/auth/login').send({ identifier: 'SARA@example.com', password: account.password });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.data.role).toBe('CUSTOMER');
  });

  it('رسالة موحّدة عند الخطأ', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ identifier: '0791112233', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('رقم الهاتف أو البريد أو كلمة المرور غير صحيحة.');
    const missing = await request(app).post('/api/auth/login').send({ identifier: 'x@y.jo', password: 'nope-nope' });
    expect(missing.status).toBe(401);
    expect(missing.body.error.message).toBe(wrong.body.error.message);
  });

  it('الخروج يمسح الجلسة', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ identifier: '0791112233', password: account.password });
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error.message).toBe('يجب تسجيل الدخول');
  });
});

describe('الصلاحيات', () => {
  it('العميل لا يصل لمسارات الأدمن، والضيف لا يصل لأي منهما', async () => {
    const guest = await request(app).get('/api/admin/dashboard/summary');
    expect(guest.status).toBe(401);
    expect((await request(app).get('/api/account/overview')).status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(account);
    const res = await agent.get('/api/v1/admin/customers');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('هذه الصفحة للإدارة فقط');
  });

  it('الأدمن يصل للوحة و /me يعيد دوره', async () => {
    const admin = await createAdmin();
    const me = await admin.get('/api/auth/me');
    expect(me.body.data).toMatchObject({ role: 'ADMIN', email: 'admin@test.jo' });
    expect((await admin.get('/api/admin/customers')).status).toBe(200);
    // الأدمن ليس عميلًا
    expect((await admin.get('/api/account/overview')).status).toBe(403);
  });

  it('بريد الأدمن في صفحة الدخول العامة يُدخل للوحة التحكم', async () => {
    await createAdmin();
    const agent = request.agent(app);
    const wrong = await agent.post('/api/auth/login').send({ identifier: 'admin@test.jo', password: 'wrong-pass' });
    expect(wrong.status).toBe(401);
    const res = await agent.post('/api/auth/login').send({ identifier: 'ADMIN@test.jo', password: 'Admin@12345' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('ADMIN');
    expect((await agent.get('/api/admin/customers')).status).toBe(200);
  });

  it('الأدمن الموقوف يفقد الوصول فورًا', async () => {
    const admin = await createAdmin();
    await prisma.user.updateMany({ data: { active: false } });
    expect((await admin.get('/api/admin/customers')).status).toBe(401);
  });

  it('كل عميل يرى حجوزاته فقط', async () => {
    const date = nextWorkingDate();
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post('/api/auth/register').send(account);
    await b.post('/api/auth/register').send({ name: 'عمر', phone: '0772223344', password: 'Other@1234' });
    await a.post('/api/v1/bookings').send(booking('0791112233', '10:00', date));
    await b.post('/api/v1/bookings').send(booking('0772223344', '14:00', date));
    const ra = await a.get('/api/account/overview');
    const rb = await b.get('/api/account/overview');
    expect(ra.body.data.bookings).toHaveLength(1);
    expect(rb.body.data.bookings).toHaveLength(1);
    expect(ra.body.data.bookings[0].id).not.toBe(rb.body.data.bookings[0].id);
  });
});

describe('ربط الحجز بالحساب', () => {
  it('حجز المسجّل يرتبط بحسابه حتى لو أدخل رقم تواصل آخر، والزائر لا يستطيع الحجز', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send(account);
    const date = nextWorkingDate();
    const own = await agent.post('/api/v1/bookings').send(booking('0785556677', '10:00', date));
    expect(own.status).toBe(201);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: own.body.data.id } });
    expect(row.customerId).toBe(reg.body.data.id);
    expect(row.phone).toBe('962785556677');

    const guest = await request(app).post('/api/v1/bookings').send(booking('0785556677', '14:00', date));
    expect(guest.status).toBe(401);
  });
});

describe('الجلسة', () => {
  it('تتجدد تلقائيًا بعد يوم من إصدارها', async () => {
    const reg = await request(app).post('/api/auth/register').send(account);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: reg.body.data.id } });
    const old = jwt.sign(
      {
        sub: reg.body.data.id,
        role: 'CUSTOMER',
        name: account.name,
        pv: passwordFingerprint(row.passwordHash),
        iat: Math.floor(Date.now() / 1000) - 2 * 86400,
      },
      process.env.JWT_SECRET!,
      { expiresIn: '28d' },
    );
    const res = await request(app).get('/api/auth/me').set('Cookie', `vj_session=${old}`);
    expect(res.status).toBe(200);
    const renewed = sessionCookie(res);
    expect(renewed).toBeDefined();
    expect(renewed).toMatch(/Max-Age=2592000/);
  });

  it('كوكي الإصدار الأول لم يعد مقبولًا ويُمسح', async () => {
    const reg = await request(app).post('/api/auth/register').send(account);
    const legacy = jwt.sign({ sub: reg.body.data.id, role: 'CUSTOMER', name: account.name }, process.env.JWT_SECRET!, { expiresIn: '30d' });
    const res = await request(app).get('/api/v1/auth/customer/me').set('Cookie', `vj_customer=${legacy}`);
    expect(res.status).toBe(401);
    expect(String(res.headers['set-cookie'])).toContain('vj_customer=;');
  });

  it('توكن مزوّر لا يُقبل', async () => {
    const fake = jwt.sign({ sub: 'x', role: 'ADMIN', name: 'x' }, 'wrong-secret-wrong-secret');
    const res = await request(app).get('/api/admin/customers').set('Cookie', `vj_session=${fake}`);
    expect(res.status).toBe(401);
  });
});

describe('CSRF (فحص المصدر)', () => {
  it('يرفض الطلبات من مصدر غير موثوق ويقبل الواجهة', async () => {
    const evil = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ identifier: 'x@y.jo', password: 'x' });
    expect(evil.status).toBe(403);
    expect(evil.body.error.message).toContain('مصدر غير موثوق');
    const viaReferer = await request(app).post('/api/auth/logout').set('Referer', 'https://evil.example/page');
    expect(viaReferer.status).toBe(403);
    const good = await request(app).post('/api/auth/logout').set('Origin', 'http://localhost:5173');
    expect(good.status).toBe(200);
    // القراءة لا تتأثر
    const get = await request(app).get('/api/site/settings').set('Origin', 'https://evil.example');
    expect(get.status).not.toBe(403);
  });
});

describe('أمان الجلسات وكلمات المرور', () => {
  it('تغيير كلمة المرور يتطلب الحالية ويُنهي الجلسات الأخرى ويُبقي الحالية', async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post('/api/auth/register').send(account);
    await b.post('/api/auth/login').send({ identifier: account.phone, password: account.password });
    expect((await b.get('/api/auth/me')).status).toBe(200);

    const noCurrent = await a.post('/api/auth/customer/password').send({ password: 'NewPass@2027' });
    expect(noCurrent.status).toBe(400);
    const wrong = await a.post('/api/auth/customer/password').send({ current: 'nope-nope', password: 'NewPass@2027' });
    expect(wrong.status).toBe(400);
    const ok = await a.post('/api/auth/customer/password').send({ current: account.password, password: 'NewPass@2027' });
    expect(ok.status).toBe(200);

    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await b.get('/api/auth/me')).status).toBe(401);
    const relog = await request(app).post('/api/auth/login').send({ identifier: account.phone, password: 'NewPass@2027' });
    expect(relog.status).toBe(200);
  });

  it('إعادة تعيين كلمة المرور من الأدمن تُنهي جلسة العميل', async () => {
    const c = request.agent(app);
    const reg = await c.post('/api/auth/register').send(account);
    const admin = await createAdmin();
    await admin.patch(`/api/admin/customers/${reg.body.data.id}`).send({ resetPassword: true });
    expect((await c.get('/api/account/overview')).status).toBe(401);
  });

  it('التوكن بخوارزمية none أو بدون بصمة كلمة المرور لا يُقبل', async () => {
    const reg = await request(app).post('/api/auth/register').send(account);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: reg.body.data.id, role: 'CUSTOMER', name: 'x', exp: 9999999999 })).toString('base64url');
    expect((await request(app).get('/api/auth/me').set('Cookie', `vj_session=${header}.${body}.`)).status).toBe(401);
    const noPv = jwt.sign({ sub: reg.body.data.id, role: 'CUSTOMER', name: 'x' }, process.env.JWT_SECRET!, { expiresIn: '1d' });
    expect((await request(app).get('/api/auth/me').set('Cookie', `vj_session=${noPv}`)).status).toBe(401);
  });

  it('تصدير CSV محمي من حقن الصيغ', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ ...account, name: '=HYPERLINK("http://evil","x")' });
    const admin = await createAdmin();
    const csv = await admin.get('/api/admin/finance/export').query({ kind: 'customers' });
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv.text).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe('الإعدادات', () => {
  it('ترفض روابط غير https وقيمة قديمة غير صالحة لا تُسقط باقي الإعدادات', async () => {
    const admin = await createAdmin();
    const bad = await admin.put('/api/admin/settings').send({ mapUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    const badFb = await admin.put('/api/admin/settings').send({ facebook: 'http://facebook.com/x' });
    expect(badFb.status).toBe(400);
    const good = await admin.put('/api/admin/settings').send({ mapUrl: 'https://www.google.com/maps/embed?pb=abc', inspectionFeeNormal: 17 });
    expect(good.status).toBe(200);

    await prisma.setting.update({ where: { key: 'mapUrl' }, data: { value: 'javascript:alert(1)' } });
    const { invalidateSettingsCache } = await import('../src/services/settings.service');
    invalidateSettingsCache();
    const pub = await request(app).get('/api/site/settings');
    expect(pub.body.data.mapUrl).toBe('');
    expect(pub.body.data.inspectionFeeNormal).toBe(17);
  });
});
