import request from 'supertest';
import { app, createAdmin, createCustomer, createProduct, createVendor, prisma, resetDb } from './helpers';

type Agent = Awaited<ReturnType<typeof createAdmin>>;
const buyer = { name: 'سارة خليل', phone: '0771234567', address: 'عمّان — عبدون' };
const year = new Date().getUTCFullYear();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

let admin: Agent;
let customerId: string;
beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  await createCustomer({ name: 'مصنع الأمل', phone: '0795555555' });
  customerId = (await prisma.customer.findFirstOrThrow({ where: { name: 'مصنع الأمل' } })).id;
  await prisma.corporateService.createMany({
    data: [
      { id: 'svc_pest', key: 'pest-control', name: 'مكافحة الآفات', kind: 'ANNUAL' },
      { id: 'svc_hvac', key: 'hvac', name: 'تكييف وتهوية', kind: 'ANNUAL' },
    ],
  });
});
afterAll(() => prisma.$disconnect());

describe('عقود الصيانة والعقود السنوية ومكافحة الآفات', () => {
  it('ينشئ عقدًا بمرجع متسلسل ويتتبع المدفوع والزيارات والحالة "قارب على الانتهاء"', async () => {
    const tech = await prisma.technician.create({ data: { name: 'فني', phone: '0791111111' } });
    const res = await admin.post('/api/v1/admin/corporate/contracts').send({
      customerId,
      title: 'عقد سنوي — مصنع الأمل',
      type: 'ANNUAL_CORPORATE',
      startDate: daysFromNow(-340),
      endDate: daysFromNow(20),
      value: 5000,
      paymentMethod: 'BANK_TRANSFER',
      serviceIds: ['svc_pest', 'svc_hvac'],
      visitsIncluded: 12,
      responseHours: 24,
      technicianId: tech.id,
      terms: 'زيارة شهرية',
    });
    expect(res.status).toBe(201);
    const k = res.body.data;
    expect(k.ref).toBe(`MC-${year}-00001`);
    expect(k.displayStatus).toBe('EXPIRING_SOON');
    const second = await admin.post('/api/v1/admin/corporate/contracts').send({ customerId, title: 'صيانة', type: 'MAINTENANCE', startDate: daysFromNow(0), endDate: daysFromNow(200), value: 800 });
    expect(second.body.data.ref).toBe(`MC-${year}-00002`);

    await admin.post('/api/v1/admin/finance/payments').send({ customerId, contractId: k.id, amount: 2000, method: 'BANK_TRANSFER' });
    const v1 = await admin.post(`/api/v1/admin/corporate/contracts/${k.id}/visits`).send({ scheduledAt: daysFromNow(-10) });
    expect(v1.body.data.technicianId).toBe(tech.id);
    await admin.patch(`/api/v1/admin/corporate/contracts/visits/${v1.body.data.id}`).send({ status: 'COMPLETED' });
    await admin.post(`/api/v1/admin/corporate/contracts/${k.id}/visits`).send({ scheduledAt: daysFromNow(5) });

    const d = (await admin.get(`/api/v1/admin/corporate/contracts/${k.id}`)).body.data;
    expect(d.paid).toBe(2000);
    expect(d.remaining).toBe(3000);
    expect(d.visitsUsed).toBe(1);
    expect(d.visitsRemaining).toBe(11);
    expect(d.visitsScheduled).toBe(1);
    expect(d.services.map((s: { key: string }) => s.key).sort()).toEqual(['hvac', 'pest-control']);
    expect(d.history.length).toBeGreaterThanOrEqual(3);

    const expiring = (await admin.get('/api/v1/admin/corporate/contracts?status=EXPIRING_SOON')).body.data;
    expect(expiring.total).toBe(1);
    const annual = (await admin.get('/api/v1/admin/reports/annual')).body.data;
    expect(annual.totals).toMatchObject({ count: 1, value: 5000, paid: 2000, remaining: 3000, expiring: 1 });
    const pest = (await admin.get('/api/v1/admin/reports/pest')).body.data;
    expect(pest.totals.count).toBe(1);
    expect((await admin.get('/api/v1/admin/reports/contracts')).body.data.totals.value).toBe(800);
  });
});

describe('عطاءات الشركات والعمولة', () => {
  it('الشركة تنشر عطاءً، المورد يقدّم عرضًا، والترسية تحفظ العمولة حسب الإعدادات', async () => {
    await admin.put('/api/v1/admin/settings').send({ tenderCommissionPercent: 10 });
    const company = request.agent(app);
    await company.post('/api/v1/auth/login').send({ identifier: '0795555555', password: 'Customer@123' });
    const t = await company.post('/api/v1/account/tenders').send({
      title: 'صيانة سنوية لمستودع',
      description: 'صيانة كهرباء وتكييف ومكافحة آفات لمستودع 2000 م²',
      serviceId: 'svc_pest',
      location: 'سحاب',
      durationMonths: 12,
      deadline: daysFromNow(10),
      budget: 6000,
    });
    expect(t.status).toBe(201);
    expect(t.body.data.ref).toBe(`TEN-${year}-00001`);
    expect(t.body.data.status).toBe('OPEN');

    const { agent: vendor } = await createVendor(admin, { name: 'شركة الصيانة الحديثة', phone: '0782222222' });
    const open = (await vendor.get('/api/v1/vendor/tenders')).body.data;
    expect(open.map((x: { ref: string }) => x.ref)).toContain(t.body.data.ref);
    const offer = await vendor.post(`/api/v1/vendor/tenders/${t.body.data.id}/offers`).send({ price: 5000, proposal: 'فريق من 4 فنيين وزيارة شهرية' });
    expect(offer.status).toBe(201);
    expect((await vendor.post(`/api/v1/vendor/tenders/${t.body.data.id}/offers`).send({ price: 4000, proposal: 'عرض مكرر للاختبار' })).status).toBe(409);
    await admin.post(`/api/v1/admin/tenders/${t.body.data.id}/offers`).send({ price: 5500, proposal: 'عرض المنصة مع ضمان' });

    const award = await admin.post(`/api/v1/admin/tenders/${t.body.data.id}/award`).send({ offerId: offer.body.data.id });
    expect(award.status).toBe(200);
    expect(award.body.data).toMatchObject({ status: 'AWARDED', awardedAmount: 5000, commissionPercent: 10, commissionAmount: 500, providerAmount: 4500 });

    // تغيير النسبة لاحقًا لا يغيّر العطاء المُرسّى
    await admin.put('/api/v1/admin/settings').send({ tenderCommissionPercent: 20 });
    const saved = await prisma.tender.findUniqueOrThrow({ where: { id: t.body.data.id } });
    expect(saved.commissionAmount?.toNumber()).toBe(500);

    const mine = (await company.get('/api/v1/account/tenders')).body.data[0];
    expect(mine.offers.find((o: { status: string }) => o.status === 'ACCEPTED').providerName).toBe('شركة الصيانة الحديثة');
    const contract = await admin.post(`/api/v1/admin/tenders/${t.body.data.id}/contract`).send({});
    expect(contract.status).toBe(201);
    expect(contract.body.data).toMatchObject({ status: 'DRAFT', type: 'ANNUAL_CORPORATE', value: 5000 });

    const commissions = (await admin.get('/api/v1/admin/reports/commissions')).body.data;
    expect(commissions.totals.tenders).toBe(500);
  });
});

describe('التوصيل والدفع عند الاستلام وتسوية النقد', () => {
  async function codOrder(shopper: Agent, productId: string, qty = 1) {
    const r = await shopper.post('/api/v1/store/orders').send({ ...buyer, paymentMethod: 'COD', items: [{ productId, quantity: qty }] });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
    return r.body.data as { id: string; number: number; total: number; message: string };
  }

  it('طلب COD يُسند لسائق، يُسلَّم، يُحصَّل، ثم يُسوّى ولا يمكن تعديله بعد التسوية', async () => {
    const p = await createProduct({ price: 20, discountPercent: 0, stock: 50 });
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const o1 = await codOrder(shopper, p.id, 1);
    const o2 = await codOrder(shopper, p.id, 2);
    expect(o1.message).toContain('الدفع: نقدًا عند الاستلام');
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    expect(saved.codAmount?.toNumber()).toBe(20);
    expect(saved.codStatus).toBe('PENDING');

    const driver = (await admin.post('/api/v1/admin/delivery/drivers').send({ name: 'أحمد', phone: '0790000009' })).body.data;
    const company = (await admin.post('/api/v1/admin/delivery/companies').send({ name: 'أرامكس', defaultFee: 3 })).body.data;
    expect((await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ deliveryStatus: 'OUT_FOR_DELIVERY' })).status).toBe(400);

    const a1 = await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ driverId: driver.id });
    expect(a1.body.data.deliveryStatus).toBe('ASSIGNED');
    await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ deliveryStatus: 'OUT_FOR_DELIVERY' });
    const d1 = await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ deliveryStatus: 'DELIVERED' });
    expect(d1.body.data).toMatchObject({ deliveryStatus: 'DELIVERED', codStatus: 'COLLECTED', codCollected: 20 });
    // التسليم يكمل الطلب بنفس مسار الحالات الحالي
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe('COMPLETED');

    await admin.patch(`/api/v1/admin/delivery/orders/${o2.id}`).send({ driverId: driver.id });
    await admin.patch(`/api/v1/admin/delivery/orders/${o2.id}`).send({ deliveryStatus: 'DELIVERED', codCollected: 40 });
    const o3 = await codOrder(shopper, p.id, 1);
    await admin.patch(`/api/v1/admin/delivery/orders/${o3.id}`).send({ deliveryCompanyId: company.id });
    const failed = await admin.patch(`/api/v1/admin/delivery/orders/${o3.id}`).send({ deliveryStatus: 'FAILED' });
    expect(failed.body.data).toMatchObject({ deliveryStatus: 'FAILED', codStatus: 'PENDING', deliveryFee: 3 });

    let drivers = (await admin.get('/api/v1/admin/delivery/drivers')).body.data;
    expect(drivers[0].cash).toMatchObject({ collected: 60, settled: 0, pending: 60, pendingOrders: 2 });

    expect((await admin.post('/api/v1/admin/delivery/settlements').send({ driverId: driver.id, expectedAmount: 50 })).status).toBe(409);
    const set = await admin.post('/api/v1/admin/delivery/settlements').send({ driverId: driver.id, expectedAmount: 60, notes: 'استلام نهاية اليوم' });
    expect(set.status).toBe(201);
    expect(set.body.data).toMatchObject({ ref: `SET-${year}-00001`, amount: 60, ordersCount: 2 });
    drivers = (await admin.get('/api/v1/admin/delivery/drivers')).body.data;
    expect(drivers[0].cash).toMatchObject({ collected: 60, settled: 60, pending: 0 });

    // لا تعديل صامت بعد التسوية
    expect((await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ codCollected: 5, deliveryStatus: 'DELIVERED' })).status).toBe(409);
    expect((await admin.patch(`/api/v1/admin/delivery/orders/${o1.id}`).send({ deliveryStatus: 'FAILED' })).status).toBe(409);
    expect((await admin.post('/api/v1/admin/delivery/settlements').send({ driverId: driver.id })).status).toBe(400);

    // إلغاء التسوية يبقيها في السجل ويعيد الطلبات للتحصيل المعلّق
    const v = await admin.post(`/api/v1/admin/delivery/settlements/${set.body.data.id}/void`).send({ reason: 'خطأ في العدّ' });
    expect(v.body.data.status).toBe('VOIDED');
    drivers = (await admin.get('/api/v1/admin/delivery/drivers')).body.data;
    expect(drivers[0].cash).toMatchObject({ collected: 60, settled: 0, pending: 60 });
    const again = await admin.post('/api/v1/admin/delivery/settlements').send({ driverId: driver.id });
    expect(again.body.data.ref).toBe(`SET-${year}-00002`);

    const cod = (await admin.get('/api/v1/admin/reports/cod')).body.data;
    expect(cod.totals).toMatchObject({ codAmount: 80, codCollected: 60, settled: 60, pending: 0 });
    const delivery = (await admin.get('/api/v1/admin/reports/delivery')).body.data;
    expect(delivery.totals).toMatchObject({ total: 3, delivered: 2, failed: 1, fees: 3 });
    const settlements = (await admin.get('/api/v1/admin/reports/settlements')).body.data;
    expect(settlements.totals).toMatchObject({ count: 2, confirmed: 60 });
    const sales = (await admin.get('/api/v1/admin/reports/sales')).body.data;
    expect(sales.totals).toMatchObject({ orders: 3, sales: 80, cod: 80 });
    const csv = await admin.get('/api/v1/admin/reports/cod?format=csv&lang=en');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('COD amount');

    const stats = (await admin.get('/api/v1/admin/dashboard/stats')).body.data.ops;
    expect(stats.today).toMatchObject({ orders: 3, delivered: 2, failed: 1, codCollected: 60 });
  });

  it('الطلب بدون طريقة دفع يبقى كما كان', async () => {
    const p = await createProduct({ stock: 5 });
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    const r = await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId: p.id, quantity: 1 }] });
    expect(r.status).toBe(201);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: r.body.data.id } });
    expect(o).toMatchObject({ paymentMethod: null, codStatus: null, deliveryStatus: 'PENDING' });
  });
});
