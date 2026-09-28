import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, conflict, notFound, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { nextRef } from '../../lib/refs';
import { memoryUpload } from '../../middleware/upload';
import { BRAND } from '../../services/messages';
import { type Attachment, awardTender, checkService, offerInput, storeAttachments, tenderData, tenderInput } from '../../services/tenders.service';

/** عطاءات الشركات من لوحة التحكم: إدارة العطاءات، عرض المنصة، والترسية */
export const tendersAdminRouter = Router();

const statusEnum = z.enum(['DRAFT', 'OPEN', 'CLOSED', 'UNDER_REVIEW', 'AWARDED', 'CANCELLED']);

export const tenderInclude = {
  customer: { select: { id: true, name: true, companyName: true, phone: true } },
  service: { select: { id: true, key: true, name: true } },
  contract: { select: { id: true, ref: true, number: true } },
  _count: { select: { offers: true } },
} satisfies Prisma.TenderInclude;

tendersAdminRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.extend({ status: statusEnum.optional(), q: z.string().trim().max(100).optional() }).parse(req.query);
    const where: Prisma.TenderWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { ref: { contains: q.q.toUpperCase() } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.tender.findMany({ where, orderBy: { createdAt: 'desc' }, include: tenderInclude, ...pageArgs(q) }),
      prisma.tender.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/** عطاء باسم شركة (عميل) من لوحة التحكم */
tendersAdminRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = tenderInput.extend({ customerId: z.string().min(1, 'اختر الشركة'), status: z.enum(['DRAFT', 'OPEN']).default('DRAFT') }).parse(req.body);
    await checkService(input.serviceId);
    if (!(await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } }))) throw notFound('العميل غير موجود');
    const t = await prisma.$transaction(async (tx) =>
      tx.tender.create({ data: { ...(tenderData(input) as Prisma.TenderUncheckedCreateInput), customerId: input.customerId, status: input.status, ref: await nextRef(tx, 'TEN') } }),
    );
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'tender', entityId: t.id, meta: { ref: t.ref } });
    ok(res, t, 201);
  }),
);

tendersAdminRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await prisma.tender.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { ...tenderInclude, offers: { orderBy: { price: 'asc' }, include: { vendor: { select: { id: true, name: true, slug: true } } } } },
    });
    if (!t) throw notFound('العطاء غير موجود');
    const history = await prisma.auditLog.findMany({ where: { entity: 'tender', entityId: t.id }, orderBy: { createdAt: 'desc' }, take: 30, include: { actor: { select: { name: true } } } });
    ok(res, { ...t, history });
  }),
);

tendersAdminRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = tenderInput.partial().extend({ status: statusEnum.exclude(['AWARDED']).optional() }).parse(req.body);
    const current = await prisma.tender.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('العطاء غير موجود');
    if (current.status === 'AWARDED') throw conflict('العطاء مُرسّى ولا يمكن تعديله');
    await checkService(input.serviceId);
    const t = await prisma.tender.update({ where: { id: current.id }, data: tenderData(input) });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'update',
      entity: 'tender',
      entityId: t.id,
      meta: JSON.parse(JSON.stringify({ changes: Object.keys(input), status: input.status ? [current.status, input.status] : undefined })),
    });
    ok(res, t);
  }),
);

const upload = memoryUpload(15, 5).array('files', 5);

tendersAdminRouter.post(
  '/:id/attachments',
  upload,
  asyncHandler(async (req, res) => {
    const t = await prisma.tender.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!t) throw notFound('العطاء غير موجود');
    const added = await storeAttachments(req.files as Express.Multer.File[], 'tenders');
    const u = await prisma.tender.update({ where: { id: t.id }, data: { attachments: [...((t.attachments as Attachment[]) ?? []), ...added] } });
    ok(res, u);
  }),
);

/** عرض المنصة نفسها على العطاء */
tendersAdminRouter.post(
  '/:id/offers',
  asyncHandler(async (req, res) => {
    const input = offerInput.parse(req.body);
    const t = await prisma.tender.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!t) throw notFound('العطاء غير موجود');
    if (t.status === 'AWARDED' || t.status === 'CANCELLED') throw conflict('العطاء مُرسّى أو ملغي');
    const o = await prisma.tenderOffer.create({ data: { tenderId: t.id, providerName: BRAND, price: new Prisma.Decimal(input.price), proposal: input.proposal } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'offer', entity: 'tender', entityId: t.id, meta: { offerId: o.id, price: input.price } });
    ok(res, o, 201);
  }),
);

tendersAdminRouter.post(
  '/:id/award',
  asyncHandler(async (req, res) => {
    const { offerId } = z.object({ offerId: z.string().min(1) }).parse(req.body);
    const t = await awardTender(req.params.id, offerId);
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'award',
      entity: 'tender',
      entityId: t.id,
      meta: { offerId, amount: t.awardedAmount?.toNumber() ?? null, commission: t.commissionAmount?.toNumber() ?? null },
    });
    ok(res, t);
  }),
);

/** إنشاء عقد من العطاء المُرسّى (مسودة يكملها الأدمن من صفحة العقد) */
tendersAdminRouter.post(
  '/:id/contract',
  asyncHandler(async (req, res) => {
    const t = await prisma.tender.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { contract: true } });
    if (!t) throw notFound('العطاء غير موجود');
    if (t.status !== 'AWARDED' || !t.awardedAmount) throw conflict('العطاء غير مُرسّى بعد');
    if (t.contract) throw conflict('للعطاء عقد مسبقًا');
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + (t.durationMonths ?? 12));
    const contract = await prisma.$transaction(async (tx) =>
      tx.contract.create({
        data: {
          ref: await nextRef(tx, 'MC'),
          tenderId: t.id,
          customerId: t.customerId,
          title: t.title,
          type: (t.durationMonths ?? 12) >= 12 ? 'ANNUAL_CORPORATE' : 'MAINTENANCE',
          startDate: start,
          endDate: end,
          value: t.awardedAmount!,
          status: 'DRAFT',
          terms: t.requirements,
          ...(t.serviceId ? { services: { connect: [{ id: t.serviceId }] } } : {}),
        },
      }),
    );
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'contract', entityId: contract.id, meta: { tenderId: t.id, ref: contract.ref } });
    ok(res, contract, 201);
  }),
);

tendersAdminRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.tender.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'tender', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);
