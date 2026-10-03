import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { DEFAULT_SETTINGS, invalidateSettingsCache } from '../src/services/settings.service';
import { HOUSE_VENDOR_ID, ensureHouseVendor } from '../src/services/vendor.service';

export const app = createApp();
export { prisma };

/** أقرب يوم عمل بعد عدد أيام معيّن (YYYY-MM-DD) بتوقيت عمّان */
export function nextWorkingDate(minDaysAhead = 2, offset = 0): string {
  const d = new Date(Date.now() + minDaysAhead * 86400_000);
  let found = 0;
  for (let i = 0; i < 60; i++) {
    const cur = new Date(d.getTime() + i * 86400_000);
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(cur);
    const [y, m, day] = iso.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (DEFAULT_SETTINGS.workingDays.includes(wd)) {
      if (found === offset) return iso;
      found++;
    }
  }
  throw new Error('no working day');
}

export async function resetDb() {
  const tables = [
    'RfqEvent', 'Message', 'Conversation', 'Quote', 'RfqRecipient', 'RfqItem', 'SupplierReview', 'Rfq', 'MarketAd', 'VendorSubscription',
    'MarketInvoice', 'VendorMember', 'VendorDailyStat', 'CommissionRule',
    'LoginLock', 'EmailOtp', 'EmailCampaign', 'Payment', 'QuoteFile', 'Contract', 'BookingMedia', 'Booking', 'OrderItem', 'VendorOrder', 'VendorPayout',
    'Order', 'ProductMedia', 'Product', 'Vendor', 'ContractVisit', 'TenderOffer', 'Tender', 'DeliverySettlement', 'Driver',
    'DeliveryCompany', 'RefCounter', '_ContractServices', 'OrderStatusEvent', 'DeliveryAssignment', 'DeliveryProof', 'Notification',
    'Category', '_CorporateRequestToCorporateService', 'CorporateRequest', 'CorporateService', 'Customer', 'Technician',
    'WhatsAppLog', 'AuditLog', 'Setting', 'User', 'MonthlySnapshot', 'CouponRedemption', 'Reward', 'Recognition', 'Coupon', 'LoyaltyPointsLedger',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  // الأرقام المعروضة تبدأ من 1000 كما في الـ migration
  for (const seq of ['Order_number_seq', 'Booking_number_seq', 'CorporateRequest_number_seq', 'VendorOrder_number_seq']) {
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "${seq}" RESTART WITH 1000`);
  }
  invalidateSettingsCache();
}

export async function createAdmin() {
  await prisma.user.create({
    data: { email: 'admin@test.jo', name: 'أدمن', passwordHash: await bcrypt.hash('Admin@12345', 4), role: 'ADMIN' },
  });
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/admin/login').send({ email: 'admin@test.jo', password: 'Admin@12345' });
  if (res.status !== 200) throw new Error('admin login failed');
  return agent;
}

/** عميل مسجّل الدخول (الحجز والطلبات متاحة للمسجّلين فقط) */
export async function createCustomer(data: Partial<{ name: string; phone: string; email: string; password: string }> = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({
    name: data.name ?? 'عميل تجريبي',
    phone: data.phone ?? '0790000001',
    email: data.email,
    password: data.password ?? 'Customer@123',
  });
  if (res.status !== 201) throw new Error(`customer register failed: ${JSON.stringify(res.body)}`);
  return agent;
}

export async function createProduct(
  overrides: Partial<{
    name: string;
    price: number;
    discountPercent: number;
    stock: number;
    visible: boolean;
    vendorId: string;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  }> = {},
) {
  if (!overrides.vendorId) await ensureHouseVendor();
  const category = await prisma.category.upsert({
    where: { slug: 'outdoor' },
    create: { slug: 'outdoor', name: 'أثاث خارجي' },
    update: {},
  });
  const price = overrides.price ?? 50;
  const discount = overrides.discountPercent ?? 10;
  return prisma.product.create({
    data: {
      name: overrides.name ?? 'كرسي حديقة',
      slug: `p-${Math.random().toString(36).slice(2, 8)}`,
      description: 'وصف',
      price: new Prisma.Decimal(price),
      discountPercent: discount,
      finalPrice: new Prisma.Decimal(Math.round(price * (1 - discount / 100) * 1000) / 1000),
      stock: overrides.stock ?? 10,
      visible: overrides.visible ?? true,
      categoryId: category.id,
      vendorId: overrides.vendorId ?? HOUSE_VENDOR_ID,
      approvalStatus: overrides.approvalStatus ?? 'APPROVED',
    },
  });
}

/** عميل مسجّل مع صلاحية مورد يمنحها الأدمن */
export async function createVendor(
  admin: Awaited<ReturnType<typeof createAdmin>>,
  data: { name: string; phone: string; commissionPercent?: number },
) {
  const agent = await createCustomer({ name: data.name, phone: data.phone });
  const customer = await prisma.customer.findFirstOrThrow({ where: { name: data.name } });
  const res = await admin.post('/api/v1/admin/vendors').send({
    customerId: customer.id,
    ...(data.commissionPercent !== undefined ? { commissionPercent: data.commissionPercent } : {}),
  });
  if (res.status !== 201) throw new Error(`grant vendor failed: ${JSON.stringify(res.body)}`);
  return { agent, vendor: res.body.data as { id: string; slug: string; name: string }, customerId: customer.id };
}

/** صورة PNG صغيرة صالحة */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
