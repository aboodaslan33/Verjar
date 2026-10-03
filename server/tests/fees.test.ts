import { testOutbox } from '../src/services/email.service';
import { createAdmin, createCustomer, createVendor, prisma, resetDb } from './helpers';

type Agent = Awaited<ReturnType<typeof createAdmin>>;
const buyer = { name: 'مصنع الأغذية', phone: '0771234567', address: 'عمّان — سحاب' };

let admin: Agent;
let vendor: Awaited<ReturnType<typeof createVendor>>;
let categoryId: string;

async function product(name: string, supplierPrice: number, extra: Record<string, unknown> = {}) {
  const res = await vendor.agent.post('/api/v1/vendor/products').send({ name, description: 'وصف', supplierPrice, stock: 600, categoryId, ...extra });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  await admin.post(`/api/v1/admin/store/products/${res.body.data.id}/approve`);
  return res.body.data as { id: string; price: number; finalPrice: number; supplierPrice: number; platformFeePercent: number };
}

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  categoryId = (await admin.post('/api/v1/admin/store/categories').send({ name: 'مضخات' })).body.data.id;
  vendor = await createVendor(admin, { name: 'مصنع المضخات', phone: '0785550000' });
  await prisma.vendor.update({ where: { id: vendor.vendor.id }, data: { email: 'pumps@supplier.jo' } });
});
afterAll(() => prisma.$disconnect());

describe('نسبة فرجار لكل منتج', () => {
  it('السعر يُحسب في الخادم: 2% افتراضيًا، والمتصفح لا يحدد النسبة أو سعر العميل', async () => {
    // محاولة تمرير نسبة صفر وسعر عميل مزيف تُتجاهل
    const p = await product('مضخة', 100, { platformFeePercent: 0, price: 1, finalPrice: 1, feeAmount: 0 });
    expect(p).toMatchObject({ supplierPrice: 100, platformFeePercent: 2, price: 102, finalPrice: 102 });

    // تعديل المورد لا يغيّر النسبة، فقط سعره
    const upd = await vendor.agent.patch(`/api/v1/vendor/products/${p.id}`).send({ supplierPrice: 200, platformFeePercent: 0 });
    expect(upd.body.data).toMatchObject({ supplierPrice: 200, platformFeePercent: 2, price: 204 });

    // قائمة المورد: سعر المورد، النسبة، مبلغ فرجار، سعر العميل
    const list = (await vendor.agent.get('/api/v1/vendor/products')).body.data;
    expect(list.feePolicy).toBe('ADMIN_ONLY');
    expect(list.items[0].pricing).toMatchObject({ supplierPrice: 200, feePercent: 2, feeAmount: 4, customerPrice: 204 });

    // الإدارة تعدّل النسبة → سعر العميل يُعاد حسابه
    const admin5 = await admin.patch(`/api/v1/admin/store/products/${p.id}`).send({ platformFeePercent: 5 });
    expect(admin5.body.data).toMatchObject({ platformFeePercent: 5, price: 210 });

    // طلب تغيير النسبة ممنوع ما دامت السياسة "الإدارة فقط"
    expect((await vendor.agent.post(`/api/v1/vendor/products/${p.id}/fee-request`).send({ percent: 1 })).status).toBe(403);
  });

  it('سياسة "يحق للمورد طلب التغيير": الطلب يصل للإدارة والموافقة تطبّق النسبة', async () => {
    await admin.put('/api/v1/admin/settings').send({ platformFeeEditPolicy: 'SUPPLIER_REQUEST' });
    const p = await product('مضخة', 100);
    expect((await vendor.agent.post(`/api/v1/vendor/products/${p.id}/fee-request`).send({ percent: 1.5, note: 'كميات كبيرة' })).status).toBe(200);
    const pending = (await admin.get('/api/v1/admin/store/products?feeRequest=true')).body.data.items;
    expect(pending).toHaveLength(1);
    expect(pending[0].feeRequestPercent).toBe(1.5);
    const ok = await admin.post(`/api/v1/admin/store/products/${p.id}/fee-request/approve`);
    expect(ok.body.data).toMatchObject({ platformFeePercent: 1.5, price: 101.5, feeRequestPercent: null });
  });

  it('السلة المختلطة: نسبة كل منتج على حدة، والطلب يثبّت القيم ولا يتأثر بتغيير النسبة لاحقًا', async () => {
    const a = await product('منتج أ', 100);
    const b = await product('منتج ب', 200);
    const c = await product('منتج ج', 500);
    await admin.patch(`/api/v1/admin/store/products/${b.id}`).send({ platformFeePercent: 5 });
    await admin.patch(`/api/v1/admin/store/products/${c.id}`).send({ platformFeePercent: 8 });

    testOutbox.length = 0;
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const res = await shopper.post('/api/v1/store/orders').send({
      ...buyer,
      // سعر العميل من المتصفح يُتجاهل
      items: [{ productId: a.id, quantity: 1, price: 1 }, { productId: b.id, quantity: 1 }, { productId: c.id, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    // 102 + 210 + 540
    expect(res.body.data.total).toBe(852);
    const items = await prisma.orderItem.findMany({ where: { orderId: res.body.data.id } });
    const fees = items.reduce((n, i) => n + i.platformFeeAmount!.toNumber(), 0);
    // 2 + 10 + 40
    expect(fees).toBe(52);
    expect(items.reduce((n, i) => n + i.vendorNet.toNumber(), 0)).toBe(800);

    // إشعار المورد داخل الموقع + بريد تلقائي
    const notes = await prisma.notification.findMany({ where: { recipientType: 'VENDOR', recipientId: vendor.vendor.id } });
    expect(notes.some((n) => n.title.startsWith('تم بيع منتجاتك') && n.body.includes('منتج أ × 1'))).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const mail = testOutbox.find((m) => m.to === 'pumps@supplier.jo');
    expect(mail?.subject).toContain('تم بيع منتجاتك');
    expect(mail?.text).toContain('800');

    // رفع نسبة أ من 2% إلى 7% لا يغيّر الطلب السابق
    await admin.patch(`/api/v1/admin/store/products/${a.id}`).send({ platformFeePercent: 7 });
    const lineA = items.find((i) => i.productId === a.id)!;
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: lineA.id } })).platformFeeAmount!.toNumber()).toBe(2);

    // مالية المورد: المبيعات، نسبة فرجار، المسدد والمستحق، والتفصيل
    const fin = (await vendor.agent.get('/api/v1/vendor/fees')).body.data;
    expect(fin.totals).toMatchObject({ sales: 852, fees: 52, feesSettled: 0, feesOutstanding: 52, supplierNet: 800 });
    expect(fin.byProduct.find((r: { productId: string }) => r.productId === c.id)).toMatchObject({ units: 1, sales: 540, fees: 40, remaining: 599 });
    expect(fin.byOrder).toHaveLength(3);

    // المباع والمتبقي على كل منتج
    const list = (await vendor.agent.get('/api/v1/vendor/products')).body.data.items;
    expect(list.find((p: { id: string }) => p.id === a.id)).toMatchObject({ soldUnits: 1, remaining: 599 });

    // تقرير الإدارة مع الفلاتر
    const all = (await admin.get('/api/v1/admin/reports/fees/overview')).body.data;
    expect(all.totals.fees).toBe(52);
    expect(all.bySupplier[0]).toMatchObject({ vendorId: vendor.vendor.id, fees: 52 });
    const high = (await admin.get('/api/v1/admin/reports/fees/overview?feeMin=5')).body.data;
    expect(high.totals.fees).toBe(50);
    expect((await admin.get(`/api/v1/admin/reports/fees/overview?productId=${b.id}`)).body.data.totals.fees).toBe(10);
    const csv = await admin.get('/api/v1/admin/reports/platform_fees?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('منتج ج');
  });

  it('أولوية النسبة عند الإنشاء: المورد ← القسم ← الافتراضي العام', async () => {
    await admin.put('/api/v1/admin/settings').send({ platformFeeDefault: 3 });
    expect((await product('افتراضي', 100)).platformFeePercent).toBe(3);
    await admin.patch(`/api/v1/admin/store/categories/${categoryId}`).send({ platformFeePercent: 4 });
    expect((await product('حسب القسم', 100)).platformFeePercent).toBe(4);
    await admin.patch(`/api/v1/admin/vendors/${vendor.vendor.id}`).send({ platformFeePercent: 6 });
    expect((await product('حسب المورد', 100)).platformFeePercent).toBe(6);
  });
});
