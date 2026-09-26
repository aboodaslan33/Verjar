import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, ok } from '../../lib/http';
import { makeRef } from '../../lib/ids';
import { BOOKING_TYPE_AR } from '../../lib/labels';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload } from '../../middleware/upload';
import { accountCustomer } from '../../services/customer.service';
import { bookingMessage, customerConfirmationMessage } from '../../services/messages';
import { assertSlotAvailable, getDaySlots, inspectionFee } from '../../services/schedule.service';
import { getSettings } from '../../services/settings.service';
import { POLICIES, validateFile, validateAndStore } from '../../services/upload.service';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
import { MAX_DESIGN_FILES, MAX_PHOTOS, bookingSchema } from '../../validators/booking';
import { dateField } from '../../validators/common';

export const bookingsRouter = Router();

/** الأوقات المتاحة ليوم معيّن */
bookingsRouter.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const { date } = z.object({ date: dateField }).parse(req.query);
    ok(res, await getDaySlots(date));
  }),
);

const upload = memoryUpload(10, MAX_PHOTOS + MAX_DESIGN_FILES).fields([
  { name: 'photos', maxCount: MAX_PHOTOS },
  { name: 'designFiles', maxCount: MAX_DESIGN_FILES },
]);

function parseDataField(raw: unknown) {
  if (typeof raw !== 'string') throw badRequest('بيانات الحجز مفقودة');
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('صيغة بيانات الحجز غير صحيحة');
  }
}

/**
 * إنشاء حجز — multipart/form-data:
 *  data: JSON للحقول | photos: حتى 5 صور (5MB) | designFiles: ملفات التصميم (صور أو PDF)
 * يقبل أيضًا application/json بدون ملفات.
 */
bookingsRouter.post(
  '/',
  requireCustomer,
  formLimiter,
  upload,
  asyncHandler(async (req, res) => {
    const raw = req.is('multipart/form-data') ? parseDataField(req.body.data) : req.body;
    const input = bookingSchema.parse(raw);
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const photos = files.photos ?? [];
    const designFiles = files.designFiles ?? [];

    // تحقق من الملفات قبل أي رفع
    photos.forEach((f) => validateFile(f, POLICIES.photos));
    designFiles.forEach((f) => validateFile(f, POLICIES.designFiles));
    const needsDesign =
      (input.type === 'CONSTRUCTION' || input.type === 'METALWORK') && input.details.hasDesign;
    if (needsDesign && designFiles.length === 0) {
      throw badRequest('ارفع ملف التصميم أو اختر "لا يوجد تصميم"', { field: 'designFiles' });
    }
    if (!needsDesign && designFiles.length > 0 && input.type !== 'CONSTRUCTION' && input.type !== 'METALWORK') {
      throw badRequest('هذا النوع من الحجز لا يقبل ملفات تصميم');
    }
    if (input.type === 'CONSTRUCTION' && photos.length > 0) {
      throw badRequest('حجز أعمال البناء يقبل ملف التصميم فقط');
    }
    if (input.type === 'CONSTRUCTION' && (input.lat == null || input.lng == null)) {
      throw badRequest('حدد إحداثيات موقع الأرض من زر تحديد الموقع أو الخريطة', { field: 'lat' });
    }

    // فحص مبدئي للموعد قبل رفع الملفات (الفحص النهائي داخل المعاملة)
    const day = await getDaySlots(input.date);
    const slot = day.slots.find((s) => s.time === input.time);
    if (!day.open || !slot) throw badRequest('اختر يومًا ووقتًا من الأوقات المعروضة', { field: 'time' });
    if (!slot.available) {
      throw badRequest(
        slot.reason === 'booked' ? 'هذا الوقت محجوز، اختر وقتًا آخر' : 'هذا الوقت لم يعد متاحًا',
        { field: 'time' },
      );
    }

    const settings = await getSettings();
    const [storedPhotos, storedDesign] = await Promise.all([
      validateAndStore(photos, POLICIES.photos, 'bookings'),
      validateAndStore(designFiles, POLICIES.designFiles, 'bookings/designs'),
    ]);

    const fee =
      input.type === 'INSPECTION' ? inspectionFee(settings, input.zone, input.urgency) : null;

    const booking = await prisma.$transaction(
      async (tx) => {
        const scheduledAt = await assertSlotAvailable(tx, input.date, input.time);
        const customer = await accountCustomer(tx, req.auth!.sub);
        const created = await tx.booking.create({
          data: {
            ref: makeRef('B'),
            type: input.type,
            customerId: customer.id,
            name: input.name,
            phone: input.phone,
            locationText: input.locationText,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            floor: input.floor ?? null,
            scheduledAt,
            notes: input.notes ?? null,
            urgency: input.type === 'INSPECTION' ? input.urgency : 'NORMAL',
            zone: input.type === 'INSPECTION' ? input.zone : null,
            inspectionFee: fee != null ? new Prisma.Decimal(fee) : null,
            details: input.details as Prisma.InputJsonValue,
            whatsappText: '',
            media: {
              create: [
                ...storedPhotos.map((f) => ({ kind: f.kind, purpose: 'photo', url: f.url, publicId: f.publicId, originalName: f.originalName })),
                ...storedDesign.map((f) => ({ kind: f.kind, purpose: 'design', url: f.url, publicId: f.publicId, originalName: f.originalName })),
              ],
            },
          },
        });
        const text = bookingMessage(created, storedPhotos.length + storedDesign.length);
        return tx.booking.update({ where: { id: created.id }, data: { whatsappText: text }, include: { media: true } });
      },
      { timeout: 15_000 },
    );

    const wa = await notifyAdmin(booking.whatsappText, { entityType: 'booking', entityId: booking.id });
    // تأكيد للعميل (يُرسل تلقائيًا فقط عند تفعيل Cloud API)
    await notifyCustomer(
      booking.phone,
      customerConfirmationMessage('حجزك', booking.number, booking.ref, booking.name),
      { entityType: 'booking', entityId: booking.id },
    );
    emitAdmin({ type: 'booking.created', id: booking.id, title: `حجز #${booking.number} — ${BOOKING_TYPE_AR[booking.type]}` });
    await audit({ actorType: 'public', action: 'create', entity: 'booking', entityId: booking.id });

    ok(
      res,
      {
        id: booking.id,
        number: booking.number,
        ref: booking.ref,
        type: booking.type,
        status: booking.status,
        scheduledAt: booking.scheduledAt,
        inspectionFee: booking.inspectionFee,
        mediaCount: booking.media.length,
        message: booking.whatsappText,
        whatsapp: { link: wa.link, sent: wa.sent },
      },
      201,
    );
  }),
);
