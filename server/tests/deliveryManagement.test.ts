import request from 'supertest';
import { PNG_1PX, app, createAdmin, createVendor, prisma, resetDb } from './helpers';

type Agent = ReturnType<typeof request.agent>;
const SIGNATURE = `data:image/png;base64,${PNG_1PX.toString('base64')}`;

let admin: Agent;

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
});
afterAll(() => prisma.$disconnect());

async function createUser(body: Record<string, unknown>) {
  const r = await admin.post('/api/v1/admin/users').send({ password: 'Strong#2468', ...body });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body.data as { id: string; driver: { id: string } | null; permissions: string[] };
}

async function login(username: string, password = 'Strong#2468', extra: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const r = await agent.post('/api/v1/auth/login').send({ identifier: username, password, ...extra });
  if (r.status !== 200) throw new Error(JSON.stringify(r.body));
  return { agent, body: r.body.data };
}

const orderBody = {
  customerName: 'سامي',
  customerPhone: '0795551234',
  address: 'عمّان — الجبيهة، شارع الجامعة، عمارة 5',
  area: 'الجبيهة',
  items: [
    { name: 'طاولة', quantity: 1, unitPrice: 20 },
    { name: 'كرسي', quantity: 2, unitPrice: 5 },
  ],
  paymentMethod: 'COD',
};

describe('المستخدمون والصلاحيات (RBAC)', () => {
  it('الـ Super Admin ينشئ مدير توصيل وموظف توصيل؛ الدخول باسم المستخدم؛ كل دور يصل لما يُسمح له فقط', async () => {
    const manager = await createUser({ name: 'مدير التوصيل', username: 'manager1', role: 'MANAGER' });
    const driver = await createUser({ name: 'أحمد', username: 'ahmad', phone: '0791111111', role: 'DRIVER' });
    expect(driver.driver?.id).toBeTruthy();
    expect(manager.permissions).toContain('orders.assign');
    expect(manager.permissions).not.toContain('users.manage');

    const m = (await login('manager1')).agent;
    const d = await login('Ahmad');
    expect(d.body.role).toBe('DRIVER');

    // موظف التوصيل: لوحته فقط
    expect((await d.agent.get('/api/v1/admin/dashboard/stats')).status).toBe(403);
    expect((await d.agent.get('/api/v1/admin/delivery/orders')).status).toBe(403);
    expect((await d.agent.get('/api/v1/driver/me')).status).toBe(200);
    // المدير: التوصيل نعم؛ المستخدمون والإعدادات والمنتجات لا
    expect((await m.get('/api/v1/admin/delivery/orders')).status).toBe(200);
    expect((await m.get('/api/v1/admin/users')).status).toBe(403);
    expect((await m.get('/api/v1/admin/settings')).status).toBe(403);
    expect((await m.post('/api/v1/admin/store/categories').send({ name: 'x' })).status).toBe(403);
    // العميل والزائر لا يصلان للوحة التوصيل
    expect((await request(app).get('/api/v1/driver/orders')).status).toBe(401);

    // سحب صلاحية يسري فورًا على الجلسة القائمة
    await admin.patch(`/api/v1/admin/users/${manager.id}`).send({ permissions: ['dashboard.view'] });
    expect((await m.get('/api/v1/admin/delivery/orders')).status).toBe(403);
    // إيقاف الحساب يُنهي الجلسة
    await admin.patch(`/api/v1/admin/users/${driver.id}`).send({ active: false });
    expect((await d.agent.get('/api/v1/driver/me')).status).toBe(401);
  });

  it('لا يمكن منح users.manage لغير الـ Super Admin، ولا إيقاف آخر Super Admin', async () => {
    const staff = await createUser({ name: 'موظف', username: 'staff1', role: 'STAFF', permissions: ['users.manage', 'orders.view'] });
    expect(staff.permissions).toEqual(['orders.view']);
    const me = (await admin.get('/api/v1/auth/me')).body.data;
    expect((await admin.patch(`/api/v1/admin/users/${me.id}`).send({ active: false })).status).toBe(400);
    expect((await admin.delete(`/api/v1/admin/users/${me.id}`)).status).toBe(400);
    // اسم مستخدم يشبه رقم هاتف مرفوض
    expect((await admin.post('/api/v1/admin/users').send({ name: 'x', username: '0791234', role: 'DRIVER', password: 'Strong#2468' })).status).toBe(400);
    // كلمة مرور ضعيفة مرفوضة
    expect((await admin.post('/api/v1/admin/users').send({ name: 'x', username: 'weak1', role: 'DRIVER', password: '12345678' })).status).toBe(400);
  });

  it('تطبيق الجوال: الدخول يعيد توكن يُستخدم في Authorization: Bearer', async () => {
    await createUser({ name: 'أحمد', username: 'ahmad', role: 'DRIVER' });
    const { body } = await login('ahmad', 'Strong#2468', { client: 'mobile' });
    expect(body.token).toBeTruthy();
    const me = await request(app).get('/api/v1/driver/me').set('Authorization', `Bearer ${body.token}`);
    expect(me.status).toBe(200);
    expect((await request(app).get('/api/v1/driver/me').set('Authorization', 'Bearer bad.token.value')).status).toBe(401);
  });
});

describe('دورة طلب التوصيل كاملة', () => {
  it('المورد ينشئ → المدير يقبل ويسند → الموظف يستلم ويوصل ويسلّم بإثبات ويحصّل → الإغلاق', async () => {
    const { agent: supplier, vendor } = await createVendor(admin, { name: 'متجر الورد', phone: '0782222222' });
    await supplier.patch('/api/v1/vendor/me').send({ pickupAddress: 'عمّان — ماركا، المستودع 3', phone: '0782222222' });
    await createUser({ name: 'مدير', username: 'manager1', role: 'MANAGER' });
    const d1 = await createUser({ name: 'أحمد', username: 'ahmad', role: 'DRIVER' });
    await createUser({ name: 'خالد', username: 'khaled', role: 'DRIVER' });
    const m = (await login('manager1')).agent;
    const driver = (await login('ahmad')).agent;
    const other = (await login('khaled')).agent;

    // 1) المورد ينشئ الطلب: الرقم الموحّد، الأجرة الافتراضية (3)، المبلغ المطلوب = 30 + 3
    const created = await supplier.post('/api/v1/vendor/delivery-orders').send({ ...orderBody, deliveryFee: 99 });
    expect(created.status).toBe(201);
    const order = created.body.data;
    expect(order.code).toMatch(/^FG-ORD-\d{6}$/);
    expect(order).toMatchObject({ deliveryStatus: 'NEW', total: 30, deliveryFee: 3, codAmount: 33, financialStatus: 'COD', pickupAddress: 'عمّان — ماركا، المستودع 3' });

    // 2) المدير: قبول ثم إسناد (يصل إشعار للموظف)
    await m.post(`/api/v1/admin/delivery/orders/${order.id}/status`).send({ status: 'ACCEPTED' });
    const assigned = await m.post(`/api/v1/admin/delivery/orders/${order.id}/assign`).send({ driverId: d1.driver!.id });
    expect(assigned.body.data.deliveryStatus).toBe('PICKUP_ASSIGNED');
    const notes = (await driver.get('/api/v1/notifications')).body.data;
    expect(notes.unread).toBe(1);
    expect(notes.items[0].title).toContain(order.code);
    // المدير لا يعدّل المبالغ بدون صلاحية
    expect((await m.patch(`/api/v1/admin/delivery/orders/${order.id}`).send({ deliveryFee: 0 })).status).toBe(400);

    // 3) الموظف يرى طلبه فقط، وبدون العمولات
    const list = (await driver.get('/api/v1/driver/orders')).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: order.code, amountToCollect: 33, supplierName: 'متجر الورد', pickupAddress: 'عمّان — ماركا، المستودع 3' });
    expect(list[0]).not.toHaveProperty('commissionTotal');
    expect((await other.get(`/api/v1/driver/orders/${order.id}`)).status).toBe(404);
    expect((await other.post(`/api/v1/driver/orders/${order.id}/status`).send({ status: 'PICKED_UP' })).status).toBe(404);

    const step = (status: string, extra: Record<string, unknown> = {}) => driver.post(`/api/v1/driver/orders/${order.id}/status`).send({ status, ...extra });
    expect((await driver.post(`/api/v1/driver/orders/${order.id}/accept`)).body.data.accepted).toBe(true);
    // لا قفز فوق المسار ولا تسليم بدون إثبات
    expect((await step('ARRIVED')).status).toBe(409);
    expect((await step('DELIVERED')).status).toBe(400);
    expect((await step('PICKED_UP', { lat: 31.95, lng: 35.91 })).body.data.deliveryStatus).toBe('PICKED_UP');
    expect((await step('IN_TRANSIT')).body.data.deliveryStatus).toBe('IN_TRANSIT');
    expect((await step('ARRIVED')).body.data.deliveryStatus).toBe('ARRIVED');

    // 4) OTP: يصل للعميل (إشعار داخل حسابه) ولا يراه الموظف؛ الرمز الخاطئ مرفوض
    const otp = await driver.post(`/api/v1/driver/orders/${order.id}/otp`);
    expect(otp.status).toBe(200);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone: '962795551234' } });
    const otpNote = await prisma.notification.findFirstOrThrow({ where: { recipientType: 'CUSTOMER', recipientId: customer.id, title: 'رمز استلام الطلب' } });
    const code = /:\s*(\d{4})\./.exec(otpNote.body)![1];
    const seen = (await driver.get(`/api/v1/driver/orders/${order.id}`)).body.data;
    expect(seen).not.toHaveProperty('otpHash');
    expect(JSON.stringify(seen)).not.toContain(otpNote.body);
    expect((await driver.get('/api/v1/notifications')).body.data.items.some((n: { title: string }) => n.title === 'رمز استلام الطلب')).toBe(false);
    const wrong = await driver.post(`/api/v1/driver/orders/${order.id}/deliver`).send({ recipientName: 'سامي', otp: code === '0000' ? '1111' : '0000', amountCollected: 33 });
    expect(wrong.status).toBe(400);

    // المبلغ لا يتجاوز المطلوب
    const over = await driver.post(`/api/v1/driver/orders/${order.id}/deliver`).send({ recipientName: 'سامي', signature: SIGNATURE, amountCollected: 50 });
    expect(over.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deliveryStatus).toBe('ARRIVED');

    // 5) تم التسليم بإثبات (توقيع + OTP + GPS) مع التحصيل الكامل
    const delivered = await driver
      .post(`/api/v1/driver/orders/${order.id}/deliver`)
      .send({ recipientName: 'سامي', signature: SIGNATURE, otp: code, amountCollected: 33, lat: 31.99, lng: 35.87, accuracy: 12 });
    expect(delivered.body.error).toBeNull();
    expect(delivered.body.data).toMatchObject({ deliveryStatus: 'PAYMENT_COLLECTED', financialStatus: 'COLLECTED', codCollected: 33 });
    const proof = await prisma.deliveryProof.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(proof).toMatchObject({ recipientName: 'سامي', otpVerified: true, lat: 31.99 });
    expect(proof.signatureUrl).toContain('/uploads/delivery-proofs/');
    // الموظف لا يعدّل التحصيل بعد تسجيله، والإثبات لا يعدّله إلا صاحب الصلاحية
    expect((await driver.post(`/api/v1/driver/orders/${order.id}/collect`).send({ amount: 10 })).status).toBe(409);
    expect((await m.patch(`/api/v1/admin/delivery/orders/${order.id}/proof`).send({ recipientName: 'آخر' })).status).toBe(403);
    expect((await admin.patch(`/api/v1/admin/delivery/orders/${order.id}/proof`).send({ recipientName: 'سامي خليل' })).status).toBe(200);

    // 6) الإغلاق من المدير
    const done = await m.post(`/api/v1/admin/delivery/orders/${order.id}/status`).send({ status: 'COMPLETED' });
    expect(done.body.data.deliveryStatus).toBe('COMPLETED');

    // السجل: كل تغيير بالمستخدم والحالة السابقة والجديدة
    const detail = (await m.get(`/api/v1/admin/delivery/orders/${order.id}`)).body.data;
    const moves = detail.statusEvents.filter((e: { fromStatus: string; toStatus: string }) => e.fromStatus !== e.toStatus).map((e: { toStatus: string }) => e.toStatus);
    expect(moves).toEqual(['NEW', 'ACCEPTED', 'PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'PAYMENT_COLLECTED', 'COMPLETED']);
    const pickedUp = detail.statusEvents.find((e: { toStatus: string }) => e.toStatus === 'PICKED_UP');
    expect(pickedUp).toMatchObject({ actorName: 'أحمد', fromStatus: 'PICKUP_ASSIGNED', lat: 31.95 });
    expect(detail.collectedBy.name).toBe('أحمد');

    // المورد يرى طلبه وسجله، ووصلته إشعارات الاستلام والتسليم
    const mine = (await supplier.get(`/api/v1/vendor/delivery-orders/${order.id}`)).body.data;
    expect(mine.deliveryStatus).toBe('COMPLETED');
    const vendorNotes = await prisma.notification.findMany({ where: { recipientType: 'VENDOR', recipientId: vendor.id } });
    expect(vendorNotes.map((n) => n.title).join(' | ')).toMatch(/تم الاستلام من المورد[\s\S]*تم التسليم|تم التسليم[\s\S]*تم الاستلام من المورد/);

    // تتبّع عام: رقم الطلب + الهاتف فقط
    expect((await request(app).get('/api/v1/track').query({ code: order.code, phone: '0790000000' })).status).toBe(404);
    const track = (await request(app).get('/api/v1/track').query({ code: order.code, phone: '0795551234' })).body.data;
    expect(track).toMatchObject({ code: order.code, status: 'COMPLETED' });
    expect(JSON.stringify(track)).not.toContain('الجبيهة');

    // الإحصائيات والتقارير
    const stats = (await m.get('/api/v1/admin/delivery/stats')).body.data;
    expect(stats).toMatchObject({ total: 1, collected: 33, uncollected: 0 });
    expect(stats.buckets.delivered).toBe(1);
    expect(stats.drivers.find((x: { name: string }) => x.name === 'أحمد')).toMatchObject({ delivered: 1, successRate: 100, collected: 33 });
    const rep = (await admin.get('/api/v1/admin/reports/dm_orders')).body.data;
    expect(rep.totals).toMatchObject({ count: 1, products: 30, fee: 3, due: 33, collected: 33 });
    const xlsx = await admin.get('/api/v1/admin/reports/dm_drivers?format=xlsx&lang=ar').buffer(true);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(Number(xlsx.headers['content-length'] ?? xlsx.body.length)).toBeGreaterThan(1000);
  });

  it('تعذّر التسليم يتطلب السبب، والمدير يعيد الجدولة ويسند لموظف آخر', async () => {
    const { agent: supplier } = await createVendor(admin, { name: 'متجر', phone: '0783333333' });
    const d1 = await createUser({ name: 'أحمد', username: 'ahmad', role: 'DRIVER' });
    const d2 = await createUser({ name: 'خالد', username: 'khaled', role: 'DRIVER' });
    const driver = (await login('ahmad')).agent;
    const o = (await supplier.post('/api/v1/vendor/delivery-orders').send(orderBody)).body.data;
    await admin.post(`/api/v1/admin/delivery/orders/${o.id}/assign`).send({ driverId: d1.driver!.id });
    await driver.post(`/api/v1/driver/orders/${o.id}/status`).send({ status: 'PICKED_UP' });
    expect((await driver.post(`/api/v1/driver/orders/${o.id}/status`).send({ status: 'CUSTOMER_NOT_AVAILABLE' })).status).toBe(400);
    const failed = await driver.post(`/api/v1/driver/orders/${o.id}/status`).send({ status: 'CUSTOMER_NOT_AVAILABLE', note: 'لم يرد على الهاتف' });
    expect(failed.body.data.deliveryStatus).toBe('CUSTOMER_NOT_AVAILABLE');
    await admin.post(`/api/v1/admin/delivery/orders/${o.id}/status`).send({ status: 'RESCHEDULED', note: 'غدًا صباحًا' });
    const re = await admin.post(`/api/v1/admin/delivery/orders/${o.id}/assign`).send({ driverId: d2.driver!.id });
    expect(re.body.data).toMatchObject({ deliveryStatus: 'PICKUP_ASSIGNED', driverId: d2.driver!.id });
    // الموظف الأول لم يعد يرى الطلب
    expect((await driver.get(`/api/v1/driver/orders/${o.id}`)).status).toBe(404);
    const failedReport = (await admin.get('/api/v1/admin/reports/dm_failed?status=')).body.data;
    expect(failedReport.rows).toHaveLength(0); // أُعيد إسناده فلم يعد متعثرًا
    const assigns = await prisma.deliveryAssignment.findMany({ where: { orderId: o.id }, orderBy: { assignedAt: 'asc' } });
    expect(assigns.map((a) => a.status)).toEqual(['UNASSIGNED', 'ASSIGNED']);
  });

  it('المورد يلغي طلبه قبل خروجه فقط، ولا يرى طلبات موردين آخرين', async () => {
    const { agent: s1 } = await createVendor(admin, { name: 'متجر 1', phone: '0784444444' });
    const { agent: s2 } = await createVendor(admin, { name: 'متجر 2', phone: '0785555555' });
    const d = await createUser({ name: 'أحمد', username: 'ahmad', role: 'DRIVER' });
    const o1 = (await s1.post('/api/v1/vendor/delivery-orders').send(orderBody)).body.data;
    const o2 = (await s1.post('/api/v1/vendor/delivery-orders').send(orderBody)).body.data;
    expect((await s2.get(`/api/v1/vendor/delivery-orders/${o1.id}`)).status).toBe(404);
    expect((await s2.post(`/api/v1/vendor/delivery-orders/${o1.id}/cancel`)).status).toBe(404);
    expect((await s1.post(`/api/v1/vendor/delivery-orders/${o1.id}/cancel`)).body.data.deliveryStatus).toBe('CANCELLED');
    await admin.post(`/api/v1/admin/delivery/orders/${o2.id}/assign`).send({ driverId: d.driver!.id });
    expect((await s1.post(`/api/v1/vendor/delivery-orders/${o2.id}/cancel`)).status).toBe(409);
  });
});
