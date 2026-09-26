import request from 'supertest';
import { unsubscribeToken } from '../src/services/email.service';
import { app, createAdmin, createCustomer, createProduct, prisma, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function waitDone(admin: Awaited<ReturnType<typeof createAdmin>>, id: string) {
  for (let i = 0; i < 50; i++) {
    const r = await admin.get(`/api/admin/newsletter/${id}`);
    if (r.body.data.status !== 'SENDING') return r.body.data;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('campaign did not finish');
}

describe('النشرة البريدية', () => {
  it('ترسل للمسجّلين الموافقين فقط، وتسجل العدادات', async () => {
    await createCustomer({ phone: '0791000001', email: 'a@example.com' });
    await createCustomer({ phone: '0791000002', email: 'b@example.com' });
    await createCustomer({ phone: '0791000003' }); // بدون بريد
    const out = await createCustomer({ phone: '0791000004', email: 'c@example.com' });
    await out.patch('/api/auth/profile').send({ emailOptIn: false });

    const admin = await createAdmin();
    const status = await admin.get('/api/admin/newsletter');
    expect(status.body.data.subscribers).toBe(2);

    const p = await createProduct({ name: 'طاولة حديقة' });
    const res = await admin.post('/api/admin/newsletter').send({
      subject: 'منتج جديد في المتجر',
      body: 'نزل منتج جديد، شوفه على الموقع.',
      ctaKind: 'product',
      productId: p.id,
    });
    expect(res.status).toBe(202);
    const done = await waitDone(admin, res.body.data.id);
    expect(done).toMatchObject({ status: 'DONE', recipients: 2, sent: 2, failed: 0 });
  });

  it('المعاينة تهرّب المحتوى (لا حقن HTML) وتضم رابط إلغاء الاشتراك', async () => {
    const admin = await createAdmin();
    const r = await admin.post('/api/admin/newsletter/preview').send({
      subject: '<script>alert(1)</script> خدمة جديدة',
      body: 'نقدم الآن <b>عزل الأسطح</b>',
      ctaKind: 'bookings',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.html).not.toContain('<script>');
    expect(r.body.data.html).toContain('&lt;b&gt;');
    expect(r.body.data.html).toContain('/unsubscribe?c=');
    expect(r.body.data.html).toContain('/bookings');
  });

  it('العميل والزائر لا يصلان للنشرة، والتحقق بالعربي', async () => {
    const c = await createCustomer({ email: 'x@example.com' });
    expect((await c.post('/api/admin/newsletter').send({ subject: 'x', body: 'y' })).status).toBe(403);
    expect((await request(app).get('/api/admin/newsletter')).status).toBe(401);
    const admin = await createAdmin();
    const bad = await admin.post('/api/admin/newsletter').send({ subject: 'ab', body: 'قصير', ctaKind: 'product' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.subject).toBe('العنوان قصير جدًا');
  });

  it('إلغاء الاشتراك برابط موقّع فقط', async () => {
    const agent = await createCustomer({ email: 'u@example.com' });
    const me = await agent.get('/api/auth/me');
    const id = me.body.data.id;
    const wrong = await request(app).post(`/api/email/unsubscribe?c=${id}&t=invalid-token`);
    expect(wrong.status).toBe(400);
    const okRes = await request(app).post(`/api/email/unsubscribe?c=${id}&t=${unsubscribeToken(id)}`).type('form').send('List-Unsubscribe=One-Click');
    expect(okRes.status).toBe(200);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id } })).emailOptIn).toBe(false);
  });
});
