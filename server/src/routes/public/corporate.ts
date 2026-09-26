import { Router } from 'express';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { HttpError, asyncHandler, badRequest, ok } from '../../lib/http';
import { makeRef } from '../../lib/ids';
import { CORPORATE_TYPE_AR } from '../../lib/labels';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { accountCustomer } from '../../services/customer.service';
import { corporateMessage, customerConfirmationMessage } from '../../services/messages';
import { POLICIES, storeFile, validateFile } from '../../services/upload.service';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
import { corporateSchema } from '../../validators/corporate';

export const corporateRouter = Router();

corporateRouter.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const services = await prisma.corporateService.findMany({
      where: { active: true },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, key: true, name: true, kind: true },
    });
    ok(res, services);
  }),
);

const upload = memoryUpload(10, 2).fields([
  { name: 'commercialRegister', maxCount: 1 },
  { name: 'license', maxCount: 1 },
]);

/**
 * طلب شركة — multipart/form-data:
 *  data: JSON | commercialRegister: ملف السجل التجاري | license: رخصة الشركة
 */
corporateRouter.post(
  '/requests',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, _res, next) => {
    const open = await prisma.corporateRequest.count({
      where: { customerId: req.auth!.sub, deletedAt: null, status: { in: ['NEW', 'UNDER_REVIEW'] } },
    });
    if (open >= 3) {
      throw new HttpError(429, 'لديك 3 طلبات قيد المراجعة. انتظر ردنا قبل إرسال طلب جديد، أو تواصل معنا.', 'TOO_MANY_OPEN');
    }
    next();
  }),
  uploadGuard(22),
  upload,
  asyncHandler(async (req, res) => {
    let raw: unknown = req.body;
    if (req.is('multipart/form-data')) {
      try {
        raw = JSON.parse(String(req.body.data ?? ''));
      } catch {
        throw badRequest('صيغة البيانات غير صحيحة');
      }
    }
    const input = corporateSchema.parse(raw);
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const cr = files.commercialRegister?.[0];
    const lic = files.license?.[0];

    if (input.type === 'ANNUAL' && (!cr || !lic)) {
      throw badRequest('ارفع السجل التجاري ورخصة الشركة', { field: !cr ? 'commercialRegister' : 'license' });
    }

    const services = await prisma.corporateService.findMany({
      where: { key: { in: input.services }, kind: input.type, active: true },
    });
    if (services.length !== new Set(input.services).size) throw badRequest('إحدى الخدمات المختارة غير صحيحة', { field: 'services' });

    const crType = cr ? validateFile(cr, POLICIES.documents) : null;
    const licType = lic ? validateFile(lic, POLICIES.documents) : null;
    const [crStored, licStored] = await Promise.all([
      cr && crType ? storeFile(cr, 'corporate', crType) : null,
      lic && licType ? storeFile(lic, 'corporate', licType) : null,
    ]);

    const request = await prisma.$transaction(async (tx) => {
      const customer = await accountCustomer(tx, req.auth!.sub, { companyName: input.companyName });
      const created = await tx.corporateRequest.create({
        data: {
          ref: makeRef('C'),
          type: input.type,
          customerId: customer.id,
          companyName: input.companyName,
          contactName: input.contactName,
          managerPhone: input.managerPhone,
          maintenancePhone: input.maintenancePhone,
          locationText: input.locationText,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          commercialRegisterUrl: crStored?.url ?? null,
          licenseUrl: licStored?.url ?? null,
          notes: input.notes ?? null,
          ...(input.type === 'URGENT'
            ? {
                workLocation: input.workLocation,
                productionImpact: input.productionImpact,
                productionLineAffected: input.productionLineAffected,
                urgencyLevel: input.urgencyLevel,
              }
            : {}),
          whatsappText: '',
          services: { connect: services.map((s) => ({ id: s.id })) },
        },
        include: { services: true },
      });
      return tx.corporateRequest.update({
        where: { id: created.id },
        data: { whatsappText: corporateMessage(created) },
        include: { services: true },
      });
    });

    const wa = await notifyAdmin(request.whatsappText, { entityType: 'corporate', entityId: request.id });
    await notifyCustomer(
      request.managerPhone,
      customerConfirmationMessage('طلب شركتكم', request.number, request.ref, request.contactName),
      { entityType: 'corporate', entityId: request.id },
    );
    emitAdmin({
      type: 'corporate.created',
      id: request.id,
      title: `${CORPORATE_TYPE_AR[request.type]} — ${request.companyName}`,
    });
    await audit({ actorType: 'public', action: 'create', entity: 'corporate', entityId: request.id });

    ok(
      res,
      {
        id: request.id,
        number: request.number,
        ref: request.ref,
        type: request.type,
        status: request.status,
        services: request.services.map((s) => s.name),
        message: request.whatsappText,
        whatsapp: { link: wa.link, sent: wa.sent },
      },
      201,
    );
  }),
);
