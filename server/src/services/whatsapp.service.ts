import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { getSettings } from './settings.service';

/**
 * خدمة واتساب بواجهة واحدة تعمل بحالتين:
 * 1) افتراضيًا: تجهّز رابط wa.me بالرسالة ليضغطه المستخدم.
 * 2) إذا وُجد WA_TOKEN و WA_PHONE_ID: ترسل الرسالة تلقائيًا عبر WhatsApp Cloud API
 *    وتُرجع رابط wa.me أيضًا كنسخة احتياطية.
 */

export type WhatsAppResult = {
  to: string;
  link: string;
  /** هل أُرسلت الرسالة تلقائيًا عبر Cloud API */
  sent: boolean;
  channel: 'LINK' | 'CLOUD_API';
  error?: string;
};

type SendOptions = {
  entityType?: string;
  entityId?: string;
  /** أرسل تلقائيًا إن كان Cloud API مفعّلًا (افتراضي: نعم) */
  autoSend?: boolean;
};

export function buildWaLink(to: string, text: string): string {
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

async function sendViaCloudApi(to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/${env.WA_API_VERSION}/${env.WA_PHONE_ID}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body: text.slice(0, 4096) },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WhatsApp API ${res.status}: ${body.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function log(result: WhatsAppResult, message: string, opts: SendOptions) {
  try {
    await prisma.whatsAppLog.create({
      data: {
        to: result.to,
        channel: result.channel,
        status: result.sent ? 'SENT' : result.error ? 'FAILED' : 'PREPARED',
        message,
        link: result.link,
        error: result.error,
        entityType: opts.entityType,
        entityId: opts.entityId,
      },
    });
  } catch (e) {
    console.error('whatsapp log failed', e);
  }
}

/** إرسال (أو تجهيز) رسالة لرقم معيّن */
export async function sendWhatsApp(to: string, text: string, opts: SendOptions = {}): Promise<WhatsAppResult> {
  const link = buildWaLink(to, text);
  const result: WhatsAppResult = { to, link, sent: false, channel: 'LINK' };
  if (env.waCloudEnabled && opts.autoSend !== false && !env.isTest) {
    result.channel = 'CLOUD_API';
    try {
      await sendViaCloudApi(to, text);
      result.sent = true;
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      console.error('WhatsApp Cloud API failed:', result.error);
    }
  }
  await log(result, text, opts);
  return result;
}

/** رسالة للإدارة. الرابط الناتج يفتحه العميل ليرسل الطلب لرقم الإدارة */
export async function notifyAdmin(text: string, opts: SendOptions = {}): Promise<WhatsAppResult> {
  const s = await getSettings();
  return sendWhatsApp(s.whatsappNumber, text, opts);
}

/** رسالة للعميل (تُرسل تلقائيًا فقط مع Cloud API، وإلا يُرجع رابطًا يستخدمه الأدمن) */
export async function notifyCustomer(phone: string, text: string, opts: SendOptions = {}): Promise<WhatsAppResult> {
  return sendWhatsApp(phone, text, opts);
}

export function whatsappMode() {
  return env.waCloudEnabled ? 'CLOUD_API' : 'LINK';
}
