import request from 'supertest';
import { PNG_1PX, app, createAdmin, createCustomer, createProduct, createVendor, prisma, resetDb } from './helpers';

type Agent = Awaited<ReturnType<typeof createAdmin>>;
const buyer = { name: 'سارة خليل', phone: '0771234567', address: 'عمّان — عبدون' };

let admin: Agent;
let clothes: { id: string };
let men: { id: string };

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  clothes = (
    await admin.post('/api/v1/admin/store/categories').send({
      name: 'ملابس',
      specFields: [{ key: 'size', label: 'المقاس', type: 'select', options: ['S', 'M', 'L'], required: true }],
    })
  ).body.data;
  men = (
    await admin.post('/api/v1/admin/store/categories').send({
      name: 'رجالي',
      parentId: clothes.id,
      specFields: [{ key: 'color', label: 'اللون', type: 'text' }],
    })
  ).body.data;
});
afterAll(() => prisma.$disconnect());

async function vendorProduct(agent: Agent, data: Partial<{ name: string; price: number; stock: number; specs: Record<string, string> }> = {}) {
  const res = await agent.post('/api/v1/vendor/products').send({
    name: data.name ?? 'قميص قطن',
    description: 'قميص قطني',
    price: data.price ?? 20,
    stock: data.stock ?? 10,
    categoryId: men.id,
    specs: data.specs ?? { size: 'M', color: 'أزرق' },
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data as { id: string; slug: string; approvalStatus: string; price: number; platformFeePercent: number };
}

describe('الأقسام الديناميكية', () => {
  it('قسم فرعي يرث حقول المواصفات، ولا يُسمح بمستوى ثالث', async () => {
    const third = await admin.post('/api/v1/admin/store/categories').send({ name: 'قمصان', parentId: men.id });
    expect(third.status).toBe(400);
    const { agent } = await createVendor(admin, { name: 'متجر الأناقة', phone: '0781111111' });
    const cats = (await agent.get('/api/v1/vendor/categories')).body.data;
    const sub = cats.find((c: { id: string }) => c.id === men.id);
    expect(sub.fields.map((f: { key: string }) => f.key)).toEqual(['size', 'color']);
  });

  it('إخفاء القسم الرئيسي يخفي منتجات أقسامه الفرعية', async () => {
    const { agent } = await createVendor(admin, { name: 'متجر الأناقة', phone: '0781111111' });
    const p = await vendorProduct(agent);
    await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);
    expect((await request(app).get('/api/v1/store/products')).body.data.total).toBe(1);
    await admin.patch(`/api/v1/admin/store/categories/${clothes.id}`).send({ visible: false });
    expect((await request(app).get('/api/v1/store/products')).body.data.total).toBe(0);
  });
});

describe('صلاحية المورد', () => {
  it('الأدمن يمنح الصلاحية بعمولة افتراضية 10% ويسحبها فتتوقف اللوحة وتختفي المنتجات', async () => {
    const { agent, vendor } = await createVendor(admin, { name: 'متجر الأناقة', phone: '0781111111' });
    const me = await agent.get('/api/v1/vendor/me');
    expect(me.status).toBe(200);
    expect(me.body.data.vendor.commissionPercent).toBe(10);
    expect((await agent.get('/api/v1/auth/me')).body.data.vendor.slug).toBe(vendor.slug);

    const p = await vendorProduct(agent);
    await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);
    expect((await request(app).get('/api/v1/store/products')).body.data.total).toBe(1);

    await admin.patch(`/api/v1/admin/vendors/${vendor.id}`).send({ active: false });
    expect((await agent.get('/api/v1/vendor/me')).status).toBe(403);
    expect((await agent.get('/api/v1/auth/me')).body.data.vendor).toBeNull();
    expect((await request(app).get('/api/v1/store/products')).body.data.total).toBe(0);
    expect((await request(app).get(`/api/v1/store/vendors/${vendor.slug}`)).status).toBe(404);
  });

  it('العميل العادي والأدمن لا يدخلون لوحة المورد', async () => {
    const customer = await createCustomer({ phone: '0791112223' });
    expect((await customer.get('/api/v1/vendor/me')).status).toBe(403);
    expect((await admin.get('/api/v1/vendor/me')).status).toBe(403);
    expect((await request(app).get('/api/v1/vendor/me')).status).toBe(401);
  });

  it('المورد لا يرى ولا يعدّل منتجات أو طلبات مورد آخر', async () => {
    const a = await createVendor(admin, { name: 'متجر أ', phone: '0781111111' });
    const b = await createVendor(admin, { name: 'متجر ب', phone: '0782222222' });
    const pa = await vendorProduct(a.agent, { name: 'منتج أ' });
    await vendorProduct(b.agent, { name: 'منتج ب' });

    expect((await b.agent.get(`/api/v1/vendor/products/${pa.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/v1/vendor/products/${pa.id}`).send({ price: 1 })).status).toBe(404);
    expect((await b.agent.delete(`/api/v1/vendor/products/${pa.id}`)).status).toBe(404);
    expect((await b.agent.post(`/api/v1/vendor/products/${pa.id}/media`).attach('files', PNG_1PX, 'a.png')).status).toBe(404);
    const list = (await b.agent.get('/api/v1/vendor/products')).body.data;
    expect(list.items.map((p: { name: string }) => p.name)).toEqual(['منتج ب']);

    await admin.post(`/api/v1/admin/store/products/${pa.id}/approve`);
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: pa.id, quantity: 1 }] });
    const voA = (await a.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    expect((await b.agent.get('/api/v1/vendor/orders')).body.data.total).toBe(0);
    expect((await b.agent.get(`/api/v1/vendor/orders/${voA.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/v1/vendor/orders/${voA.id}`).send({ status: 'CANCELLED' })).status).toBe(404);
    // لا يستطيع المورد تغيير المورد أو الاعتماد بنفسه
    const sneaky = await a.agent.patch(`/api/v1/vendor/products/${pa.id}`).send({ vendorId: b.vendor.id, approvalStatus: 'APPROVED', featured: true });
    expect(sneaky.status).toBe(200);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: pa.id } });
    expect(after.vendorId).toBe(a.vendor.id);
    expect(after.featured).toBe(false);
  });
});

describe('مراجعة منتجات الموردين', () => {
  it('المنتج الجديد لا يظهر قبل الموافقة، والرفض يحفظ السبب، وتعديل المحتوى يعيده للمراجعة', async () => {
    const { agent, vendor } = await createVendor(admin, { name: 'متجر الأناقة', phone: '0781111111' });
    const p = await vendorProduct(agent);
    expect(p.approvalStatus).toBe('PENDING');
    expect((await request(app).get('/api/v1/store/products')).body.data.total).toBe(0);
    expect((await request(app).get(`/api/v1/store/products/${p.slug}`)).status).toBe(404);

    const pending = await admin.get('/api/v1/admin/store/products?approval=PENDING');
    expect(pending.body.data.items[0].vendor.name).toBe('متجر الأناقة');

    const rej = await admin.post(`/api/v1/admin/store/products/${p.id}/reject`).send({ reason: 'الصور غير واضحة' });
    expect(rej.body.data.approvalStatus).toBe('REJECTED');
    expect((await agent.get(`/api/v1/vendor/products/${p.id}`)).body.data.rejectionReason).toBe('الصور غير واضحة');

    // أي تعديل على المرفوض يعيد إرساله للمراجعة
    expect((await agent.patch(`/api/v1/vendor/products/${p.id}`).send({ stock: 5 })).body.data.approvalStatus).toBe('PENDING');
    await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);

    // السعر والمخزون لا يحتاجان مراجعة، الاسم يحتاج
    expect((await agent.patch(`/api/v1/vendor/products/${p.id}`).send({ price: 25, stock: 3 })).body.data.approvalStatus).toBe('APPROVED');
    expect((await agent.patch(`/api/v1/vendor/products/${p.id}`).send({ name: 'قميص كتان' })).body.data.approvalStatus).toBe('PENDING');
    await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);

    const page = await request(app).get(`/api/v1/store/products/${(await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data.product.vendor.slug).toBe(vendor.slug);
    expect(page.body.data.product.specList).toEqual([
      { key: 'size', label: 'المقاس', value: 'M' },
      { key: 'color', label: 'اللون', value: 'أزرق' },
    ]);
    const shop = await request(app).get(`/api/v1/store/vendors/${vendor.slug}`);
    expect(shop.body.data.productCount).toBe(1);
    expect((await request(app).get(`/api/v1/store/products?vendor=${vendor.slug}`)).body.data.total).toBe(1);
  });

  it('المواصفات تُتحقق حسب القسم', async () => {
    const { agent } = await createVendor(admin, { name: 'متجر الأناقة', phone: '0781111111' });
    const missing = await agent.post('/api/v1/vendor/products').send({ name: 'قميص', description: 'و', price: 10, categoryId: men.id, specs: {} });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields['specs.size']).toBe('المقاس مطلوب');
    const bad = await agent.post('/api/v1/vendor/products').send({ name: 'قميص', description: 'و', price: 10, categoryId: men.id, specs: { size: 'XXL' } });
    expect(bad.body.error.fields['specs.size']).toBe('اختر المقاس من القائمة');
    const extra = await vendorProduct(agent, { specs: { size: 'L', hacked: 'x' } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: extra.id } })).specs).toEqual({ size: 'L' });
  });
});

describe('الطلب متعدد الموردين', () => {
  it('ينقسم لطلب فرعي لكل مورد مع حفظ العمولة وقت البيع وخصم المخزون', async () => {
    const a = await createVendor(admin, { name: 'متجر أ', phone: '0781111111' });
    const b = await createVendor(admin, { name: 'متجر ب', phone: '0782222222', commissionPercent: 15 });
    const pa = await vendorProduct(a.agent, { name: 'قميص', price: 20, stock: 5 });
    const pb = await vendorProduct(b.agent, { name: 'بنطال', price: 40, stock: 5 });
    for (const p of [pa, pb]) await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);
    // النسبة لكل منتج: قميص بالافتراضي 2%، والإدارة ترفع البنطال إلى 5% → سعر العميل 42
    expect(pa.platformFeePercent).toBe(2);
    expect(pa.price).toBe(20.4);
    const setFee = await admin.patch(`/api/v1/admin/store/products/${pb.id}`).send({ platformFeePercent: 5 });
    expect(setFee.body.data.price).toBe(42);
    const house = await createProduct({ name: 'كرسي حديقة', price: 50, discountPercent: 10, stock: 5 });

    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const res = await shopper.post('/api/v1/store/orders').send({
      ...buyer,
      items: [
        { productId: pa.id, quantity: 2 },
        { productId: pb.id, quantity: 1 },
        { productId: house.id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    const d = res.body.data;
    // 2 × 20.4 + 42 + 45
    expect(d.total).toBe(127.8);
    expect(d.vendorOrders).toHaveLength(3);
    expect(d.message).toContain('[متجر أ — طلب فرعي #');
    expect(d.items[0].commissionAmount).toBeUndefined();

    const items = await prisma.orderItem.findMany({ where: { orderId: d.id } });
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    // لكل منتج نسبته: 2 × 20 × 2% = 0.8، و40 × 5% = 2
    expect(byName['قميص'].platformFeePercent!.toNumber()).toBe(2);
    expect(byName['قميص'].platformFeeAmount!.toNumber()).toBe(0.8);
    expect(byName['قميص'].supplierUnitPrice!.toNumber()).toBe(20);
    expect(byName['قميص'].commissionAmount.toNumber()).toBe(0.8);
    expect(byName['قميص'].vendorNet.toNumber()).toBe(40);
    expect(byName['بنطال'].platformFeePercent!.toNumber()).toBe(5);
    expect(byName['بنطال'].platformFeeAmount!.toNumber()).toBe(2);
    expect(byName['بنطال'].vendorNet.toNumber()).toBe(40);
    // المورد الافتراضي: كل الإيراد للشركة
    expect(byName['كرسي حديقة'].vendorNet.toNumber()).toBe(0);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: pa.id } })).stock).toBe(3);

    // تغيير النسبة لاحقًا (2% → 7%) لا يغيّر الطلبات السابقة
    await admin.patch(`/api/v1/admin/store/products/${pa.id}`).send({ platformFeePercent: 7 });
    const kept = await prisma.orderItem.findUniqueOrThrow({ where: { id: byName['قميص'].id } });
    expect(kept.platformFeeAmount!.toNumber()).toBe(0.8);
    expect(kept.platformFeePercent!.toNumber()).toBe(2);

    const vo = (await a.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    expect(vo.items).toHaveLength(1);
    expect(vo.vendorNet).toBe(40);
    expect(vo.order.address).toBe(buyer.address);

    const acc = (await shopper.get('/api/v1/account/overview')).body.data.orders[0];
    expect(acc.vendorOrders.map((v: { vendor: { name: string } }) => v.vendor.name).sort()).toEqual(['متجر أ', 'متجر ب', 'مجموعة فرجار'].sort());
  });

  it('إلغاء المورد لطلبه يُرجع المخزون، وحالة الطلب الرئيسي تُشتق من الطلبات الفرعية', async () => {
    const a = await createVendor(admin, { name: 'متجر أ', phone: '0781111111' });
    const b = await createVendor(admin, { name: 'متجر ب', phone: '0782222222' });
    const pa = await vendorProduct(a.agent, { stock: 5 });
    const pb = await vendorProduct(b.agent, { stock: 5 });
    for (const p of [pa, pb]) await admin.post(`/api/v1/admin/store/products/${p.id}/approve`);
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const order = (
      await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: pa.id, quantity: 2 }, { productId: pb.id, quantity: 1 }] })
    ).body.data;

    const voA = (await a.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    const voB = (await b.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    await a.agent.patch(`/api/v1/vendor/orders/${voA.id}`).send({ status: 'CANCELLED' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pa.id } })).stock).toBe(5);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('NEW');
    // المورد لا يعيد تفعيل طلب ملغي
    expect((await a.agent.patch(`/api/v1/vendor/orders/${voA.id}`).send({ status: 'CONFIRMED' })).status).toBe(400);

    await b.agent.patch(`/api/v1/vendor/orders/${voB.id}`).send({ status: 'COMPLETED' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('COMPLETED');

    // إلغاء الطلب كاملًا من الإدارة يُرجع مخزون كل الموردين
    await admin.patch(`/api/v1/admin/orders/${order.id}`).send({ status: 'CANCELLED', notify: false });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pb.id } })).stock).toBe(5);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pa.id } })).stock).toBe(5);
  });
});

describe('التقرير المالي والتسوية', () => {
  it('المستحق = صافي الطلبات المكتملة غير المسوّاة، و"تم الدفع" يسجّل التسوية ويقفل الطلبات', async () => {
    const a = await createVendor(admin, { name: 'متجر أ', phone: '0781111111' });
    const pa = await vendorProduct(a.agent, { price: 20, stock: 10 });
    await admin.post(`/api/v1/admin/store/products/${pa.id}/approve`);
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: pa.id, quantity: 2 }] });
    await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: pa.id, quantity: 1 }] });
    const [second, first] = (await a.agent.get('/api/v1/vendor/orders')).body.data.items;
    await a.agent.patch(`/api/v1/vendor/orders/${first.id}`).send({ status: 'COMPLETED' });

    const report = (await admin.get('/api/v1/admin/vendors/report')).body.data;
    const row = report.rows.find((r: { vendor: { id: string } }) => r.vendor.id === a.vendor.id);
    // 3 وحدات × 20.4 (سعر المورد 20 + فرجار 2%)
    expect(row.salesTotal).toBe(61.2);
    expect(row.commissionTotal).toBe(1.2);
    expect(row.vendorNetTotal).toBe(60);
    expect(row.due).toBe(40);
    expect(row.pending).toBe(20);

    expect((await admin.post(`/api/v1/admin/vendors/${a.vendor.id}/payouts`).send({ expectedAmount: 50 })).status).toBe(409);
    const payout = await admin.post(`/api/v1/admin/vendors/${a.vendor.id}/payouts`).send({ expectedAmount: 40, reference: 'TRX-1' });
    expect(payout.status).toBe(201);
    expect(payout.body.data.amount).toBe(40);
    expect(payout.body.data.commissionTotal).toBe(0.8);
    expect((await admin.post(`/api/v1/admin/vendors/${a.vendor.id}/payouts`).send({})).status).toBe(400);

    const earnings = (await a.agent.get('/api/v1/vendor/earnings')).body.data;
    expect(earnings.totals.due).toBe(0);
    expect(earnings.totals.paid).toBe(40);
    expect(earnings.payouts).toHaveLength(1);

    // الطلب المسوّى لا تتغير حالته
    expect((await a.agent.patch(`/api/v1/vendor/orders/${first.id}`).send({ status: 'CANCELLED' })).status).toBe(409);
    expect(second.status).toBe('NEW');
  });
});

describe('المتجر القديم', () => {
  it('منتجات الشركة للمورد الافتراضي وتظهر في صفحة متجره', async () => {
    await createProduct({ name: 'كرسي حديقة' });
    const list = (await request(app).get('/api/v1/store/products')).body.data;
    expect(list.items[0].vendor).toMatchObject({ slug: 'farja-group', isHouse: true });
    expect((await request(app).get('/api/v1/store/vendors/farja-group')).body.data.productCount).toBe(1);
    const created = await admin.post('/api/v1/admin/store/products').send({ name: 'طاولة', description: 'و', price: 30, categoryId: clothes.id, specs: { size: 'S' } });
    expect(created.status).toBe(201);
    expect(created.body.data.approvalStatus).toBe('APPROVED');
    expect(created.body.data.vendorId).toBe('house_vendor');
  });
});
