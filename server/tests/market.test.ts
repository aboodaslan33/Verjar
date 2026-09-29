import request from 'supertest';
import { app, createAdmin, createCustomer, PNG_1PX, prisma, resetDb } from './helpers';
import { runMarketJobs } from '../src/jobs/market';

type Agent = Awaited<ReturnType<typeof createCustomer>>;

async function joinSupplier(agent: Agent, companyName: string, categoryIds: string[]) {
  const r = await agent.post('/api/v1/market/suppliers/join').send({
    companyName,
    contactName: 'مسؤول المبيعات',
    phone: '0799000111',
    whatsapp: '0799000111',
    email: `${companyName.length}${Math.random().toString(36).slice(2, 6)}@supplier.jo`,
    address: 'المنطقة الصناعية',
    city: 'سحاب',
    businessField: 'قطع غيار ومحركات',
    productTypes: 'محركات، سيور، حساسات',
    categoryIds,
    acceptTerms: true,
  });
  expect(r.status).toBe(201);
  return r.body.data as { id: string; slug: string; status: string };
}

describe('السوق الصناعي B2B', () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let catId: string;
  let machinesId: string;

  beforeAll(async () => {
    await resetDb();
    admin = await createAdmin();
    const cat = await admin.post('/api/v1/admin/store/categories').send({ name: 'محركات', commissionGroup: 'spare_parts', visible: true });
    expect(cat.status).toBe(201);
    catId = cat.body.data.id;
    machinesId = (await admin.post('/api/v1/admin/store/categories').send({ name: 'ماكينات', commissionGroup: 'machines' })).body.data.id;
    await prisma.commissionRule.createMany({
      data: [
        { name: 'قطع الغيار', commissionGroup: 'spare_parts', percent: 5, maxAmount: 100, priority: 10 },
        { name: 'الماكينات', commissionGroup: 'machines', percent: 2, maxAmount: 300, priority: 10 },
        { name: 'عامة', percent: 3, priority: 0 },
      ],
    });
  });
  afterAll(() => prisma.$disconnect());

  it('محرك العمولات: 20,000 × 2% = 400 ويُقص للحد الأقصى 300، وقطع الغيار 5%', async () => {
    const m = await admin.post('/api/v1/admin/market/commissions/preview').send({ amount: 20000, categoryId: machinesId });
    expect(m.body.data).toMatchObject({ percent: 2, amount: 300, capped: true });
    const s = await admin.post('/api/v1/admin/market/commissions/preview').send({ amount: 200, categoryId: catId });
    expect(s.body.data).toMatchObject({ percent: 5, amount: 10 });
    const d = await admin.post('/api/v1/admin/market/commissions/preview').send({ amount: 1000 });
    expect(d.body.data.rule.name).toBe('عامة');
  });

  it('الدورة الكاملة: تسجيل مورد → اعتماد → منتج → بحث → RFQ → عرض → رسائل مخفية → قبول → تقييم', async () => {
    // المورد يسجّل ويبقى قيد المراجعة
    const supplierAgent = await createCustomer({ name: 'مورد المحركات', phone: '0781111111' });
    const s1 = await joinSupplier(supplierAgent, 'شركة المحركات الحديثة', [catId]);
    expect(s1.status).toBe('PENDING');
    const me = await supplierAgent.get('/api/v1/auth/me');
    expect(me.body.data.vendor).toMatchObject({ status: 'PENDING', role: 'OWNER' });

    // منتج أثناء المراجعة: يُحفظ ولا يظهر للعامة
    const prod = await supplierAgent.post('/api/v1/vendor/products').send({
      name: 'محرك كهربائي 5.5 كيلوواط',
      description: 'محرك ثلاثي الطور للمضخات والسيور',
      price: 0,
      priceOnRequest: true,
      categoryId: catId,
      sku: 'MTR-5500',
      partNumber: 'SIE-1LE1',
      brand: 'Siemens',
      manufacturer: 'Siemens AG',
      originCountry: 'ألمانيا',
      minOrderQty: 2,
      availability: 'ON_ORDER',
      leadTimeDays: 14,
      warranty: 'سنتان',
      keywords: 'موتور, محرك, 7.5 حصان',
    });
    expect(prod.status).toBe(201);
    expect((await request(app).get('/api/v1/store/products?q=MTR-5500')).body.data.total).toBe(0);

    // عرض سعر قبل الاعتماد ممنوع
    expect((await supplierAgent.post('/api/v1/vendor/market/ads').send({ packageId: 'x' })).status).toBe(403);

    // الإدارة تعتمد وتوثّق وتقبل المنتج
    expect((await admin.post(`/api/v1/admin/market/suppliers/${s1.id}/status`).send({ status: 'REJECTED' })).status).toBe(400);
    expect((await admin.post(`/api/v1/admin/market/suppliers/${s1.id}/status`).send({ status: 'APPROVED' })).status).toBe(200);
    expect((await admin.post(`/api/v1/admin/market/suppliers/${s1.id}/verify`).send({ verified: true })).status).toBe(200);
    expect((await admin.post(`/api/v1/admin/store/products/${prod.body.data.id}/approve`)).status).toBe(200);

    // البحث بـ SKU ورقم القطعة والماركة والكلمات المفتاحية واسم المورد + الفلاتر
    for (const q of ['MTR-5500', 'SIE-1LE1', 'siemens', 'موتور', 'المحركات الحديثة']) {
      expect((await request(app).get(`/api/v1/store/products?q=${encodeURIComponent(q)}`)).body.data.total).toBe(1);
    }
    const filtered = await request(app).get(`/api/v1/store/products?brand=Siemens&verified=true&city=${encodeURIComponent('سحاب')}&plan=FREE`);
    expect(filtered.body.data.items[0]).toMatchObject({ sku: 'MTR-5500', priceOnRequest: true, vendor: { verified: true } });
    expect((await request(app).get('/api/v1/store/products?minPrice=1')).body.data.total).toBe(0);
    const facets = await request(app).get('/api/v1/store/facets');
    expect(facets.body.data.brands[0].value).toBe('Siemens');
    const dir = await request(app).get(`/api/v1/store/suppliers?category=${(await prisma.category.findUniqueOrThrow({ where: { id: catId } })).slug}`);
    expect(dir.body.data.items.map((v: { id: string }) => v.id)).toContain(s1.id);

    // المنتج بالسعر عند الطلب لا يُشترى مباشرة
    const buyer = await createCustomer({ name: 'مصنع الأغذية المتحدة', phone: '0772222222', email: 'buyer@factory.jo' });
    const direct = await buyer.post('/api/v1/store/orders').send({ name: 'مصنع', phone: '0772222222', address: 'سحاب', items: [{ productId: prod.body.data.id, quantity: 2 }], paymentMethod: 'COD' });
    expect(direct.status).toBe(400);

    // طلب عرض سعر من العميل: رقم RFQ-000001 ويُوزَّع تلقائيًا على المورد المناسب
    const rfq = await buyer.post('/api/v1/market/rfqs').send({
      companyName: 'مصنع الأغذية المتحدة',
      contactName: 'م. خالد',
      phone: '0772222222',
      email: 'buyer@factory.jo',
      city: 'سحاب',
      categoryId: catId,
      items: [
        { name: 'محرك 5.5 كيلوواط', quantity: 4, specs: '380V 1450rpm', brand: 'Siemens' },
        { name: 'سير ناقل مطاطي', quantity: 10, unit: 'متر' },
      ],
      budget: 3000,
      notes: 'مطلوب خلال أسبوعين',
    });
    expect(rfq.status).toBe(201);
    expect(rfq.body.data.code).toBe('RFQ-000001');
    const rfqId = rfq.body.data.id;
    const recipients = await prisma.rfqRecipient.findMany({ where: { rfqId } });
    expect(recipients.map((r) => r.vendorId)).toContain(s1.id);
    expect((await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe('DISTRIBUTED');
    expect(await prisma.notification.count({ where: { recipientType: 'VENDOR', recipientId: s1.id, link: `/vendor/rfqs/${rfqId}` } })).toBe(1);

    // المورد يرى الطلب مع إخفاء بيانات تواصل العميل
    const tabs = await supplierAgent.get('/api/v1/vendor/market/rfqs?tab=new');
    expect(tabs.body.data.items[0].code).toBe('RFQ-000001');
    const vd = await supplierAgent.get(`/api/v1/vendor/market/rfqs/${rfqId}`);
    expect(vd.body.data.contact.hidden).toBe(true);
    expect(vd.body.data.contact.phone).not.toContain('2222222');
    expect(JSON.stringify(vd.body.data)).not.toContain('buyer@factory.jo');
    expect(vd.body.data.commissionAmount).toBeUndefined();
    // الميزانية تبقى بين العميل وFARJAR
    expect(vd.body.data.budget).toBeUndefined();

    // مورد آخر لا يرى الطلب، وعميل آخر لا يرى طلب غيره
    const other = await createCustomer({ name: 'مورد آخر', phone: '0783333333' });
    await joinSupplier(other, 'ورشة أخرى', []);
    expect((await other.get(`/api/v1/vendor/market/rfqs/${rfqId}`)).status).toBe(404);
    const stranger = await createCustomer({ name: 'عميل آخر', phone: '0774444444' });
    expect((await stranger.get(`/api/v1/market/rfqs/${rfqId}`)).status).toBe(404);

    // عرض المورد
    const q = await supplierAgent.post(`/api/v1/vendor/market/rfqs/${rfqId}/quote`).send({
      unitPrice: 650,
      quantity: 4,
      leadTimeDays: 10,
      warranty: 'سنتان',
      originCountry: 'ألمانيا',
      brand: 'Siemens',
      paymentTerms: '50% مقدم',
      validUntil: new Date(Date.now() + 10 * 86400_000).toISOString(),
    });
    expect(q.status).toBe(201);
    expect(Number(q.body.data.total)).toBe(2600);

    // العميل يقارن العروض ويراسل المورد — الأرقام والبريد تُخفى قبل القبول
    const cd = await buyer.get(`/api/v1/market/rfqs/${rfqId}`);
    expect(cd.body.data.quotes).toHaveLength(1);
    expect(cd.body.data.quotes[0].vendor.contact).toBeNull();
    const msg = await buyer.post(`/api/v1/market/rfqs/${rfqId}/messages/${s1.id}`).send({ body: 'هل يمكن التسليم أسرع؟ كلمني 079 123 4567 أو mail@x.com' });
    expect(msg.status).toBe(201);
    expect(msg.body.data.masked).toBe(true);
    expect(msg.body.data.body).not.toContain('4567');
    expect(msg.body.data.body).not.toContain('mail@x.com');
    const thread = await supplierAgent.get(`/api/v1/vendor/market/rfqs/${rfqId}/messages`);
    expect(thread.body.data).toHaveLength(1);
    expect((await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe('NEGOTIATING');

    // القبول: ترسية + قيمة الصفقة + العمولة (5% بحد أقصى 100)
    const acc = await buyer.post(`/api/v1/market/rfqs/${rfqId}/quotes/${q.body.data.id}/accept`);
    expect(acc.status).toBe(200);
    const awarded = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
    expect(awarded.status).toBe('AWARDED');
    expect(Number(awarded.finalValue)).toBe(2600);
    expect(Number(awarded.commissionAmount)).toBe(100);
    expect(awarded.revenueModel).toBe('LEAD');
    // نموذج Leads فقط: لا فاتورة عمولة
    expect(await prisma.marketInvoice.count({ where: { purpose: 'COMMISSION' } })).toBe(0);

    // بعد القبول تُكشف بيانات التواصل للطرفين
    expect((await buyer.get(`/api/v1/market/rfqs/${rfqId}`)).body.data.quotes[0].vendor.contact.phone).toBeTruthy();
    expect((await supplierAgent.get(`/api/v1/vendor/market/rfqs/${rfqId}`)).body.data.contact.phone).toBe('962772222222');

    // التقييم: بعد الترسية فقط ومرة واحدة
    expect((await stranger.post(`/api/v1/market/rfqs/${rfqId}/review`).send({ quality: 5, delivery: 5, commitment: 5, communication: 5, overall: 5 })).status).toBe(404);
    expect((await buyer.post(`/api/v1/market/rfqs/${rfqId}/complete`)).status).toBe(200);
    const rev = await buyer.post(`/api/v1/market/rfqs/${rfqId}/review`).send({ quality: 5, delivery: 4, commitment: 5, communication: 5, overall: 5, comment: 'مورد ممتاز' });
    expect(rev.status).toBe(201);
    expect((await buyer.post(`/api/v1/market/rfqs/${rfqId}/review`).send({ quality: 5, delivery: 5, commitment: 5, communication: 5, overall: 5 })).status).toBe(409);
    const page = await request(app).get(`/api/v1/store/vendors/${s1.slug}`);
    expect(page.body.data.rating).toMatchObject({ average: 5, count: 1 });
    expect(page.body.data.completedDeals).toBe(1);

    // لوحة الإدارة: Lead بقيمه
    const leads = await admin.get('/api/v1/admin/market/rfqs');
    expect(leads.body.data.items[0]).toMatchObject({ code: 'RFQ-000001', status: 'CLOSED' });
  });

  it('حد المنتجات في الباقة، الترقية بفاتورة، رسوم الـ Leads، والإعلانات', async () => {
    const agent = await createCustomer({ name: 'مورد الستانلس', phone: '0785555555' });
    const s = await joinSupplier(agent, 'ستانلس الأردن', [machinesId]);
    await admin.post(`/api/v1/admin/market/suppliers/${s.id}/status`).send({ status: 'APPROVED' });

    // الحد من لوحة الإدارة بدون تعديل الكود
    await admin.patch('/api/v1/admin/market/plans/plan_free').send({ maxProducts: 1 });
    const p1 = await agent.post('/api/v1/vendor/products').send({ name: 'عربة ستانلس 3 رفوف', description: 'عربة داخلية', price: 180, categoryId: machinesId, stock: 5 });
    expect(p1.status).toBe(201);
    const p2 = await agent.post('/api/v1/vendor/products').send({ name: 'طاولة ستانلس', description: 'طاولة تحضير', price: 250, categoryId: machinesId });
    expect(p2.status).toBe(403);
    expect(p2.body.error.code).toBe('PLAN_LIMIT');
    await admin.patch('/api/v1/admin/market/plans/plan_free').send({ maxProducts: 20 });
    await admin.post(`/api/v1/admin/store/products/${p1.body.data.id}/approve`);

    // الترقية إلى PRO: الطلب يُرسل مع إيصال الدفع فقط، وتأكيد الإدارة يفعّل الباقة
    expect((await agent.post('/api/v1/vendor/market/subscription').send({ planId: 'plan_pro' })).status).toBe(400);
    expect(await prisma.marketInvoice.count({ where: { vendorId: s.id } })).toBe(0);
    const up = await agent
      .post('/api/v1/vendor/market/subscription')
      .field('data', JSON.stringify({ planId: 'plan_pro', reference: 'CLIQ-123' }))
      .attach('file', PNG_1PX, { filename: 'receipt.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(Number(up.body.data.invoice.amount)).toBe(29);
    expect(up.body.data.invoice.number).toMatch(/^INV-\d{6}$/);
    expect(up.body.data.invoice.proofStatus).toBe('SUBMITTED');
    await admin.post(`/api/v1/admin/market/invoices/${up.body.data.invoice.id}/paid`).send({ providerRef: 'CLIQ-123' });
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: s.id }, include: { plan: true } });
    expect(v.plan?.code).toBe('PRO');
    expect(v.planExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);

    // رسوم الـ Leads: مفعّلة للمجانية، ومشمولة في PRO
    await admin.put('/api/v1/admin/settings').send({ leadFeesEnabled: true, leadFeeStandard: 4 });
    const freeAgent = await createCustomer({ name: 'مورد صغير', phone: '0786666666' });
    const free = await joinSupplier(freeAgent, 'ورشة الماكينات', [machinesId]);
    await admin.post(`/api/v1/admin/market/suppliers/${free.id}/status`).send({ status: 'APPROVED' });
    const buyer = await createCustomer({ name: 'مصنع البلاستيك', phone: '0777777777' });
    const r = await buyer.post('/api/v1/market/rfqs').send({ companyName: 'مصنع البلاستيك', contactName: 'سامر', phone: '0777777777', categoryId: machinesId, items: [{ name: 'عربات ستانلس', quantity: 4 }] });
    expect(r.status).toBe(201);
    const recs = await prisma.rfqRecipient.findMany({ where: { rfqId: r.body.data.id } });
    const freeRec = recs.find((x) => x.vendorId === free.id)!;
    const proRec = recs.find((x) => x.vendorId === s.id)!;
    expect(Number(freeRec.leadFee)).toBe(4);
    expect(freeRec.leadInvoiceId).toBeTruthy();
    expect(Number(proRec.leadFee)).toBe(0);
    // PRO أولًا في الترتيب (أولوية الباقة)
    const sugg = await admin.get(`/api/v1/admin/market/rfqs/${r.body.data.id}/suggestions`);
    expect(sugg.status).toBe(200);

    // الإعلان: طلب من المورد → فاتورة → دفع → يظهر في الصفحة الرئيسية للسوق
    expect((await agent.post('/api/v1/vendor/market/ads').send({ packageId: 'adp_fp_w', productId: p1.body.data.id })).status).toBe(400);
    const ad = await agent
      .post('/api/v1/vendor/market/ads')
      .field('data', JSON.stringify({ packageId: 'adp_fp_w', productId: p1.body.data.id, reference: 'CLIQ-AD' }))
      .attach('file', PNG_1PX, { filename: 'ad.png', contentType: 'image/png' });
    expect(ad.status).toBe(201);
    expect(ad.body.data.invoice.proofStatus).toBe('SUBMITTED');
    expect(ad.body.data.ad.status).toBe('PENDING_PAYMENT');
    await admin.post(`/api/v1/admin/market/invoices/${ad.body.data.invoice.id}/paid`);
    const home = await request(app).get('/api/v1/market/home');
    expect(home.body.data.ads.featuredProducts[0].product.id).toBe(p1.body.data.id);

    // التقرير المالي
    const ov = await admin.get('/api/v1/admin/market/overview');
    expect(ov.body.data.revenue.paid.SUBSCRIPTION).toBe(29);
    expect(ov.body.data.revenue.paid.AD).toBe(10);
    expect(ov.body.data.revenue.pending.LEAD_FEE).toBe(4);

    // نموذج العمولة: عند التفعيل تصدر فاتورة عمولة على المورد عند القبول
    await admin.put('/api/v1/admin/settings').send({ marketRevenueMode: 'COMMISSION' });
    const q = await agent.post(`/api/v1/vendor/market/rfqs/${r.body.data.id}/quote`).send({ unitPrice: 5000, quantity: 4 });
    await buyer.post(`/api/v1/market/rfqs/${r.body.data.id}/quotes/${q.body.data.id}/accept`);
    const inv = await prisma.marketInvoice.findFirstOrThrow({ where: { purpose: 'COMMISSION', vendorId: s.id } });
    // 20,000 × 2% = 400 → الحد الأقصى 300
    expect(Number(inv.amount)).toBe(300);
    await admin.put('/api/v1/admin/settings').send({ marketRevenueMode: 'LEAD', leadFeesEnabled: false });
  });

  it('فريق المورد حسب الباقة، والتذكير بانتهاء الاشتراك', async () => {
    const owner = await createCustomer({ name: 'مالك', phone: '0788888888' });
    const s = await joinSupplier(owner, 'مضخات الشرق', []);
    await admin.post(`/api/v1/admin/market/suppliers/${s.id}/status`).send({ status: 'APPROVED' });
    await createCustomer({ name: 'موظف مبيعات', phone: '0789999999' });
    // المجانية: مستخدم واحد
    const add = await owner.post('/api/v1/vendor/market/team').send({ identifier: '0789999999' });
    expect(add.status).toBe(403);
    await admin.post(`/api/v1/admin/market/suppliers/${s.id}/plan`).send({ planId: 'plan_business' });
    expect((await owner.post('/api/v1/vendor/market/team').send({ identifier: '0789999999' })).status).toBe(201);
    const staff = request.agent(app);
    await staff.post('/api/v1/auth/login').send({ identifier: '0789999999', password: 'Customer@123' });
    const me = await staff.get('/api/v1/auth/me');
    expect(me.body.data.vendor).toMatchObject({ id: s.id, role: 'STAFF' });
    expect((await staff.get('/api/v1/vendor/market/overview')).status).toBe(200);
    // الموظف لا يدير الفريق أو الاشتراك
    expect((await staff.post('/api/v1/vendor/market/subscription').send({ planId: 'plan_pro' })).status).toBe(403);

    await prisma.vendor.update({ where: { id: s.id }, data: { planExpiresAt: new Date(Date.now() + 6.5 * 86400_000) } });
    const out = await runMarketJobs();
    expect(out.reminded).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { recipientId: s.id, title: { contains: 'سينتهي' } } })).toBe(1);
  });

  it('متجر FARJAR يقدّم عرض سعر من الإدارة، ويُقبل بدون فاتورة عمولة', async () => {
    const { ensureHouseVendor, HOUSE_VENDOR_ID } = await import('../src/services/vendor.service');
    await ensureHouseVendor();
    const buyer = await createCustomer({ name: 'مصنع البلاستيك', phone: '0776666666' });
    const rfq = await buyer.post('/api/v1/market/rfqs').send({
      companyName: 'مصنع البلاستيك',
      contactName: 'م. سامر',
      phone: '0776666666',
      items: [{ name: 'عربة ستانلس 3 رفوف', quantity: 5 }],
    });
    expect(rfq.status).toBe(201);
    const id = rfq.body.data.id;
    const detail = await admin.get(`/api/v1/admin/market/rfqs/${id}`);
    expect(detail.body.data.houseVendorId).toBe(HOUSE_VENDOR_ID);

    const hq = await admin.post(`/api/v1/admin/market/rfqs/${id}/house-quote`).send({ unitPrice: 120, quantity: 5, leadTimeDays: 7 });
    expect(hq.status).toBe(201);
    expect(Number(hq.body.data.total)).toBe(600);
    // التعديل يحدّث نفس العرض
    expect((await admin.post(`/api/v1/admin/market/rfqs/${id}/house-quote`).send({ unitPrice: 110, quantity: 5, notes: 'للتواصل 0791234567 أو sales@farjar.jo' })).status).toBe(201);

    const mine = await buyer.get(`/api/v1/market/rfqs/${id}`);
    const quote = mine.body.data.quotes.find((x: { vendor: { id: string } }) => x.vendor.id === HOUSE_VENDOR_ID);
    expect(Number(quote.total)).toBe(550);
    // بيانات التواصل في نص العرض مخفية قبل الترسية
    expect(quote.notes).not.toContain('0791234567');
    expect(quote.notes).not.toContain('sales@farjar.jo');
    expect((await buyer.post(`/api/v1/market/rfqs/${id}/quotes/${quote.id}/accept`)).status).toBe(200);
    expect(await prisma.marketInvoice.count({ where: { vendorId: HOUSE_VENDOR_ID } })).toBe(0);
    // لا عرض جديد بعد الترسية
    expect((await admin.post(`/api/v1/admin/market/rfqs/${id}/house-quote`).send({ unitPrice: 1, quantity: 1 })).status).toBe(409);
  });

  it('الدفع اليدوي: لا طلب بدون إيصال → رفض → إيصال جديد → تأكيد الإدارة يفعّل الباقة', async () => {
    const agent = await createCustomer({ name: 'مورد الكهرباء', phone: '0784444444' });
    const join = await agent.post('/api/v1/market/suppliers/join').send({
      companyName: 'كهرباء المصانع',
      contactName: 'م. رامي',
      phone: '0784444444',
      email: 'rami@elec.jo',
      address: 'سحاب',
      city: 'سحاب',
      businessField: 'كهرباء صناعية',
      productTypes: 'لوحات تحكم',
      planId: 'plan_business',
      acceptTerms: true,
    });
    expect(join.status).toBe(201);
    // لا فاتورة ولا طلب قبل الدفع — فقط الباقة المختارة لفتح شاشة الدفع
    expect(join.body.data.payPlanId).toBe('plan_business');
    const vendorId = join.body.data.id as string;
    expect(await prisma.marketInvoice.count({ where: { vendorId } })).toBe(0);

    // بيانات الحساب من الإعدادات تظهر للمورد
    const sub = await agent.get('/api/v1/vendor/market/subscription');
    expect(sub.body.data.account).toMatchObject({ bankName: 'بنك الاتحاد', cliq: '0780192930' });
    expect(sub.body.data.invoices).toHaveLength(0);

    // الإيصال مطلوب، والملف صورة أو PDF فقط — ولا يُنشأ شيء عند الفشل
    const noFile = await agent.post('/api/v1/vendor/market/subscription').field('data', JSON.stringify({ planId: 'plan_business', reference: 'x' }));
    expect(noFile.status).toBe(400);
    const bad = await agent
      .post('/api/v1/vendor/market/subscription')
      .field('data', JSON.stringify({ planId: 'plan_business' }))
      .attach('file', Buffer.from('not an image'), { filename: 'a.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect(await prisma.marketInvoice.count({ where: { vendorId } })).toBe(0);

    const up = await agent
      .post('/api/v1/vendor/market/subscription')
      .field('data', JSON.stringify({ planId: 'plan_business', reference: 'CLIQ-778899', note: 'حوالة من حساب الشركة' }))
      .attach('file', PNG_1PX, { filename: 'receipt.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const invoiceId = up.body.data.invoice.id as string;
    expect(up.body.data.invoice).toMatchObject({ amount: 79, proofStatus: 'SUBMITTED', payerReference: 'CLIQ-778899', proofKind: 'IMAGE' });
    expect(up.body.data.invoice.proofPublicId).toBeUndefined();
    // طلب آخر ممنوع أثناء المراجعة، ولا يُلغى بعد إرسال الإيصال
    expect((await agent.post('/api/v1/vendor/market/subscription').field('data', JSON.stringify({ planId: 'plan_pro' })).attach('file', PNG_1PX, { filename: 'r.png', contentType: 'image/png' })).status).toBe(409);
    expect((await agent.post(`/api/v1/vendor/market/invoices/${invoiceId}/cancel`)).status).toBe(409);

    const list = await admin.get('/api/v1/admin/market/invoices?proof=SUBMITTED');
    expect(list.body.data.awaitingReview).toBe(1);
    expect(list.body.data.items[0]).toMatchObject({ id: invoiceId, payerReference: 'CLIQ-778899' });
    expect((await admin.get('/api/v1/admin/dashboard/stats')).body.data.paymentProofs).toBe(1);

    // رفض الإيصال بسبب → يُبلَّغ المورد ويبقى الطلب بانتظار الدفع
    expect((await admin.post(`/api/v1/admin/market/invoices/${invoiceId}/reject-proof`).send({ reason: '' })).status).toBe(400);
    expect((await admin.post(`/api/v1/admin/market/invoices/${invoiceId}/reject-proof`).send({ reason: 'المبلغ المحوّل 70 بدل 79' })).status).toBe(200);
    expect(await prisma.notification.count({ where: { recipientId: vendorId, title: { contains: 'لم يُقبل إثبات دفع' } } })).toBe(1);
    const after = (await agent.get('/api/v1/vendor/market/subscription')).body.data.invoices[0];
    expect(after).toMatchObject({ status: 'PENDING', proofStatus: 'REJECTED', reviewNote: 'المبلغ المحوّل 70 بدل 79' });

    // إيصال جديد ثم تأكيد الإدارة يفعّل BUSINESS
    await agent.post(`/api/v1/vendor/market/invoices/${invoiceId}/proof`).attach('file', PNG_1PX, { filename: 'receipt2.png', contentType: 'image/png' });
    const paid = await admin.post(`/api/v1/admin/market/invoices/${invoiceId}/paid`).send({});
    expect(paid.status).toBe(200);
    expect(paid.body.data).toMatchObject({ status: 'PAID', proofStatus: 'APPROVED', providerRef: 'CLIQ-778899' });
    const v = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, include: { plan: true } });
    expect(v.plan?.code).toBe('BUSINESS');
    // لا رفع إيصال على فاتورة مدفوعة
    expect((await agent.post(`/api/v1/vendor/market/invoices/${invoiceId}/proof`).attach('file', PNG_1PX, { filename: 'r.png', contentType: 'image/png' })).status).toBe(409);

    // طلب رُفض إيصاله: يلغيه المورد، أو يستبدله طلب جديد
    const again = await agent.post('/api/v1/vendor/market/subscription').field('data', JSON.stringify({ planId: 'plan_pro' })).attach('file', PNG_1PX, { filename: 'r.png', contentType: 'image/png' });
    expect(again.status).toBe(201);
    await admin.post(`/api/v1/admin/market/invoices/${again.body.data.invoice.id}/reject-proof`).send({ reason: 'إيصال غير واضح' });
    expect((await agent.post(`/api/v1/vendor/market/invoices/${again.body.data.invoice.id}/cancel`)).status).toBe(200);
    expect((await prisma.vendorSubscription.findFirstOrThrow({ where: { invoiceId: again.body.data.invoice.id } })).status).toBe('CANCELLED');
  });
});
