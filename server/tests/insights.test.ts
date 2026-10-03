import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app, createAdmin, createCustomer, createProduct, createVendor, prisma, resetDb } from './helpers';
import { currentPeriod, periodKey, shiftPeriod } from '../src/insights/metrics';
import { runInsightJobs } from '../src/jobs/market';

/** إحصائيات المنصة الشهرية، التميز، المكافآت، والكوبونات — للـ Super Admin فقط */
describe('إحصائيات المنصة والتميز والمكافآت', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let vendorId: string;
  let vendorAgent: Awaited<ReturnType<typeof createCustomer>>;
  let buyer: Awaited<ReturnType<typeof createCustomer>>;
  let buyerId: string;
  let productId: string;
  const cur = periodKey(currentPeriod());
  const prev = periodKey(shiftPeriod(currentPeriod(), -1));

  const order = (agent: typeof buyer, items: { productId: string; quantity: number }[], extra: Record<string, unknown> = {}) =>
    agent.post('/api/v1/store/orders').send({ name: 'عميل', phone: '0791111111', address: 'عمّان', items, ...extra });

  beforeAll(async () => {
    await resetDb();
    admin = await createAdmin();
    const v = await createVendor(admin, { name: 'مصنع المضخات', phone: '0785550000', commissionPercent: 10 });
    vendorId = v.vendor.id;
    vendorAgent = v.agent;
    await prisma.vendor.update({ where: { id: vendorId }, data: { status: 'APPROVED' } });
    productId = (await createProduct({ name: 'مضخة مياه', price: 100, discountPercent: 0, stock: 50, vendorId })).id;
    buyer = await createCustomer({ name: 'مصنع الأغذية', phone: '0771234000', email: 'food@factory.jo' });
    buyerId = (await buyer.get('/api/v1/auth/me')).body.data.id;
  });
  afterAll(() => prisma.$disconnect());

  it('الإحصائيات الشهرية من الطلبات الفعلية، مع المقارنة بالشهر السابق وحفظ الأرشيف', async () => {
    // طلب في الشهر السابق (200) وطلبان هذا الشهر (300 + 100)
    const old = await order(buyer, [{ productId, quantity: 2 }]);
    expect(old.status).toBe(201);
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCDate(0);
    lastMonth.setUTCHours(10);
    await prisma.order.update({ where: { id: old.body.data.id }, data: { createdAt: lastMonth } });
    await prisma.vendorOrder.updateMany({ where: { orderId: old.body.data.id }, data: { createdAt: lastMonth } });
    expect((await order(buyer, [{ productId, quantity: 3 }])).status).toBe(201);
    const other = await createCustomer({ name: 'ورشة', phone: '0771234001' });
    expect((await order(other, [{ productId, quantity: 1 }])).status).toBe(201);

    const res = await admin.get(`/api/v1/admin/insights/period?period=${cur}`);
    expect(res.status).toBe(200);
    const m = res.body.data.metrics;
    expect(m).toMatchObject({ storeOrders: 2, storeSales: 400, productsSold: 4, avgOrderValue: 200, activeCustomers: 2, returningCustomers: 1, activeSuppliers: 1 });
    // عمولة 10% على مبيعات المورد = 40 → من إيرادات FARJAR
    expect(m.farjarCommissions).toBe(40);
    expect(res.body.data.breakdown.topProducts[0]).toMatchObject({ name: 'مضخة مياه', quantity: 4 });
    expect(res.body.data.breakdown.topSuppliers[0]).toMatchObject({ id: vendorId, sales: 400 });
    // النمو مقابل الشهر السابق: 200 → 400 = +100%
    expect(res.body.data.growth.totalSales).toMatchObject({ from: 200, to: 400, pct: 100 });

    // الشهر السابق يُجمَّد في الأرشيف ولا يتغير بتعديل لاحق إلا بإعادة حساب صريحة
    const p1 = await admin.get(`/api/v1/admin/insights/period?period=${prev}`);
    expect(p1.body.data).toMatchObject({ final: true, metrics: { storeSales: 200 } });
    const snap = await prisma.monthlySnapshot.findUniqueOrThrow({ where: { period: prev } });
    expect(snap.final).toBe(true);
    const cmp = await admin.get(`/api/v1/admin/insights/compare?a=${prev}&b=${cur}`);
    expect(cmp.body.data.growth.storeOrders ?? cmp.body.data.growth.totalOrders).toBeTruthy();
    const series = await admin.get('/api/v1/admin/insights/series?months=3');
    expect(series.body.data.points).toHaveLength(3);
    expect(series.body.data.bestSalesMonth.period).toBe(cur);
    expect((await admin.get('/api/v1/admin/insights/period?period=2999-01')).status).toBe(400);
    expect((await runInsightJobs()).rewardsExpired).toBe(0);

    const ov = await admin.get('/api/v1/admin/insights/overview');
    expect(ov.body.data.platform).toMatchObject({ totalSales: 600, totalSuppliers: 1 });
  });

  it('البيانات للـ Super Admin فقط', async () => {
    await prisma.user.create({ data: { email: 'staff@test.jo', name: 'موظف', passwordHash: await bcrypt.hash('Staff@12345', 4), role: 'STAFF' } });
    const staff = request.agent(app);
    expect((await staff.post('/api/v1/auth/admin/login').send({ email: 'staff@test.jo', password: 'Staff@12345' })).status).toBe(200);
    expect((await staff.get('/api/v1/admin/insights/overview')).status).toBe(403);
    expect((await staff.get('/api/v1/admin/insights/recognition')).status).toBe(403);
    expect((await buyer.get('/api/v1/admin/insights/overview')).status).toBe(403);
  });

  it('مورد الشهر: اقتراح من البيانات، اختيار يدوي، ومكافآت (شارة + Banner + اشتراك مجاني) مع إلغاء', async () => {
    const rec = await admin.get(`/api/v1/admin/insights/recognition?period=${cur}`);
    expect(rec.body.data.suppliers[0]).toMatchObject({ id: vendorId, sales: 400, orders: 2, customers: 2 });
    expect(rec.body.data.customers[0]).toMatchObject({ id: buyerId });
    // لا شيء يُمنح تلقائيًا
    expect(await prisma.reward.count()).toBe(0);

    const pick = await admin.post('/api/v1/admin/insights/recognition').send({
      kind: 'SUPPLIER',
      period: cur,
      vendorId,
      score: rec.body.data.suppliers[0],
      rewards: [
        { type: 'BADGE', title: 'مورد الشهر', durationDays: 30 },
        { type: 'HOME_BANNER', durationDays: 30 },
        { type: 'FREE_SUBSCRIPTION', planId: 'plan_pro', durationDays: 90 },
      ],
    });
    expect(pick.status).toBe(201);
    expect(pick.body.data.rewards).toHaveLength(3);
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, include: { plan: true } });
    expect(v.awardTitle).toBe('مورد الشهر');
    expect(v.plan?.code).toBe('PRO');
    expect(v.planExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 89 * 86400_000);
    // تظهر للعامة: مورد الشهر في الصفحة الرئيسية للسوق والشارة في الدليل
    const home = await request(app).get('/api/v1/market/home');
    expect(home.body.data.ads.supplierOfMonth.vendor.id).toBe(vendorId);
    const dir = await request(app).get('/api/v1/store/suppliers');
    expect(dir.body.data.featured[0]).toMatchObject({ id: vendorId, awardTitle: 'مورد الشهر' });
    // المورد يرى مكافآته فقط
    const vo = await vendorAgent.get('/api/v1/vendor/market/overview');
    expect(vo.body.data.award.title).toBe('مورد الشهر');
    expect(vo.body.data.rewards.length).toBe(3);
    expect(await prisma.notification.count({ where: { recipientId: vendorId, title: { contains: 'مكافأة' } } })).toBe(3);

    // اختيار ثانٍ لنفس الشهر ممنوع
    expect((await admin.post('/api/v1/admin/insights/recognition').send({ kind: 'SUPPLIER', period: cur, vendorId })).status).toBe(409);

    // إلغاء مكافأة الـ Banner: الإعلان ينتهي، ويبقى السجل في الأرشيف
    const banner = pick.body.data.rewards.find((r: { type: string }) => r.type === 'HOME_BANNER');
    expect((await admin.post(`/api/v1/admin/insights/rewards/${banner.id}/revoke`)).body.data.status).toBe('REVOKED');
    expect((await request(app).get('/api/v1/market/home')).body.data.ads.supplierOfMonth).toBeNull();
    const archive = await admin.get('/api/v1/admin/insights/archive');
    expect(archive.body.data[0]).toMatchObject({ period: cur });
    expect(archive.body.data[0].items[0].rewards).toHaveLength(3);
  });

  it('مكافآت المورد: منتجات إضافية وخصم على الاشتراك', async () => {
    await prisma.supplierPlan.update({ where: { id: 'plan_pro' }, data: { maxProducts: 1 } });
    await prisma.vendor.update({ where: { id: vendorId }, data: { planId: 'plan_pro' } });
    const g = await admin.post('/api/v1/admin/insights/rewards').send({ vendorId, reward: { type: 'EXTRA_PRODUCTS', value: 5, durationDays: 30 } });
    expect(g.status).toBe(201);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } })).extraProducts).toBe(5);
    const d = await admin.post('/api/v1/admin/insights/rewards').send({ vendorId, reward: { type: 'SUBSCRIPTION_DISCOUNT', value: 50, durationDays: 30 } });
    expect(d.status).toBe(201);
    // مكافأة المورد لا تُمنح لعميل والعكس
    expect((await admin.post('/api/v1/admin/insights/rewards').send({ customerId: buyerId, reward: { type: 'BADGE' } })).status).toBe(400);
    await prisma.supplierPlan.update({ where: { id: 'plan_pro' }, data: { maxProducts: 200 } });
  });

  it('عميل الشهر + كوبون VIP خاص به يُطبَّق عند الشراء مرة واحدة', async () => {
    const pick = await admin.post('/api/v1/admin/insights/recognition').send({
      kind: 'CUSTOMER',
      period: cur,
      customerId: buyerId,
      rewards: [{ type: 'COUPON', coupon: { code: 'VIP-FOOD', name: 'VIP Customer Coupon', type: 'PERCENT', value: 10, maxDiscount: 50, usageLimit: 1 }, durationDays: 30 }],
    });
    expect(pick.status).toBe(201);
    expect(await prisma.notification.count({ where: { recipientId: buyerId, body: { contains: 'VIP-FOOD' } } })).toBe(1);
    const mine = await buyer.get('/api/v1/account/rewards');
    expect(mine.body.data.recognitions[0]).toMatchObject({ period: cur, title: 'عميل الشهر' });
    expect(mine.body.data.coupons[0]).toMatchObject({ code: 'VIP-FOOD' });

    // عميل آخر لا يستطيع استخدامه
    const other = await createCustomer({ name: 'آخر', phone: '0771234009' });
    expect((await other.post('/api/v1/store/coupons/check').send({ code: 'vip-food', items: [{ productId, quantity: 1 }] })).status).toBe(400);
    // المعاينة: 10% من 600 = 60 → الحد الأقصى 50
    const chk = await buyer.post('/api/v1/store/coupons/check').send({ code: 'vip-food', items: [{ productId, quantity: 6 }] });
    expect(chk.body.data.discount).toBe(50);
    const o = await order(buyer, [{ productId, quantity: 6 }], { couponCode: 'VIP-FOOD', paymentMethod: 'COD' });
    expect(o.status).toBe(201);
    expect(Number(o.body.data.total)).toBe(550);
    expect(Number(o.body.data.couponDiscount)).toBe(50);
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: o.body.data.id }, include: { vendorOrders: true } });
    expect(Number(saved.codAmount)).toBe(550);
    // مستحقات المورد لا تتأثر بالكوبون
    expect(Number(saved.vendorOrders[0].total)).toBe(600);
    // استخدام ثانٍ مرفوض (نؤكد الطلبات المفتوحة أولًا حتى لا يمنعنا حد الطلبات المفتوحة)
    await prisma.order.updateMany({ where: { customerId: buyerId }, data: { status: 'CONFIRMED' } });
    const again = await order(buyer, [{ productId, quantity: 1 }], { couponCode: 'VIP-FOOD' });
    expect(again.status).toBe(400);
    expect((await buyer.get('/api/v1/account/rewards')).body.data.coupons).toHaveLength(0);
    const m = (await admin.get(`/api/v1/admin/insights/period?period=${cur}`)).body.data.metrics;
    expect(m.couponDiscounts).toBe(50);

    // كوبون عام من صفحة الكوبونات
    const c = await admin.post('/api/v1/admin/insights/coupons').send({ code: 'WELCOME5', name: 'ترحيب', type: 'FIXED', value: 5, usageLimit: 100 });
    expect(c.status).toBe(201);
    expect((await admin.post('/api/v1/admin/insights/coupons').send({ code: 'WELCOME5', name: 'كوبون', value: 5 })).status).toBe(409);
    expect((await admin.post('/api/v1/admin/insights/coupons').send({ code: 'BAD150', name: 'كوبون', type: 'PERCENT', value: 150 })).status).toBe(400);
    expect((await other.post('/api/v1/store/coupons/check').send({ code: 'welcome5', items: [{ productId, quantity: 1 }] })).body.data.discount).toBe(5);
    const list = await admin.get('/api/v1/admin/insights/coupons');
    expect(list.body.data.find((x: { code: string }) => x.code === 'VIP-FOOD')).toMatchObject({ usedCount: 1, totalDiscount: 50 });
    const loyalty = await admin.get('/api/v1/admin/insights/loyalty');
    expect(loyalty.status).toBe(200);
  });
});
