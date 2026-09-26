import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { memoryUpload } from '../../middleware/upload';
import { quoteFileMessage } from '../../services/messages';
import { POLICIES, deleteStored, storeFile, validateFile } from '../../services/upload.service';
import { notifyCustomer } from '../../services/whatsapp.service';

export const filesRouter = Router();

const upload = memoryUpload(15, 1).single('file');

const fileInput = z
  .object({
    customerId: z.string().optional(),
    bookingId: z.string().optional(),
    orderId: z.string().optional(),
    corporateRequestId: z.string().optional(),
    contractId: z.string().optional(),
    kind: z.enum(['EVALUATION', 'QUOTE', 'CONTRACT', 'INVOICE', 'OTHER']).default('QUOTE'),
    title: z.string().trim().min(2, 'عنوان الملف مطلوب').max(150),
    amount: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
    notify: z.preprocess((v) => v !== 'false' && v !== false, z.boolean()),
  })
  .refine((v) => v.customerId || v.bookingId || v.orderId || v.corporateRequestId || v.contractId, {
    message: 'حدد العميل أو الطلب المرتبط بالملف',
  });

/**
 * رفع ملف تقييم / عرض سعر / عقد للعميل (PDF)
 * يظهر في صفحة العميل ويُرسل رابطه للعميل عبر واتساب
 */
filesRouter.post(
  '/',
  upload,
  asyncHandler(async (req, res) => {
    const input = fileInput.parse(req.body);
    if (!req.file) throw badRequest('اختر ملف PDF');
    const detected = validateFile(req.file, POLICIES.pdfOnly);

    // تحديد العميل من الكيان المرتبط
    let customerId = input.customerId;
    let customerName = '';
    let customerPhone = '';
    const resolvers: [string | undefined, () => Promise<{ customerId: string } | null>][] = [
      [input.bookingId, () => prisma.booking.findFirst({ where: { id: input.bookingId, deletedAt: null }, select: { customerId: true } })],
      [input.orderId, () => prisma.order.findFirst({ where: { id: input.orderId, deletedAt: null }, select: { customerId: true } })],
      [input.corporateRequestId, () => prisma.corporateRequest.findFirst({ where: { id: input.corporateRequestId, deletedAt: null }, select: { customerId: true } })],
      [input.contractId, () => prisma.contract.findFirst({ where: { id: input.contractId, deletedAt: null }, select: { customerId: true } })],
    ];
    for (const [id, find] of resolvers) {
      if (!id) continue;
      const found = await find();
      if (!found) throw notFound('العنصر المرتبط غير موجود');
      if (customerId && customerId !== found.customerId) throw badRequest('العميل لا يطابق الطلب المرتبط');
      customerId = found.customerId;
    }
    const customer = await prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw notFound('العميل غير موجود');
    customerName = customer.name;
    customerPhone = customer.phone;

    const stored = await storeFile(req.file, 'quotes', detected);
    const file = await prisma.$transaction(async (tx) => {
      const created = await tx.quoteFile.create({
        data: {
          customerId: customer.id,
          bookingId: input.bookingId ?? null,
          orderId: input.orderId ?? null,
          corporateRequestId: input.corporateRequestId ?? null,
          contractId: input.contractId ?? null,
          kind: input.kind,
          title: input.title,
          url: stored.url,
          publicId: stored.publicId,
          amount: input.amount != null ? new Prisma.Decimal(input.amount) : null,
          uploadedById: req.auth!.sub,
        },
      });
      // عرض السعر مع مبلغ ينقل الحجز/طلب الشركة إلى "تم التسعير"
      if (input.kind === 'QUOTE' && input.amount != null) {
        if (input.bookingId) {
          await tx.booking.updateMany({
            where: { id: input.bookingId, status: { in: ['NEW', 'UNDER_REVIEW'] } },
            data: { status: 'PRICED' },
          });
          await tx.booking.update({ where: { id: input.bookingId }, data: { quotedAmount: new Prisma.Decimal(input.amount) } });
        }
        if (input.corporateRequestId) {
          await tx.corporateRequest.updateMany({
            where: { id: input.corporateRequestId, status: { in: ['NEW', 'UNDER_REVIEW'] } },
            data: { status: 'PRICED' },
          });
          await tx.corporateRequest.update({
            where: { id: input.corporateRequestId },
            data: { quotedAmount: new Prisma.Decimal(input.amount) },
          });
        }
      }
      if (input.kind === 'CONTRACT' && input.contractId) {
        await tx.contract.update({ where: { id: input.contractId }, data: { fileUrl: stored.url } });
      }
      return created;
    });

    let whatsapp = null;
    if (input.notify) {
      const wa = await notifyCustomer(customerPhone, quoteFileMessage(customerName, input.title, stored.url, input.amount), {
        entityType: 'quoteFile',
        entityId: file.id,
      });
      whatsapp = { link: wa.link, sent: wa.sent };
    }
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'upload', entity: 'quoteFile', entityId: file.id });
    ok(res, { file, whatsapp }, 201);
  }),
);

filesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = await prisma.quoteFile.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    // روابط Cloudinary عامة: الملف المحذوف يُزال فعليًا حتى لا يبقى متاحًا لمن يملك الرابط
    await deleteStored(file.publicId, 'DOCUMENT');
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'quoteFile', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);
