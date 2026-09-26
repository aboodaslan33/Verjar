import request from 'supertest';
import { app, createAdmin, createCustomer, createProduct, prisma, resetDb } from './helpers';

const customer = { name: 'سارة خليل', phone: '0771234567', address: 'عمّان — عبدون', notes: 'الاتصال قبل التوصيل' };

let user: Awaited<ReturnType<typeof createCustomer>>;
beforeEach(async () => {
  await resetDb();
  user = await createCustomer({ name: customer.name, phone: customer.phone });
});
afterAll(() => prisma.$disconnect());

describe('المتجر', () => {
  it('يعرض المنتجات الظاهرة فقط مع السعر قبل وبعد الخصم', async () => {
    await createProduct({ name: 'كرسي حديقة', price: 50, discountPercent: 10 });
    await createProduct({ name: 'مخفي', visible: false });
    const res = await request(app).get('/api/v1/store/products');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    const p = res.body.data.items[0];
    expect(p.price).toBe(50);
    expect(p.finalPrice).toBe(45);
    expect(p.discountPercent).toBe(10);
  });
});

describe('POST /api/v1/store/orders', () => {
  it('ينشئ الطلب بأسعار السيرفر ويولّد رسالة واتساب بالصيغة المعتمدة ويخصم المخزون', async () => {
    const chair = await createProduct({ name: 'كرسي حديقة', price: 50, discountPercent: 10, stock: 5 });
    const res = await user
      .post('/api/v1/store/orders')
      .send({ ...customer, items: [{ productId: chair.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.number).toBeGreaterThanOrEqual(1000);
    expect(d.subtotal).toBe(100);
    expect(d.discountTotal).toBe(10);
    expect(d.total).toBe(90);
    expect(d.message).toContain(`طلب جديد #${d.number} — فرجار قروب`);
    expect(d.message).toContain('- كرسي حديقة × 2 = 90 د.أ (بعد خصم 10%)');
    expect(d.message).toContain('المجموع قبل الخصم: 100 د.أ');
    expect(d.message).toContain('الخصم: 10 د.أ');
    expect(d.message).toContain('الإجمالي: 90 د.أ');
    expect(d.whatsapp.link.startsWith('https://wa.me/962780192930?text=')).toBe(true);
    expect(decodeURIComponent(d.whatsapp.link.split('text=')[1])).toBe(d.message);

    const after = await prisma.product.findUnique({ where: { id: chair.id } });
    expect(after?.stock).toBe(3);
  });

  it('يرفض الطلب إذا تجاوزت الكمية المخزون ولا يُنشئ شيئًا', async () => {
    const p = await createProduct({ stock: 1 });
    const res = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 3 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('1 فقط');
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.stock).toBe(1);
  });

  it('يرفض سلة فارغة وهاتفًا غير صحيح', async () => {
    const res = await user.post('/api/v1/store/orders').send({ ...customer, phone: '12', items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.items).toBe('السلة فارغة');
    expect(res.body.error.fields.phone).toBeDefined();
  });

  it('حد الكمية لكل منتج وحد الطلبات المفتوحة', async () => {
    const p = await createProduct({ stock: 100 });
    const big = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 21 }] });
    expect(big.status).toBe(400);
    for (let i = 0; i < 3; i++) {
      expect((await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 1 }] })).status).toBe(201);
    }
    const fourth = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 1 }] });
    expect(fourth.status).toBe(429);
  });

  it('لا طلب بدون تسجيل دخول', async () => {
    const p = await createProduct();
    const res = await request(app).post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(401);
    expect(await prisma.order.count()).toBe(0);
  });

  it('يرفض المنتجات المخفية', async () => {
    const p = await createProduct({ visible: false });
    const res = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it('الأدمن يلغي الطلب فيعود المخزون، والعميل يرى الطلب في حسابه', async () => {
    const p = await createProduct({ stock: 4, price: 20, discountPercent: 0 });
    const order = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 4 }] });
    expect(order.status).toBe(201);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.stock).toBe(0);

    const admin = await createAdmin();
    const list = await admin.get('/api/v1/admin/orders').query({ status: 'NEW' });
    expect(list.body.data.total).toBe(1);

    const cancel = await admin.patch(`/api/v1/admin/orders/${order.body.data.id}`).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: p.id } }))?.stock).toBe(4);

    const resend = await admin.post(`/api/v1/admin/orders/${order.body.data.id}/whatsapp`).send({ to: 'admin' });
    expect(resend.body.data.link).toContain('wa.me/962780192930');

    const overview = await user.get('/api/v1/account/overview');
    expect(overview.body.data.orders[0].status).toBe('CANCELLED');
    expect(overview.body.data.finance.billed).toBe(0);
  });

  it('المالية: إضافة دفعة وحساب المتبقي', async () => {
    const p = await createProduct({ stock: 10, price: 100, discountPercent: 0 });
    const order = await user.post('/api/v1/store/orders').send({ ...customer, items: [{ productId: p.id, quantity: 2 }] });
    const admin = await createAdmin();
    const c = await prisma.customer.findUniqueOrThrow({ where: { phone: '962771234567' } });
    const pay = await admin
      .post('/api/v1/admin/finance/payments')
      .send({ customerId: c.id, amount: 150, method: 'CLIQ', orderId: order.body.data.id });
    expect(pay.status).toBe(201);
    expect(pay.body.data.summary).toEqual({ billed: 200, paid: 150, remaining: 50 });

    const fin = await admin.get('/api/v1/admin/finance/customers');
    expect(fin.body.data.items[0].remaining).toBe(50);
    const csv = await admin.get('/api/v1/admin/finance/export').query({ kind: 'customers' });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('سارة خليل');
  });
});
