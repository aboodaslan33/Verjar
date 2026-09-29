import type { NotificationRecipient, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { sendWhatsApp } from './whatsapp.service';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * الإشعارات: تُحفظ داخل النظام دائمًا (in_app) ويراها المستخدم في لوحته،
 * وقنوات خارجية اختيارية تُضاف هنا دون تغيير من يرسل الإشعار:
 * - واتساب للعميل عند تفعيل WhatsApp Cloud API
 * - SMS / بريد: نقطة إضافة لاحقة (channels)
 */
export type NotifyTarget =
  | { type: 'USER'; userId: string }
  | { type: 'CUSTOMER'; customerId: string; phone?: string | null }
  | { type: 'VENDOR'; vendorId: string };

export type NotifyInput = { title: string; body: string; orderId?: string | null; link?: string | null; whatsapp?: boolean };

export async function notify(db: Db, targets: NotifyTarget[], input: NotifyInput) {
  const seen = new Set<string>();
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const t of targets) {
    const recipientId = t.type === 'USER' ? t.userId : t.type === 'CUSTOMER' ? t.customerId : t.vendorId;
    const key = `${t.type}:${recipientId}`;
    if (!recipientId || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      recipientType: t.type as NotificationRecipient,
      recipientId,
      userId: t.type === 'USER' ? t.userId : null,
      title: input.title,
      body: input.body,
      orderId: input.orderId ?? null,
      link: input.link ?? null,
    });
  }
  if (rows.length) await db.notification.createMany({ data: rows });

  // قناة واتساب للعميل (تلقائية فقط مع Cloud API؛ في وضع الروابط لا يوجد من يرسلها)
  if (input.whatsapp && env.waCloudEnabled) {
    for (const t of targets) {
      if (t.type === 'CUSTOMER' && t.phone) {
        void sendWhatsApp(t.phone, `${input.title}\n${input.body}`, { entityType: 'order', entityId: input.orderId ?? undefined });
      }
    }
  }
}

/** المستلمون الذين تخصهم جلسة: المستخدم نفسه، أو العميل ومتجره إن كان موردًا */
export async function recipientsOf(auth: { sub: string; role: string }): Promise<{ recipientType: NotificationRecipient; recipientId: string }[]> {
  if (auth.role !== 'CUSTOMER') return [{ recipientType: 'USER', recipientId: auth.sub }];
  // المورد: المالك أو أي موظف في حساب المورد يرى إشعارات المتجر
  const vendors = await prisma.vendor.findMany({
    where: { active: true, OR: [{ customerId: auth.sub }, { members: { some: { customerId: auth.sub } } }] },
    select: { id: true },
  });
  return [{ recipientType: 'CUSTOMER', recipientId: auth.sub }, ...vendors.map((v) => ({ recipientType: 'VENDOR' as const, recipientId: v.id }))];
}
