import fs from 'fs';
import request from 'supertest';
import { LOCAL_UPLOAD_DIR } from '../src/services/upload.service';
import { app, createAdmin, createCustomer, nextWorkingDate, PNG_1PX, prisma, resetDb } from './helpers';

const base = {
  name: 'أحمد السعدي',
  phone: '0791234567',
  locationText: 'عمّان — خلدا',
  floor: '2',
};

function inspection(date: string, time: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'INSPECTION',
    ...base,
    date,
    time,
    zone: 'INSIDE_AMMAN',
    urgency: 'NORMAL',
    details: { faultType: 'تسريب مياه', description: 'رطوبة في سقف الحمام' },
    ...extra,
  };
}

let user: Awaited<ReturnType<typeof createCustomer>>;
beforeEach(async () => {
  await resetDb();
  user = await createCustomer({ name: base.name, phone: base.phone });
});
afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(LOCAL_UPLOAD_DIR, { recursive: true, force: true });
});

describe('GET /api/v1/bookings/slots', () => {
  it('يعيد أوقات يوم العمل كلها متاحة عند عدم وجود حجوزات', async () => {
    const date = nextWorkingDate();
    const res = await request(app).get('/api/v1/bookings/slots').query({ date });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.open).toBe(true);
    expect(res.body.data.gapHours).toBe(3);
    expect(res.body.data.slots.length).toBeGreaterThan(0);
    expect(res.body.data.slots.every((s: { available: boolean }) => s.available)).toBe(true);
  });

  it('يرفض صيغة تاريخ خاطئة', async () => {
    const res = await request(app).get('/api/v1/bookings/slots').query({ date: '29-09-2026' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('POST /api/v1/bookings', () => {
  it('ينشئ حجز كشف ويحسب رسوم الكشف داخل عمّان ويولّد رابط واتساب', async () => {
    const date = nextWorkingDate();
    const res = await user.post('/api/v1/bookings').send(inspection(date, '10:00'));
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    const d = res.body.data;
    expect(d.number).toBeGreaterThanOrEqual(1000);
    expect(d.ref).toMatch(/^B-[A-Z0-9]{6}$/);
    expect(d.inspectionFee).toBe(25);
    expect(d.whatsapp.link).toMatch(/^https:\/\/wa\.me\/962780192930\?text=/);
    expect(d.whatsapp.sent).toBe(false);
    expect(d.message).toContain('كشف أعطال بناء');
    expect(d.message).toContain('رسوم الكشف: 25 د.أ');

    const customer = await prisma.customer.findUnique({ where: { phone: '962791234567' } });
    expect(customer?.name).toBe('أحمد السعدي');
    const log = await prisma.whatsAppLog.findFirst({ where: { entityId: d.id } });
    expect(log?.channel).toBe('LINK');
  });

  it('الكشف الفني ثابت لكل المحافظات: عادي 25، عاجل 50، طارئ 70 (المنطقة لا تؤثر)', async () => {
    const date = nextWorkingDate();
    const urgent = await user.post('/api/v1/bookings').send(inspection(date, '08:00', { urgency: 'URGENT', zone: 'OUTSIDE_AMMAN' }));
    expect(urgent.status).toBe(201);
    expect(urgent.body.data.inspectionFee).toBe(50);
    expect(urgent.body.data.message).toContain('عاجل');

    const emergency = await user.post('/api/v1/bookings').send(inspection(date, '12:00', { urgency: 'EMERGENCY' }));
    expect(emergency.status).toBe(201);
    expect(emergency.body.data.inspectionFee).toBe(70);
  });

  it('الكشف على الدهان: 15 داخل عمّان و25 خارجها، والمنطقة مطلوبة', async () => {
    const date = nextWorkingDate();
    const painting = (time: string, zone?: string) => ({
      type: 'PAINTING',
      ...base,
      date,
      time,
      ...(zone ? { zone } : {}),
      details: { paintType: 'بلاستيك', jobKind: 'NEW', rooms: 2, area: 80, decorations: false },
    });
    const missing = await user.post('/api/v1/bookings').send(painting('08:00'));
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.zone).toBeDefined();
    const inside = await user.post('/api/v1/bookings').send(painting('08:00', 'INSIDE_AMMAN'));
    expect(inside.body.data.inspectionFee).toBe(15);
    const outside = await user.post('/api/v1/bookings').send(painting('12:00', 'OUTSIDE_AMMAN'));
    expect(outside.body.data.inspectionFee).toBe(25);
  });

  it('يمنع حجزين بفارق أقل من 3 ساعات ويعطّل الأوقات في جدول المواعيد', async () => {
    const date = nextWorkingDate();
    const first = await user.post('/api/v1/bookings').send(inspection(date, '10:00'));
    expect(first.status).toBe(201);

    const tooClose = await user
      .post('/api/v1/bookings')
      .send(inspection(date, '12:00', { phone: '0781111111' }));
    expect(tooClose.status).toBe(400);
    expect(tooClose.body.error.details.field).toBe('time');

    const slots = await request(app).get('/api/v1/bookings/slots').query({ date });
    const byTime = Object.fromEntries(slots.body.data.slots.map((s: { time: string; available: boolean }) => [s.time, s]));
    expect(byTime['08:00'].available).toBe(false);
    expect(byTime['12:00'].available).toBe(false);
    expect(byTime['12:00'].reason).toBe('booked');
    expect(byTime['13:00'].available).toBe(true);

    const ok = await user
      .post('/api/v1/bookings')
      .send(inspection(date, '13:00', { phone: '0781111111' }));
    expect(ok.status).toBe(201);
  });

  it('لا يسمح بحجزين متزامنين لنفس الوقت', async () => {
    const date = nextWorkingDate(3);
    const [a, b] = await Promise.all([
      user.post('/api/v1/bookings').send(inspection(date, '14:00')),
      user.post('/api/v1/bookings').send(inspection(date, '14:00', { phone: '0782222222' })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('يرفض يوم الجمعة (ليس يوم عمل)', async () => {
    let date = nextWorkingDate();
    // ابحث عن أقرب جمعة
    for (let i = 0; i < 7; i++) {
      const [y, m, d] = date.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      if (dt.getUTCDay() === 5) {
        date = dt.toISOString().slice(0, 10);
        break;
      }
    }
    const res = await user.post('/api/v1/bookings').send(inspection(date, '10:00'));
    expect(res.status).toBe(400);
  });

  it('يعيد أخطاء الحقول بالعربي', async () => {
    const res = await user
      .post('/api/v1/bookings')
      .send({ type: 'PAINTING', ...base, phone: '123', date: nextWorkingDate(), time: '10:00', details: { rooms: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.phone).toContain('رقم الهاتف غير صحيح');
    expect(res.body.error.fields['details.rooms']).toBeDefined();
    expect(res.body.error.fields['details.paintType']).toBe('نوعية الدهان مطلوب');
  });

  it('يقبل صورًا عبر multipart ويرفض الملفات غير المدعومة', async () => {
    const date = nextWorkingDate();
    const data = JSON.stringify({
      type: 'PAINTING',
      ...base,
      date,
      time: '09:00',
      zone: 'INSIDE_AMMAN',
      details: { paintType: 'بلاستيك', jobKind: 'RENEW', rooms: 3, area: 120, colors: 'أبيض', decorations: false },
    });
    const okRes = await user
      .post('/api/v1/bookings')
      .field('data', data)
      .attach('photos', PNG_1PX, { filename: 'wall.png', contentType: 'image/png' })
      .attach('photos', PNG_1PX, { filename: 'room.png', contentType: 'image/png' });
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.mediaCount).toBe(2);

    const bad = await user
      .post('/api/v1/bookings')
      .field('data', JSON.stringify({ ...JSON.parse(data), time: '15:00' }))
      .attach('photos', Buffer.from('#!/bin/sh\necho hacked'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('غير مدعوم');
  });

  it('يرفض أكثر من 5 صور', async () => {
    const date = nextWorkingDate();
    let req = user
      .post('/api/v1/bookings')
      .field('data', JSON.stringify({ type: 'GENERAL', ...base, date, time: '09:00', details: { description: 'تركيب رفوف' } }));
    for (let i = 0; i < 6; i++) req = req.attach('photos', PNG_1PX, { filename: `p${i}.png`, contentType: 'image/png' });
    const res = await req;
    expect(res.status).toBe(400);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('أعمال البناء تتطلب الإحداثيات وملف التصميم عند اختيار "يوجد تصميم"', async () => {
    const date = nextWorkingDate();
    const body = {
      type: 'CONSTRUCTION',
      ...base,
      date,
      time: '09:00',
      details: { tiles: true, buildingType: 'VILLA', landArea: 500, buildArea: 300, floors: 2, hasDesign: true },
    };
    const noGps = await user.post('/api/v1/bookings').send(body);
    expect(noGps.status).toBe(400);

    const noDesign = await user.post('/api/v1/bookings').send({ ...body, lat: 31.95, lng: 35.91 });
    expect(noDesign.status).toBe(400);
    expect(noDesign.body.error.details.field).toBe('designFiles');

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const ok = await user
      .post('/api/v1/bookings')
      .field('data', JSON.stringify({ ...body, lat: 31.95, lng: 35.91 }))
      .attach('designFiles', pdf, { filename: 'plan.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(201);
    const media = await prisma.bookingMedia.findMany({ where: { bookingId: ok.body.data.id } });
    expect(media).toHaveLength(1);
    expect(media[0].purpose).toBe('design');
    expect(media[0].kind).toBe('DOCUMENT');
  });
});

describe('إدارة الحجوزات', () => {
  it('الأدمن يغيّر الحالة ويعيد الجدولة مع احترام فارق الساعات', async () => {
    const date = nextWorkingDate();
    const a = await user.post('/api/v1/bookings').send(inspection(date, '08:00'));
    await user.post('/api/v1/bookings').send(inspection(date, '14:00', { phone: '0781111111' }));

    expect((await request(app).patch(`/api/v1/admin/bookings/${a.body.data.id}`).send({ status: 'CONFIRMED' })).status).toBe(401);

    const admin = await createAdmin();
    const upd = await admin.patch(`/api/v1/admin/bookings/${a.body.data.id}`).send({ status: 'CONFIRMED' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.booking.status).toBe('CONFIRMED');
    expect(upd.body.data.whatsapp.link).toContain('wa.me/962791234567');

    const clash = await admin.patch(`/api/v1/admin/bookings/${a.body.data.id}`).send({ date, time: '12:00' });
    expect(clash.status).toBe(409);

    const moved = await admin.patch(`/api/v1/admin/bookings/${a.body.data.id}`).send({ date, time: '10:00' });
    expect(moved.status).toBe(200);
  });

  it('العميل المسجّل يرى حجوزاته في حسابه', async () => {
    const date = nextWorkingDate();
    await user.post('/api/v1/bookings').send(inspection(date, '10:00'));
    const overview = await user.get('/api/v1/account/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.data.bookings).toHaveLength(1);
    expect(overview.body.data.finance.billed).toBe(25);
  });

  it('لا حجز بدون تسجيل دخول، ولا حجز بحساب أدمن', async () => {
    const date = nextWorkingDate();
    const guest = await request(app).post('/api/v1/bookings').send(inspection(date, '10:00'));
    expect(guest.status).toBe(401);
    expect(guest.body.error.message).toBe('يجب تسجيل الدخول');
    const admin = await createAdmin();
    const asAdmin = await admin.post('/api/v1/bookings').send(inspection(date, '10:00'));
    expect(asAdmin.status).toBe(403);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('مسار الدخول برقم المرجع لم يعد موجودًا', async () => {
    const res = await request(app).post('/api/v1/auth/customer/login').send({ phone: '0791234567', secret: 'B-ABCDEF' });
    expect(res.status).toBe(404);
  });

  it('حد 3 حجوزات مفتوحة لكل عميل (يمنع حجز كل المواعيد بحساب واحد)', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await user.post('/api/v1/bookings').send(inspection(nextWorkingDate(2, i), '10:00'));
      expect(r.status).toBe(201);
    }
    const fourth = await user.post('/api/v1/bookings').send(inspection(nextWorkingDate(2, 3), '10:00'));
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('TOO_MANY_OPEN');
  });

  it('يرفض رفع ملفات أكبر من الحد الكلي قبل تحميلها', async () => {
    const res = await user
      .post('/api/v1/bookings')
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .set('Content-Length', String(50 * 1024 * 1024))
      .send('--x--');
    expect(res.status).toBe(413);
  });
});
