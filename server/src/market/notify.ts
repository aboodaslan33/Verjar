import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { emailReady, sendTransactional } from '../services/email.service';
import { emailLayout, esc } from '../services/emailTemplates';
import { notify, type NotifyTarget } from '../services/notifications.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * إشعارات السوق: داخل الموقع دائمًا + بريد إلكتروني (إن كان البريد مفعّلًا وللمستلم بريد).
 * WhatsApp/SMS لاحقًا عبر notify() دون تغيير من يستدعي.
 * البريد يُرسل بعد انتهاء المعاملة حتى لا يؤخرها أو يُفشلها.
 */
export async function marketNotify(
  db: Db,
  to: { vendorIds?: string[]; customerIds?: string[] },
  msg: { title: string; body: string; link?: string; cta?: string },
) {
  const targets: NotifyTarget[] = [
    ...(to.vendorIds ?? []).map((vendorId) => ({ type: 'VENDOR' as const, vendorId })),
    ...(to.customerIds ?? []).map((customerId) => ({ type: 'CUSTOMER' as const, customerId })),
  ];
  if (!targets.length) return;
  await notify(db, targets, { title: msg.title, body: msg.body, link: msg.link ?? null });
  if (!emailReady()) return;
  const [vendors, customers] = await Promise.all([
    to.vendorIds?.length ? db.vendor.findMany({ where: { id: { in: to.vendorIds } }, select: { name: true, email: true, customer: { select: { email: true } } } }) : [],
    to.customerIds?.length ? db.customer.findMany({ where: { id: { in: to.customerIds } }, select: { name: true, email: true } }) : [],
  ]);
  const recipients = [
    ...vendors.map((v) => ({ name: v.name, email: v.email ?? v.customer?.email ?? null })),
    ...customers.map((c) => ({ name: c.name, email: c.email })),
  ].filter((r): r is { name: string; email: string } => Boolean(r.email));
  setImmediate(() => {
    for (const r of recipients) void sendMarketEmail(r.email, r.name, msg).catch((e) => console.error('market email failed', e));
  });
}

async function sendMarketEmail(to: string, name: string, msg: { title: string; body: string; link?: string; cta?: string }) {
  const url = msg.link ? `${env.siteUrl}${msg.link}` : env.siteUrl;
  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#F1A428">FARJAR Industrial Marketplace</p>
    <h1 style="margin:0 0 14px;font-size:21px;line-height:1.5;color:#1F2937">${esc(msg.title)}</h1>
    <p style="margin:0 0 6px;color:#6B7280">مرحبًا ${esc(name.split(/\s+/)[0] || name)}،</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.9;color:#374151">${esc(msg.body)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#F1A428;border-radius:12px"><a href="${esc(url)}" style="display:inline-block;padding:13px 24px;color:#262627;font-weight:700;font-size:15px;text-decoration:none">${esc(msg.cta ?? 'عرض التفاصيل')}</a></td>
    </tr></table>`;
  const html = await emailLayout({ title: msg.title, preheader: msg.body.slice(0, 120), body, reason: 'إشعار تلقائي من سوق FARJAR الصناعي.' });
  await sendTransactional(to, { subject: `${msg.title} — FARJAR`, html, text: `${msg.title}\n\n${msg.body}\n\n${url}` });
}

/**
 * بريد تلقائي لكل مورد عند بيع منتجاته: المنتجات والكميات وسعره ومستحقه بعد نسبة فرجار.
 * يُستدعى بعد حفظ الطلب (خارج المعاملة)، وفشل البريد لا يؤثر على الطلب.
 */
export async function emailSuppliersOfSale(orderId: string) {
  if (!emailReady()) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      code: true,
      number: true,
      vendorOrders: {
        where: { vendor: { isHouse: false } },
        select: {
          id: true,
          vendorNet: true,
          vendor: { select: { name: true, email: true, customer: { select: { email: true } } } },
          items: { select: { name: true, variant: true, quantity: true, supplierUnitPrice: true, vendorNet: true } },
        },
      },
    },
  });
  if (!order) return;
  const code = order.code ?? `#${order.number}`;
  for (const vo of order.vendorOrders) {
    const to = vo.vendor.email ?? vo.vendor.customer?.email;
    if (!to) continue;
    const lines = vo.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ''} × ${i.quantity}`).join('، ');
    void sendMarketEmail(to, vo.vendor.name, {
      title: `تم بيع منتجاتك — طلب ${code}`,
      body: `اشترى عميل من متجرك: ${lines}. مستحقك من هذا الطلب ${Number(vo.vendorNet)} د.أ (بعد نسبة فرجار). جهّز الطلب وحدّث حالته من لوحة المورد.`,
      link: `/vendor/orders/${vo.id}`,
      cta: 'عرض الطلب',
    }).catch((e) => console.error('sale email failed', e));
  }
}
