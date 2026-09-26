import { createHmac, timingSafeEqual } from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { formatJOD } from '../lib/money';
import { prisma } from '../lib/prisma';

/**
 * النشرة البريدية: رسالة موحّدة لكل العملاء المسجّلين الذين لديهم بريد ووافقوا على الاستلام.
 * الإرسال عبر SMTP (مثل Gmail بكلمة مرور تطبيق). في الاختبارات تُستخدم وسيلة وهمية لا ترسل شيئًا.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = env.isTest
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
  return transporter;
}

export const emailReady = () => env.emailEnabled || env.isTest;

// ───────────── إلغاء الاشتراك ─────────────

export function unsubscribeToken(customerId: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`unsub:${customerId}`).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribeToken(customerId: string, token: string) {
  const a = Buffer.from(unsubscribeToken(customerId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function unsubscribeUrls(customerId: string) {
  const qs = `c=${encodeURIComponent(customerId)}&t=${unsubscribeToken(customerId)}`;
  return {
    /** صفحة في الموقع يؤكد منها العميل الإلغاء */
    page: `${env.siteUrl}/unsubscribe?${qs}`,
    /** إلغاء بنقرة واحدة من زر البريد (List-Unsubscribe-Post) */
    oneClick: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/email/unsubscribe?${qs}`,
  };
}

// ───────────── القالب ─────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${env.siteUrl}${url.startsWith('/') ? '' : '/'}${url}`);

export type CampaignContent = {
  subject: string;
  body: string;
  ctaKind: 'none' | 'product' | 'bookings' | 'corporate' | 'store';
  product?: { name: string; slug: string; finalPrice: unknown; price: unknown; discountPercent: number; image: string | null } | null;
};

const CTA: Record<Exclude<CampaignContent['ctaKind'], 'none' | 'product'>, { label: string; path: string }> = {
  bookings: { label: 'احجز موعدك', path: '/bookings' },
  corporate: { label: 'خدمات الشركات', path: '/corporate' },
  store: { label: 'تصفّح المتجر', path: '/store' },
};

export function renderCampaign(c: CampaignContent, recipient: { name: string; id: string }) {
  const brand = env.MAIL_FROM_NAME;
  const unsub = unsubscribeUrls(recipient.id);
  const paragraphs = c.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.8">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  let cta: { label: string; url: string } | null = null;
  let productHtml = '';
  let productText = '';
  if (c.ctaKind === 'product' && c.product) {
    const p = c.product;
    const url = `${env.siteUrl}/store/${encodeURIComponent(p.slug)}`;
    cta = { label: 'شاهد المنتج', url };
    const price =
      p.discountPercent > 0
        ? `<span style="color:#1F2937;font-weight:700">${esc(formatJOD(p.finalPrice as number))}</span> <span style="color:#6B7280;text-decoration:line-through;font-size:13px">${esc(formatJOD(p.price as number))}</span>`
        : `<span style="color:#1F2937;font-weight:700">${esc(formatJOD(p.finalPrice as number))}</span>`;
    productHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:14px;margin:6px 0 20px">
        <tr><td style="padding:14px">
          ${p.image ? `<img src="${esc(absolute(p.image))}" alt="${esc(p.name)}" width="100%" style="display:block;border-radius:10px;max-height:260px;object-fit:cover;margin-bottom:12px">` : ''}
          <div style="font-size:17px;font-weight:700;color:#1F2937">${esc(p.name)}</div>
          <div style="margin-top:6px">${price}</div>
        </td></tr>
      </table>`;
    productText = `\n\n${p.name} — ${formatJOD(p.finalPrice as number)}\n${url}`;
  } else if (c.ctaKind !== 'none' && c.ctaKind !== 'product') {
    cta = { label: CTA[c.ctaKind].label, url: `${env.siteUrl}${CTA[c.ctaKind].path}` };
  }

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;background:#F9FAFB;font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:#1F2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;text-align:right" dir="rtl">
        <tr><td style="padding:22px 24px;border-bottom:1px solid #E5E7EB">
          <span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:9px;background:#E8B40B;color:#1F2937;font-weight:700;font-family:Arial,sans-serif;vertical-align:middle">F</span>
          <span style="font-size:18px;font-weight:700;vertical-align:middle;margin-right:8px">${esc(brand)}</span>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.5;color:#1F2937">${esc(c.subject)}</h1>
          <p style="margin:0 0 14px;color:#6B7280">مرحبًا ${esc(recipient.name)}،</p>
          ${paragraphs}
          ${productHtml}
          ${cta ? `<a href="${esc(cta.url)}" style="display:inline-block;background:#E8B40B;color:#1F2937;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${esc(cta.label)}</a>` : ''}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280;line-height:1.7">
          وصلتك هذه الرسالة لأنك مسجّل في ${esc(brand)}.
          <a href="${esc(unsub.page)}" style="color:#6B7280">إلغاء الاشتراك في الرسائل</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `مرحبًا ${recipient.name}،\n\n${c.body.trim()}${productText}${cta && c.ctaKind !== 'product' ? `\n\n${cta.label}: ${cta.url}` : ''}\n\n—\n${brand}\nإلغاء الاشتراك: ${unsub.page}`;
  return { html, text, unsub };
}

// ───────────── الإرسال ─────────────

export async function sendOne(to: string, c: CampaignContent, recipient: { name: string; id: string }) {
  const { html, text, unsub } = renderCampaign(c, recipient);
  await getTransporter().sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.SMTP_USER || 'no-reply@example.com' },
    to,
    subject: c.subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsub.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

/** شروط استلام النشرة */
export const recipientsWhere = { deletedAt: null, emailOptIn: true, email: { not: null }, passwordHash: { not: null } } as const;

/** مهلة بين الرسائل لتجنب حدود مزود البريد (Gmail ~ 500 رسالة يوميًا) */
const DELAY_MS = env.isTest ? 0 : 400;

/** يرسل حملة في الخلفية ويحدّث عدادات الإرسال */
export async function runCampaign(campaignId: string, content: CampaignContent) {
  const recipients = await prisma.customer.findMany({
    where: recipientsWhere,
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { recipients: recipients.length } });
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const [i, r] of recipients.entries()) {
    try {
      await sendOne(r.email!, content, r);
      sent++;
    } catch (e) {
      failed++;
      lastError = e instanceof Error ? e.message.slice(0, 300) : 'خطأ غير معروف';
    }
    if ((i + 1) % 10 === 0 || i === recipients.length - 1) {
      await prisma.emailCampaign.update({ where: { id: campaignId }, data: { sent, failed, lastError } });
    }
    if (DELAY_MS) await new Promise((res) => setTimeout(res, DELAY_MS));
  }
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { sent, failed, lastError, status: failed > 0 && sent === 0 && recipients.length > 0 ? 'FAILED' : 'DONE', finishedAt: new Date() },
  });
}

/** عند تشغيل السيرفر: الحملات التي انقطعت (إعادة تشغيل) تُعلَّم كمتوقفة */
export async function markInterruptedCampaigns() {
  await prisma.emailCampaign.updateMany({
    where: { status: 'SENDING' },
    data: { status: 'FAILED', lastError: 'توقف الإرسال بسبب إعادة تشغيل الخادم', finishedAt: new Date() },
  });
}
