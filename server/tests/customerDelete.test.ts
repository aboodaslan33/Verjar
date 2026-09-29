import request from 'supertest';
import { app, createAdmin, createCustomer, createVendor, nextWorkingDate, prisma, resetDb } from './helpers';

/** حذف حساب العميل من الإدارة ثم التسجيل من جديد بنفس الهاتف والبريد */
describe('حذف حساب العميل', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    await resetDb();
    admin = await createAdmin();
  });
  afterAll(() => prisma.$disconnect());

  const register = (phone: string, email: string) =>
    request(app).post('/api/v1/auth/register').send({ name: 'عميل جديد', phone, email, password: 'Fresh@2468' });

  it('عميل بدون سجلات: يُحذف بالكامل ويسجل من جديد بنفس الهاتف والبريد', async () => {
    const agent = await createCustomer({ name: 'سامي', phone: '0791010101', email: 'sami@test.jo' });
    const me = await agent.get('/api/v1/auth/me');
    const id = me.body.data.id as string;
    await prisma.notification.create({ data: { recipientType: 'CUSTOMER', recipientId: id, title: 'x', body: 'y' } });

    expect((await register('0791010101', 'sami@test.jo')).status).toBe(409);
    const del = await admin.delete(`/api/v1/admin/customers/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ mode: 'deleted', records: 0 });
    expect(await prisma.customer.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.notification.count({ where: { recipientId: id } })).toBe(0);

    // الجلسة القديمة انتهت
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    // التسجيل من جديد بنفس البيانات حساب جديد نظيف
    const again = await register('0791010101', 'sami@test.jo');
    expect(again.status).toBe(201);
    expect(again.body.data.id).not.toBe(id);
    expect((await admin.delete(`/api/v1/admin/customers/${id}`)).status).toBe(404);
  });

  it('عميل له حجز ومتجر مورد: تُمسح بياناته، يبقى الحجز للحسابات، ويُعلَّق المتجر', async () => {
    const { agent, vendor, customerId: id } = await createVendor(admin, { name: 'ليلى', phone: '0792020202' });
    await prisma.customer.update({ where: { id }, data: { email: 'layla@test.jo' } });
    const b = await agent.post('/api/v1/bookings').send({
      type: 'INSPECTION',
      acceptPolicy: true,
      name: 'ليلى',
      phone: '0792020202',
      locationText: 'عمّان — عبدون',
      date: nextWorkingDate(),
      time: '10:00',
      zone: 'INSIDE_AMMAN',
      urgency: 'NORMAL',
      details: { faultType: 'تسريب مياه', description: 'رطوبة في الجدار' },
    });
    expect(b.status).toBe(201);

    const del = await admin.delete(`/api/v1/admin/customers/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ mode: 'anonymized', vendorSuspended: true });
    const row = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ name: 'عميل محذوف', email: null, passwordHash: null });
    expect(row.phone).not.toBe('962792020202');
    expect(row.deletedAt).not.toBeNull();
    // الحجز باقٍ
    expect(await prisma.booking.count({ where: { customerId: id } })).toBe(1);
    // المتجر معلّق ومفصول
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } });
    expect(v).toMatchObject({ customerId: null, active: false, status: 'SUSPENDED' });
    // لا يظهر في قائمة العملاء
    const list = await admin.get('/api/v1/admin/customers?q=' + encodeURIComponent('ليلى'));
    expect(list.body.data.items).toHaveLength(0);
    // الدخول القديم لا يعمل، والتسجيل من جديد بنفس الهاتف والبريد ينجح
    expect((await request(app).post('/api/v1/auth/login').send({ identifier: 'layla@test.jo', password: 'Customer@123' })).status).not.toBe(200);
    expect((await register('0792020202', 'layla@test.jo')).status).toBe(201);
  });
});
