import { createAdmin, createCustomer, createVendor, prisma, resetDb } from './helpers';

type Agent = Awaited<ReturnType<typeof createAdmin>>;
const buyer = { name: 'مصنع الأغذية', phone: '0771234567', address: 'عمّان — سحاب' };

let admin: Agent;
let vendor: Awaited<ReturnType<typeof createVendor>>;
let productId: string;

beforeAll(async () => {
  await resetDb();
  admin = await createAdmin();
  const categoryId = (await admin.post('/api/v1/admin/store/categories').send({ name: 'معدات' })).body.data.id;
  vendor = await createVendor(admin, { name: 'مصنع المعدات', phone: '0785550000' });
  const p = await vendor.agent.post('/api/v1/vendor/products').send({ name: 'ضاغط هواء', description: 'وصف', supplierPrice: 1000, stock: 50, categoryId });
  productId = p.body.data.id;
  await admin.post(`/api/v1/admin/store/products/${productId}/approve`);
});
afterAll(() => prisma.$disconnect());

describe('مالية المورد مع فرجار', () => {
  let orderA: string;
  let orderB: string;

  it('اللوحة المالية: المبيعات قبل وبعد النسبة، المستحق الآن وقيد التنفيذ', async () => {
    const shopper = await createCustomer({ name: buyer.name, phone: buyer.phone });
    expect((await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId, quantity: 2 }] })).status).toBe(201);
    expect((await shopper.post('/api/v1/store/orders').send({ ...buyer, items: [{ productId, quantity: 1 }] })).status).toBe(201);
    const [b, a] = (await vendor.agent.get('/api/v1/vendor/orders')).body.data.items;
    orderA = a.id;
    orderB = b.id;
    // الطلب الأول اكتمل → نسبته مستحقة الآن، والثاني قيد التنفيذ
    await vendor.agent.patch(`/api/v1/vendor/orders/${orderA}`).send({ status: 'COMPLETED' });

    const fin = (await vendor.agent.get('/api/v1/vendor/finance')).body.data;
    expect(fin.rate.percent).toBe(2);
    // 3 وحدات × 1000 = 3000 للمورد، 3060 للعملاء، 60 لفرجار
    expect(fin.summary).toMatchObject({ customerSales: 3060, supplierBase: 3000, fees: 60, paid: 0, outstanding: 60, due: 40, pending: 20, disputed: 0 });
    expect(fin.activity.some((x: { kind: string }) => x.kind === 'SALE')).toBe(true);

    const st = (await vendor.agent.get('/api/v1/vendor/finance/statement')).body.data;
    const rowA = st.rows.find((r: { id: string }) => r.id === orderA);
    expect(rowA).toMatchObject({ feeStatus: 'DUE', feeAmount: 40, remaining: 40, orderStatus: 'COMPLETED' });
    expect(rowA.items[0]).toMatchObject({ product: 'ضاغط هواء', quantity: 2, supplierPrice: 1000, customerPrice: 1020, feePercent: 2, feeAmount: 40 });
    expect(st.rows.find((r: { id: string }) => r.id === orderB).feeStatus).toBe('PENDING');
  });

  it('الدفعات اليدوية: تُوزَّع على المستحق أولًا وتحدّث المدفوع والمتبقي', async () => {
    // لا يُقبل أكثر من المتبقي
    expect((await admin.post(`/api/v1/admin/supplier-finance/${vendor.vendor.id}/payments`).send({ amount: 100 })).status).toBe(400);
    const pay = await admin.post(`/api/v1/admin/supplier-finance/${vendor.vendor.id}/payments`).send({ amount: 25, method: 'CLIQ', reference: 'RC-1', note: 'دفعة أولى' });
    expect(pay.status).toBe(201);
    expect(pay.body.data.remaining).toBe(35);

    const fin = (await vendor.agent.get('/api/v1/vendor/finance')).body.data;
    expect(fin.summary).toMatchObject({ paid: 25, outstanding: 35, due: 15, pending: 20 });
    const partial = (await vendor.agent.get('/api/v1/vendor/finance/statement?status=PARTIALLY_PAID')).body.data.rows;
    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatchObject({ id: orderA, feePaid: 25, remaining: 15 });

    const notes = await prisma.notification.findMany({ where: { recipientType: 'VENDOR', recipientId: vendor.vendor.id, title: 'تم تسجيل دفعتك لفرجار' } });
    expect(notes).toHaveLength(1);

    const detail = (await admin.get(`/api/v1/admin/supplier-finance/${vendor.vendor.id}`)).body.data;
    expect(detail.payments[0]).toMatchObject({ amount: 25, method: 'CLIQ', reference: 'RC-1', note: 'دفعة أولى' });
    expect(detail.payments[0].orders[0]).toMatchObject({ id: orderA, amount: 25 });
  });

  it('النزاع: المبلغ المتنازع عليه لا يُسدَّد تلقائيًا ويظهر منفصلًا', async () => {
    expect((await vendor.agent.post(`/api/v1/vendor/finance/orders/${orderB}/dispute`).send({ note: 'الكمية غير صحيحة' })).status).toBe(200);
    let fin = (await vendor.agent.get('/api/v1/vendor/finance')).body.data.summary;
    expect(fin).toMatchObject({ disputed: 20, pending: 0, due: 15 });
    // المتاح للسداد 15 فقط (المستحق غير المتنازع عليه)
    expect((await admin.post(`/api/v1/admin/supplier-finance/${vendor.vendor.id}/payments`).send({ amount: 20 })).status).toBe(400);
    expect((await admin.post(`/api/v1/admin/supplier-finance/${vendor.vendor.id}/payments`).send({ amount: 15 })).status).toBe(201);
    const st = (await vendor.agent.get('/api/v1/vendor/finance/statement')).body.data.rows;
    expect(st.find((r: { id: string }) => r.id === orderA).feeStatus).toBe('PAID');
    expect(st.find((r: { id: string }) => r.id === orderB)).toMatchObject({ feeStatus: 'DISPUTED', dispute: { note: 'الكمية غير صحيحة', by: 'SUPPLIER' } });

    // الإدارة تغلق النزاع
    await admin.post(`/api/v1/admin/supplier-finance/vendor-orders/${orderB}/dispute`).send({ disputed: false, note: 'تمت المراجعة' });
    fin = (await vendor.agent.get('/api/v1/vendor/finance')).body.data.summary;
    expect(fin).toMatchObject({ disputed: 0, pending: 20, paid: 40, outstanding: 20 });
  });

  it('لوحة الأدمن: كل الموردين، حذف دفعة خاطئة، والتقارير', async () => {
    const list = (await admin.get('/api/v1/admin/supplier-finance')).body.data;
    const row = list.suppliers.find((s: { vendor: { id: string } }) => s.vendor.id === vendor.vendor.id);
    expect(row).toMatchObject({ orders: 2, customerSales: 3060, fees: 60, paid: 40, outstanding: 20, feePercent: 2 });
    expect(row.lastPayment).not.toBeNull();

    const detail = (await admin.get(`/api/v1/admin/supplier-finance/${vendor.vendor.id}`)).body.data;
    const second = detail.payments.find((p: { amount: number }) => p.amount === 15);
    expect((await admin.delete(`/api/v1/admin/supplier-finance/payments/${second.id}`)).status).toBe(200);
    const after = (await vendor.agent.get('/api/v1/vendor/finance')).body.data.summary;
    expect(after).toMatchObject({ paid: 25, outstanding: 35 });

    const rep = (await admin.get(`/api/v1/admin/supplier-finance/report?groupBy=month&vendorId=${vendor.vendor.id}`)).body.data;
    expect(rep.periods).toHaveLength(1);
    expect(rep.totals).toMatchObject({ customerSales: 3060, fees: 60, paid: 25, outstanding: 35 });
    const byDay = (await admin.get('/api/v1/admin/supplier-finance/report?groupBy=day&status=PENDING')).body.data;
    expect(byDay.totals.fees).toBe(20);
    const xlsx = await admin.get('/api/v1/admin/reports/supplier_fees?format=csv&groupBy=year');
    expect(xlsx.status).toBe(200);
    expect(xlsx.text).toContain('3060');

    // المورد لا يصل لصفحات الأدمن، ولا يعترض على طلب غيره
    expect((await vendor.agent.get('/api/v1/admin/supplier-finance')).status).toBe(403);
    const other = await createVendor(admin, { name: 'مورد آخر', phone: '0786660000' });
    expect((await other.agent.post(`/api/v1/vendor/finance/orders/${orderA}/dispute`).send({ note: 'ليس طلبي' })).status).toBe(404);
  });
});
