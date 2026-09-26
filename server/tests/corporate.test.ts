import request from 'supertest';
import { app, createAdmin, PNG_1PX, prisma, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  await prisma.corporateService.createMany({
    data: [
      { key: 'gmp', name: 'مطابقة GMP', kind: 'ANNUAL' },
      { key: 'electrical', name: 'صيانة كهرباء', kind: 'ANNUAL' },
      { key: 'u-argon', name: 'لحام آرغون', kind: 'URGENT' },
    ],
  });
});
afterAll(() => prisma.$disconnect());

const company = {
  companyName: 'مصنع الأمل للأدوية',
  contactName: 'م. خالد يوسف',
  managerPhone: '0795555555',
  maintenancePhone: '0786666666',
  locationText: 'سحاب — المدينة الصناعية',
};

describe('طلبات الشركات', () => {
  it('العقد السنوي يتطلب السجل التجاري والرخصة', async () => {
    const res = await request(app)
      .post('/api/v1/corporate/requests')
      .field('data', JSON.stringify({ type: 'ANNUAL', ...company, services: ['gmp'] }));
    expect(res.status).toBe(400);
  });

  it('ينشئ طلبًا عاجلًا ويحوله الأدمن إلى عقد نشط', async () => {
    const res = await request(app)
      .post('/api/v1/corporate/requests')
      .field(
        'data',
        JSON.stringify({
          type: 'URGENT',
          ...company,
          services: ['u-argon'],
          workLocation: 'خط التعبئة 2',
          productionImpact: 'PARTIAL_STOP',
          productionLineAffected: true,
          urgencyLevel: 'HIGH',
        }),
      )
      .attach('license', PNG_1PX, { filename: 'license.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.message).toContain('لحام آرغون');
    expect(res.body.data.message).toContain('يمكن الإيقاف جزئيًا');

    const admin = await createAdmin();
    const contract = await admin.post(`/api/v1/admin/corporate/requests/${res.body.data.id}/contract`).send({
      title: 'عقد صيانة سنوي 2026',
      startDate: '2026-01-01',
      endDate: '2099-12-31',
      value: 12000,
    });
    expect(contract.status).toBe(201);
    expect(contract.body.data.status).toBe('ACTIVE');
    const r = await prisma.corporateRequest.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(r.status).toBe('CONFIRMED');
  });

  it('يرفض خدمة لا تخص نوع الطلب', async () => {
    const res = await request(app)
      .post('/api/v1/corporate/requests')
      .send({ type: 'URGENT', ...company, services: ['gmp'], workLocation: 'x', productionImpact: 'CANNOT_STOP', productionLineAffected: false, urgencyLevel: 'LOW' });
    expect(res.status).toBe(400);
  });
});
