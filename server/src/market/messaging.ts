import { badRequest, notFound } from '../lib/http';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/settings.service';
import { maskContacts } from './contacts';
import { marketNotify } from './notify';
import { rfqEvent } from './rfq';

export type Side = 'CUSTOMER' | 'VENDOR' | 'ADMIN';

/** هل تُكشف بيانات التواصل بين العميل وهذا المورد؟ بعد قبول عرضه (أو إذا أوقفت الإدارة الإخفاء) */
export async function contactsRevealed(rfq: { status: string; acceptedQuoteId: string | null }, vendorId: string) {
  const s = await getSettings();
  if (!s.hideContactsUntilAward) return true;
  if (!rfq.acceptedQuoteId || !['AWARDED', 'CLOSED'].includes(rfq.status)) return false;
  const q = await prisma.quote.findUnique({ where: { id: rfq.acceptedQuoteId }, select: { vendorId: true } });
  return q?.vendorId === vendorId;
}

export async function getThread(rfqId: string, vendorId: string, side: Side) {
  const conv = await prisma.conversation.findUnique({
    where: { rfqId_vendorId: { rfqId, vendorId } },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
  });
  if (conv && side !== 'ADMIN') {
    await prisma.conversation.update({ where: { id: conv.id }, data: side === 'CUSTOMER' ? { customerReadAt: new Date() } : { vendorReadAt: new Date() } });
  }
  return conv?.messages ?? [];
}

/** رسالة داخل المنصة. تُخفى أرقام الهواتف والبريد والروابط قبل قبول العرض */
export async function postMessage(rfqId: string, vendorId: string, sender: { side: Side; id: string; name: string }, rawBody: string) {
  const body = rawBody.trim();
  if (!body) throw badRequest('اكتب رسالتك', { fields: { body: 'اكتب رسالتك' } });
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { id: true, code: true, title: true, customerId: true, status: true, acceptedQuoteId: true } });
  if (!rfq) throw notFound('الطلب غير موجود');
  const recipient = await prisma.rfqRecipient.findUnique({ where: { rfqId_vendorId: { rfqId, vendorId } } });
  if (!recipient) throw notFound('هذا المورد ليس ضمن موردي الطلب');
  const reveal = sender.side === 'ADMIN' || (await contactsRevealed(rfq, vendorId));
  const clean = reveal ? { text: body, masked: false } : maskContacts(body);
  const now = new Date();
  const msg = await prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.upsert({
      where: { rfqId_vendorId: { rfqId, vendorId } },
      create: { rfqId, vendorId, lastAt: now, ...(sender.side === 'CUSTOMER' ? { customerReadAt: now } : sender.side === 'VENDOR' ? { vendorReadAt: now } : {}) },
      update: { lastAt: now, ...(sender.side === 'CUSTOMER' ? { customerReadAt: now } : sender.side === 'VENDOR' ? { vendorReadAt: now } : {}) },
    });
    const m = await tx.message.create({
      data: { conversationId: conv.id, senderType: sender.side, senderId: sender.id, senderName: sender.name, body: clean.text.slice(0, 4000), masked: clean.masked },
    });
    // التفاوض: أول رسالة تنقل الطلب إلى "قيد التفاوض"
    if (rfq.status === 'QUOTED' || rfq.status === 'DISTRIBUTED') {
      await tx.rfq.update({ where: { id: rfqId }, data: { status: 'NEGOTIATING' } });
      await rfqEvent(tx, rfqId, { kind: sender.side === 'CUSTOMER' ? 'customer' : sender.side === 'VENDOR' ? 'vendor' : 'admin', id: sender.id, name: sender.name }, 'negotiating');
    }
    if (sender.side !== 'VENDOR') {
      await marketNotify(tx, { vendorIds: [vendorId] }, { title: `رسالة جديدة على ${rfq.code}`, body: clean.text.slice(0, 160), link: `/vendor/rfqs/${rfqId}`, cta: 'الرد على الرسالة' });
    }
    if (sender.side !== 'CUSTOMER') {
      await marketNotify(tx, { customerIds: [rfq.customerId] }, { title: `رسالة جديدة على طلبك ${rfq.code}`, body: clean.text.slice(0, 160), link: `/account/rfq/${rfqId}?vendor=${vendorId}`, cta: 'الرد على الرسالة' });
    }
    return m;
  });
  return msg;
}
