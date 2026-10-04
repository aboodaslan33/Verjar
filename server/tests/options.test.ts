import request from 'supertest';
import { PNG_1PX, app, createAdmin, createCustomer, createVendor, prisma, resetDb } from './helpers';

const buyer = { name: 'سارة خليل', phone: '0771234567', address: 'عمّان — عبدون' };

let admin: Awaited<ReturnType<typeof createAdmin>>;
let vendor: Awaited<ReturnType<typeof createVendor>>;
let categoryId: string;

beforeAll(async () => {
  await resetDb();
  admin = await createAdmin();
  categoryId = (await admin.post('/api/v1/admin/store/categories').send({ name: 'أثاث' })).body.data.id;
  vendor = await createVendor(admin, { name: 'معرض الكنب', phone: '0785550000' });
});
afterAll(() => prisma.$disconnect());

describe('خيارات المنتج (اللون…)', () => {
  let sofa: { id: string; slug: string };

  it('المورد يضيف خيارات وصورة لكل لون، والصورة يجب أن تكون من صور المنتج', async () => {
    const res = await vendor.agent.post('/api/v1/vendor/products').send({
      name: 'كنباية ثلاثية',
      description: 'كنباية مريحة',
      supplierPrice: 300,
      stock: 10,
      categoryId,
      options: [{ name: 'اللون', values: [{ label: 'أحمر', mediaId: 'not-a-media' }, { label: 'أزرق' }] }],
    });
    expect(res.status).toBe(201);
    sofa = res.body.data;
    // معرّف صورة لا يخص المنتج يُحذف
    expect(res.body.data.options[0].values[0]).toEqual({ label: 'أحمر', mediaId: null });

    const up = await vendor.agent.post(`/api/v1/vendor/products/${sofa.id}/media`).attach('files', PNG_1PX, { filename: 'red.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const redImage = up.body.data[0].id;
    const upd = await vendor.agent.patch(`/api/v1/vendor/products/${sofa.id}`).send({
      options: [{ name: 'اللون', values: [{ label: 'أحمر', mediaId: redImage }, { label: 'أزرق' }] }],
    });
    expect(upd.body.data.options[0].values[0].mediaId).toBe(redImage);

    // تكرار القيم مرفوض
    const dup = await vendor.agent.patch(`/api/v1/vendor/products/${sofa.id}`).send({ options: [{ name: 'اللون', values: [{ label: 'أحمر' }, { label: 'أحمر' }] }] });
    expect(dup.status).toBe(400);

    await admin.post(`/api/v1/admin/store/products/${sofa.id}/approve`);
    const pub = await request(app).get(`/api/v1/store/products/${sofa.slug}`);
    expect(pub.body.data.product.options[0].values.map((v: { label: string }) => v.label)).toEqual(['أحمر', 'أزرق']);
  });

  it('العميل يجب أن يختار اللون، والطلب يحفظ اختياره ويعرضه', async () => {
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const none = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: sofa.id, quantity: 1 }] });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toContain('اختر اللون');
    const bad = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: sofa.id, quantity: 1, options: [{ name: 'اللون', value: 'أخضر' }] }] });
    expect(bad.status).toBe(400);

    const ok = await shopper.post('/api/v1/store/orders').send({
      ...buyer,
      items: [
        { productId: sofa.id, quantity: 2, options: [{ name: 'اللون', value: 'أحمر' }] },
        { productId: sofa.id, quantity: 1, options: [{ name: 'اللون', value: 'أزرق' }] },
      ],
    });
    expect(ok.status).toBe(201);
    const items = await prisma.orderItem.findMany({ where: { orderId: ok.body.data.id }, orderBy: { quantity: 'desc' } });
    expect(items.map((i) => [i.variant, i.quantity])).toEqual([
      ['اللون: أحمر', 2],
      ['اللون: أزرق', 1],
    ]);
    expect(items[0].options).toEqual([{ name: 'اللون', value: 'أحمر' }]);
    // المخزون مشترك بين الألوان
    expect((await prisma.product.findUniqueOrThrow({ where: { id: sofa.id } })).stock).toBe(7);
    expect(ok.body.data.message).toContain('كنباية ثلاثية (اللون: أحمر) × 2');

    // المورد يرى اللون في طلبه وفي الإشعار
    const vo = (await vendor.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    const detail = (await vendor.agent.get(`/api/v1/vendor/orders/${vo.id}`)).body.data;
    expect(detail.items.map((i: { variant: string }) => i.variant).sort()).toEqual(['اللون: أحمر', 'اللون: أزرق']);
    const note = await prisma.notification.findFirst({ where: { recipientType: 'VENDOR', recipientId: vendor.vendor.id, title: { startsWith: 'تم بيع منتجاتك' } } });
    expect(note?.body).toContain('(اللون: أحمر) × 2');
  });

  it('المورد يرفع فيديو واحدًا فقط للمنتج', async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64)]);
    const v1 = await vendor.agent.post(`/api/v1/vendor/products/${sofa.id}/media`).attach('files', mp4, { filename: 'sofa.mp4', contentType: 'video/mp4' });
    expect(v1.status).toBe(201);
    expect(v1.body.data.some((m: { kind: string }) => m.kind === 'VIDEO')).toBe(true);
    const v2 = await vendor.agent.post(`/api/v1/vendor/products/${sofa.id}/media`).attach('files', mp4, { filename: 'again.mp4', contentType: 'video/mp4' });
    expect(v2.status).toBe(400);
  });

  it('مخزون منفصل لكل لون: المجموع مخزون المنتج، والطلب يخصم من لونه، والإلغاء يُرجعه', async () => {
    const res = await vendor.agent.post('/api/v1/vendor/products').send({
      name: 'كرسي مكتب',
      description: 'كرسي',
      supplierPrice: 50,
      stock: 999,
      categoryId,
      options: [{ name: 'اللون', values: [{ label: 'أحمر', stock: 4 }, { label: 'أزرق', stock: 6 }, { label: 'أسود' }] }],
    });
    expect(res.status).toBe(201);
    // المخزون يُحسب من الألوان، والقيمة بلا رقم = صفر
    expect(res.body.data.stock).toBe(10);
    expect(res.body.data.options[0].values.map((v: { stock: number }) => v.stock)).toEqual([4, 6, 0]);
    const chair = res.body.data as { id: string };
    // تعديل المخزون مباشرة لا يتجاوز الألوان
    expect((await vendor.agent.patch(`/api/v1/vendor/products/${chair.id}`).send({ stock: 500 })).body.data.stock).toBe(10);
    // خيار ثانٍ بمخزون منفصل مرفوض
    const two = await vendor.agent.patch(`/api/v1/vendor/products/${chair.id}`).send({
      options: [{ name: 'اللون', values: [{ label: 'أحمر', stock: 1 }] }, { name: 'المقاس', values: [{ label: 'L', stock: 1 }] }],
    });
    expect(two.status).toBe(400);
    await admin.post(`/api/v1/admin/store/products/${chair.id}/approve`);

    const shopper = await createCustomer({ name: 'خالد', phone: '0779990000' });
    const red = (q: number) => ({ productId: chair.id, quantity: q, options: [{ name: 'اللون', value: 'أحمر' }] });
    const tooMany = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [red(5)] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.message).toContain('المتوفر من "كرسي مكتب — أحمر" 4 فقط');
    const black = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: chair.id, quantity: 1, options: [{ name: 'اللون', value: 'أسود' }] }] });
    expect(black.body.error.message).toContain('غير متوفر');

    const ok = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [red(3)] });
    expect(ok.status).toBe(201);
    let p = await prisma.product.findUniqueOrThrow({ where: { id: chair.id } });
    expect(p.stock).toBe(7);
    expect((p.options as { values: { stock: number }[] }[])[0].values.map((v) => v.stock)).toEqual([1, 6, 0]);

    // إلغاء المورد للطلب يُرجع الأحمر
    // أحدث طلب فرعي للمورد هو هذا الطلب
    const vo = (await vendor.agent.get('/api/v1/vendor/orders')).body.data.items[0];
    expect((await vendor.agent.patch(`/api/v1/vendor/orders/${vo.id}`).send({ status: 'CANCELLED' })).status).toBe(200);
    p = await prisma.product.findUniqueOrThrow({ where: { id: chair.id } });
    expect(p.stock).toBe(10);
    expect((p.options as { values: { stock: number }[] }[])[0].values.map((v) => v.stock)).toEqual([4, 6, 0]);
  });
});
