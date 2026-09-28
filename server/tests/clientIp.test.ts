import type { Request } from 'express';
import request from 'supertest';
import { clientIp } from '../src/lib/clientIp';
import { app, createAdmin, prisma, resetDb } from './helpers';

const req = (xff: string | undefined, remote = '10.1.2.3') =>
  ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: remote } }) as unknown as Request;

describe('عنوان الزائر لحدود المحاولات', () => {
  it('يتخطى وسطاء الاستضافة (شبكات داخلية وCloudflare) ويأخذ عنوان الزائر', () => {
    // زائر → Cloudflare → موازن داخلي
    expect(clientIp(req('203.0.113.7, 172.70.1.1'))).toBe('203.0.113.7');
    expect(clientIp(req('203.0.113.7, 104.23.1.1, 10.0.0.5'))).toBe('203.0.113.7');
    // طلب مباشر عبر الموازن فقط
    expect(clientIp(req('198.51.100.9'))).toBe('198.51.100.9');
  });

  it('السلسلة الفعلية على Render (زائر → Cloudflare → إعادة توجيه الواجهة → Cloudflare → موازن)', () => {
    const chain = '176.29.156.75, 172.71.147.70, 172.71.147.70, 74.220.48.206, 162.158.95.142, 10.28.143.212';
    expect(clientIp(req(chain, '::1'))).toBe('176.29.156.75');
  });

  it('لا يمكن للزائر انتحال عنوان بإضافة X-Forwarded-For بنفسه', () => {
    // الزائر أرسل "1.2.3.4" مزيّفًا، والوسطاء أضافوا عنوانه الحقيقي على اليمين
    expect(clientIp(req('1.2.3.4, 203.0.113.7, 172.70.1.1'))).toBe('203.0.113.7');
  });

  it('يعمل محليًا بدون وسطاء', () => {
    expect(clientIp(req(undefined, '::ffff:127.0.0.1'))).toBe('127.0.0.1');
  });

  it('فحص الشبكة متاح للأدمن فقط', async () => {
    await resetDb();
    expect((await request(app).get('/api/v1/admin/settings/network')).status).toBe(401);
    const admin = await createAdmin();
    const res = await admin.get('/api/v1/admin/settings/network').set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(200);
    expect(res.body.data.clientIp).toBe('203.0.113.7');
    await prisma.$disconnect();
  });
});
