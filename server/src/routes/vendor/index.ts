import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { randomSuffix, slugify } from '../../lib/ids';
import { applyDiscount } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { requireVendor } from '../../middleware/auth';
import { memoryUpload, uploadGuard } from '../../middleware/upload';
import { formLimiter } from '../../middleware/rateLimit';
import { categoryForProduct, cleanSpecs, effectiveSpecFields, specsInput, visibleCategoryWhere } from '../../services/catalog.service';
import { statusMessage } from '../../services/messages';
import { POLICIES, deleteStored, validateAndStore } from '../../services/upload.service';
import { emptyTotals, setVendorOrderStatus, syncOrderStatus, vendorTotals } from '../../services/vendor.service';
import { type Attachment, assertOpen, offerInput, storeAttachments } from '../../services/tenders.service';
import { conflict } from '../../lib/http';
import { notifyCustomer } from '../../services/whatsapp.service';

/**
 * لوحة المورد. كل استعلام هنا مقيّد بـ req.vendor.id:
 * المورد يرى ويعدّل منتجاته وطلباته الفرعية فقط، والعنصر الذي لا يخصه يُعامل كغير موجود.
 */
export const vendorRouter = Router();
vendorRouter.use(requireVendor);

const vid = (req: { vendor?: { id: string } }) => req.vendor!.id;
const MAX_IMAGES = 8;

// ───────────── ملف المتجر ─────────────

const profileSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  commissionPercent: true,
  createdAt: true,
} satisfies Prisma.VendorSelect;

vendorRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const id = vid(req);
    const [vendor, totals, products, pending, rejected, newOrders] = await Promise.all([
      prisma.vendor.findUniqueOrThrow({ where: { id }, select: profileSelect }),
      vendorTotals({ vendorId: id }),
      prisma.product.count({ where: { vendorId: id, deletedAt: null } }),
      prisma.product.count({ where: { vendorId: id, deletedAt: null, approvalStatus: 'PENDING' } }),
      prisma.product.count({ where: { vendorId: id, deletedAt: null, approvalStatus: 'REJECTED' } }),
      prisma.vendorOrder.count({ where: { vendorId: id, status: 'NEW', order: { deletedAt: null } } }),
    ]);
    ok(res, { vendor, totals: totals.get(id) ?? emptyTotals(), counts: { products, pending, rejected, newOrders } });
  }),
);

vendorRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2, 'اسم المتجر مطلوب').max(60),
        description: z.string().trim().max(1000).default(''),
      })
      .partial()
      .parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id: vid(req) }, data: input, select: profileSelect });
    await audit({ actorType: 'vendor', action: 'update', entity: 'vendor', entityId: vendor.id });
    ok(res, vendor);
  }),
);

const logoUpload = memoryUpload(5, 1).single('file');

vendorRouter.post(
  '/me/logo',
  formLimiter,
  uploadGuard(6),
  logoUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('اختر صورة الشعار');
    const [stored] = await validateAndStore([req.file], POLICIES.photos, 'vendors');
    const current = await prisma.vendor.findUniqueOrThrow({ where: { id: vid(req) } });
    const vendor = await prisma.vendor.update({
      where: { id: current.id },
      data: { logoUrl: stored.url, logoPublicId: stored.publicId },
      select: profileSelect,
    });
    await deleteStored(current.logoPublicId, 'IMAGE');
    ok(res, vendor);
  }),
);

vendorRouter.delete(
  '/me/logo',
  asyncHandler(async (req, res) => {
    const current = await prisma.vendor.findUniqueOrThrow({ where: { id: vid(req) } });
    const vendor = await prisma.vendor.update({ where: { id: current.id }, data: { logoUrl: null, logoPublicId: null }, select: profileSelect });
    await deleteStored(current.logoPublicId, 'IMAGE');
    ok(res, vendor);
  }),
);

/** الأقسام الظاهرة مع حقول المواصفات الفعلية لكل قسم */
vendorRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const cats = await prisma.category.findMany({
      where: visibleCategoryWhere,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { parent: { select: { id: true, name: true, specFields: true } } },
    });
    ok(
      res,
      cats.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        parentName: c.parent?.name ?? null,
        fields: effectiveSpecFields(c),
      })),
    );
  }),
);

// ───────────── المنتجات ─────────────

const productInput = z.object({
  name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(150),
  description: z.string().trim().min(1, 'الوصف مطلوب').max(5000),
  price: z.coerce.number().positive('السعر يجب أن يكون أكبر من صفر').max(1_000_000),
  discountPercent: z.coerce.number().int().min(0).max(90, 'الخصم الأقصى 90%').default(0),
  stock: z.coerce.number().int().min(0, 'المخزون لا يكون سالبًا').max(100_000).default(0),
  visible: z.boolean().default(true),
  categoryId: z.string().min(1, 'اختر القسم'),
  specs: specsInput,
});

async function uniqueProductSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  while (await prisma.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

const productInclude = {
  category: { select: { id: true, name: true, parentId: true } },
  media: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

/** منتج يملكه المورد الحالي فقط */
async function ownProduct(vendorId: string, id: string) {
  const p = await prisma.product.findFirst({ where: { id, vendorId, deletedAt: null }, include: { media: true } });
  if (!p) throw notFound('المنتج غير موجود');
  return p;
}

vendorRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ q: z.string().trim().max(100).optional(), approval: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })
      .parse(req.query);
    const where: Prisma.ProductWhereInput = {
      vendorId: vid(req),
      deletedAt: null,
      ...(q.approval ? { approvalStatus: q.approval } : {}),
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { category: { select: { id: true, name: true } }, media: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        ...pageArgs(q),
      }),
      prisma.product.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

vendorRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findFirst({ where: { id: req.params.id, vendorId: vid(req), deletedAt: null }, include: productInclude });
    if (!p) throw notFound('المنتج غير موجود');
    ok(res, p);
  }),
);

/** منتج جديد يدخل المراجعة ولا يظهر قبل موافقة الإدارة */
vendorRouter.post(
  '/products',
  formLimiter,
  asyncHandler(async (req, res) => {
    const { specs, ...input } = productInput.parse(req.body);
    const { fields } = await categoryForProduct(prisma, input.categoryId, { visibleOnly: true });
    const p = await prisma.product.create({
      data: {
        ...input,
        vendorId: vid(req),
        approvalStatus: 'PENDING',
        specs: cleanSpecs(fields, specs),
        slug: await uniqueProductSlug(input.name),
        price: new Prisma.Decimal(input.price),
        finalPrice: new Prisma.Decimal(applyDiscount(input.price, input.discountPercent)),
      },
      include: productInclude,
    });
    emitAdmin({ type: 'product.pending', id: p.id, title: `منتج بانتظار المراجعة: ${p.name}` });
    await audit({ actorType: 'vendor', action: 'create', entity: 'product', entityId: p.id, meta: { vendorId: vid(req) } });
    ok(res, p, 201);
  }),
);

/**
 * تعديل منتج. تغيير المحتوى (الاسم، الوصف، القسم، المواصفات) يعيده للمراجعة،
 * وكذلك أي تعديل على منتج مرفوض. السعر والمخزون والإظهار لا تحتاج مراجعة.
 */
vendorRouter.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { specs, ...input } = productInput.partial().parse(req.body);
    const current = await ownProduct(vid(req), req.params.id);
    const categoryId = input.categoryId ?? current.categoryId;
    const specsData =
      specs !== undefined || input.categoryId
        ? { specs: cleanSpecs((await categoryForProduct(prisma, categoryId, { visibleOnly: true })).fields, specs ?? (current.specs as Record<string, string>)) }
        : {};
    const contentChanged =
      (input.name !== undefined && input.name !== current.name) ||
      (input.description !== undefined && input.description !== current.description) ||
      (input.categoryId !== undefined && input.categoryId !== current.categoryId) ||
      (specsData.specs !== undefined && JSON.stringify(specsData.specs) !== JSON.stringify(current.specs));
    const review = contentChanged || current.approvalStatus === 'REJECTED';
    const price = input.price ?? Number(current.price);
    const discount = input.discountPercent ?? current.discountPercent;
    const p = await prisma.product.update({
      where: { id: current.id },
      data: {
        ...input,
        ...specsData,
        ...(input.name && input.name !== current.name ? { slug: await uniqueProductSlug(input.name, current.id) } : {}),
        ...(review ? { approvalStatus: 'PENDING', rejectionReason: null } : {}),
        price: new Prisma.Decimal(price),
        finalPrice: new Prisma.Decimal(applyDiscount(price, discount)),
      },
      include: productInclude,
    });
    if (review) emitAdmin({ type: 'product.pending', id: p.id, title: `منتج بانتظار المراجعة: ${p.name}` });
    await audit({ actorType: 'vendor', action: 'update', entity: 'product', entityId: p.id, meta: { vendorId: vid(req), review } });
    ok(res, p);
  }),
);

vendorRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const current = await ownProduct(vid(req), req.params.id);
    await prisma.product.update({ where: { id: current.id }, data: { deletedAt: new Date(), visible: false } });
    await audit({ actorType: 'vendor', action: 'delete', entity: 'product', entityId: current.id, meta: { vendorId: vid(req) } });
    ok(res, { deleted: true });
  }),
);

const mediaUpload = memoryUpload(8, MAX_IMAGES).array('files', MAX_IMAGES);

/** صور المنتج (Cloudinary). صورة جديدة تعيد المنتج للمراجعة */
vendorRouter.post(
  '/products/:id/media',
  formLimiter,
  uploadGuard(40),
  mediaUpload,
  asyncHandler(async (req, res) => {
    const product = await ownProduct(vid(req), req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('اختر صورة واحدة على الأقل');
    if (product.media.length + files.length > MAX_IMAGES) throw badRequest(`الحد الأقصى ${MAX_IMAGES} صور لكل منتج`);
    const stored = await validateAndStore(files, POLICIES.photos, 'products');
    const start = product.media.length;
    await prisma.$transaction([
      prisma.productMedia.createMany({
        data: stored.map((f, i) => ({ productId: product.id, kind: f.kind, url: f.url, publicId: f.publicId, sortOrder: start + i })),
      }),
      prisma.product.update({ where: { id: product.id }, data: { approvalStatus: 'PENDING', rejectionReason: null } }),
    ]);
    emitAdmin({ type: 'product.pending', id: product.id, title: `منتج بانتظار المراجعة: ${product.name}` });
    ok(res, await prisma.productMedia.findMany({ where: { productId: product.id }, orderBy: { sortOrder: 'asc' } }), 201);
  }),
);

vendorRouter.delete(
  '/products/:id/media/:mediaId',
  asyncHandler(async (req, res) => {
    const product = await ownProduct(vid(req), req.params.id);
    const m = product.media.find((x) => x.id === req.params.mediaId);
    if (!m) throw notFound('الصورة غير موجودة');
    await prisma.productMedia.delete({ where: { id: m.id } });
    await deleteStored(m.publicId, m.kind);
    ok(res, { deleted: true });
  }),
);

vendorRouter.put(
  '/products/:id/media/order',
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(20) }).parse(req.body);
    const product = await ownProduct(vid(req), req.params.id);
    await prisma.$transaction(
      ids.map((id, i) => prisma.productMedia.updateMany({ where: { id, productId: product.id }, data: { sortOrder: i } })),
    );
    ok(res, await prisma.productMedia.findMany({ where: { productId: product.id }, orderBy: { sortOrder: 'asc' } }));
  }),
);

// ───────────── الطلبات ─────────────

const vendorOrderSelect = {
  id: true,
  number: true,
  status: true,
  subtotal: true,
  total: true,
  commissionTotal: true,
  vendorNet: true,
  payoutId: true,
  createdAt: true,
  updatedAt: true,
  order: { select: { number: true, ref: true, customerName: true, phone: true, address: true, notes: true, createdAt: true } },
  items: {
    select: {
      id: true,
      productId: true,
      name: true,
      quantity: true,
      unitPrice: true,
      unitFinalPrice: true,
      discountPercent: true,
      lineTotal: true,
      commissionPercent: true,
      commissionAmount: true,
      vendorNet: true,
    },
  },
} satisfies Prisma.VendorOrderSelect;

const statusFilter = z.enum(['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

vendorRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.extend({ status: statusFilter.optional() }).parse(req.query);
    const where: Prisma.VendorOrderWhereInput = { vendorId: vid(req), order: { deletedAt: null }, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.vendorOrder.findMany({ where, orderBy: { createdAt: 'desc' }, select: vendorOrderSelect, ...pageArgs(q) }),
      prisma.vendorOrder.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

vendorRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const vo = await prisma.vendorOrder.findFirst({
      where: { id: req.params.id, vendorId: vid(req), order: { deletedAt: null } },
      select: vendorOrderSelect,
    });
    if (!vo) throw notFound('الطلب غير موجود');
    ok(res, vo);
  }),
);

/** المورد يحدّث حالة طلبه الفرعي. الإلغاء يُرجع المخزون، وإعادة تفعيل الملغي للإدارة فقط */
vendorRouter.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']) }).parse(req.body);
    const vo = await prisma.vendorOrder.findFirst({
      where: { id: req.params.id, vendorId: vid(req), order: { deletedAt: null } },
      include: { items: true },
    });
    if (!vo) throw notFound('الطلب غير موجود');
    if (vo.status === 'CANCELLED' && status !== 'CANCELLED') throw badRequest('الطلب ملغي. تواصل مع الإدارة لإعادة تفعيله');
    const { order, previous } = await prisma.$transaction(async (tx) => {
      await setVendorOrderStatus(tx, vo, status);
      return syncOrderStatus(tx, vo.orderId);
    });
    emitAdmin({ type: 'status.changed', id: vo.orderId, title: `طلب فرعي #${vo.number} (${req.vendor!.name})` });
    // العميل يُبلَّغ فقط إذا تغيّرت حالة طلبه الرئيسي
    if (order.status !== previous) {
      await notifyCustomer(order.phone, statusMessage('طلبك', order.number, order.status, order.customerName), {
        entityType: 'order',
        entityId: order.id,
      });
    }
    await audit({ actorType: 'vendor', action: 'update', entity: 'vendorOrder', entityId: vo.id, meta: { status, vendorId: vid(req) } });
    const updated = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: vo.id }, select: vendorOrderSelect });
    ok(res, updated);
  }),
);

// ───────────── الأرباح ─────────────

vendorRouter.get(
  '/earnings',
  asyncHandler(async (req, res) => {
    const id = vid(req);
    const [totals, payouts, due] = await Promise.all([
      vendorTotals({ vendorId: id }),
      prisma.vendorPayout.findMany({
        where: { vendorId: id },
        orderBy: { paidAt: 'desc' },
        select: { id: true, amount: true, salesTotal: true, commissionTotal: true, ordersCount: true, method: true, reference: true, paidAt: true },
        take: 50,
      }),
      prisma.vendorOrder.findMany({
        where: { vendorId: id, status: 'COMPLETED', payoutId: null, order: { deletedAt: null } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, total: true, commissionTotal: true, vendorNet: true, createdAt: true },
      }),
    ]);
    ok(res, { totals: totals.get(id) ?? emptyTotals(), payouts, dueOrders: due });
  }),
);

// ───────────── العطاءات ─────────────

/** العطاءات المفتوحة للتقديم، مع عرض المورد عليها إن وُجد */
vendorRouter.get(
  '/tenders',
  asyncHandler(async (req, res) => {
    const id = vid(req);
    const tenders = await prisma.tender.findMany({
      where: { deletedAt: null, OR: [{ status: 'OPEN', deadline: { gte: new Date() } }, { offers: { some: { vendorId: id } } }] },
      orderBy: { deadline: 'asc' },
      select: {
        id: true,
        ref: true,
        title: true,
        description: true,
        location: true,
        durationMonths: true,
        deadline: true,
        budget: true,
        requirements: true,
        attachments: true,
        status: true,
        service: { select: { name: true } },
        customer: { select: { companyName: true, name: true } },
        offers: { where: { vendorId: id }, select: { id: true, price: true, proposal: true, status: true, submittedAt: true, attachments: true } },
      },
    });
    ok(res, tenders.map(({ customer, ...t }) => ({ ...t, company: customer.companyName ?? customer.name })));
  }),
);

vendorRouter.post(
  '/tenders/:id/offers',
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = offerInput.parse(req.body);
    const t = await prisma.tender.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!t) throw notFound('العطاء غير موجود');
    assertOpen(t);
    if (await prisma.tenderOffer.findFirst({ where: { tenderId: t.id, vendorId: vid(req), status: 'SUBMITTED' } })) {
      throw conflict('قدّمت عرضًا على هذا العطاء. اسحبه أولًا لتقديم عرض جديد.');
    }
    const o = await prisma.tenderOffer.create({
      data: { tenderId: t.id, vendorId: vid(req), providerName: req.vendor!.name, price: new Prisma.Decimal(input.price), proposal: input.proposal },
    });
    await audit({ actorType: 'vendor', action: 'offer', entity: 'tender', entityId: t.id, meta: { offerId: o.id, vendorId: vid(req) } });
    ok(res, o, 201);
  }),
);

/** مرفقات العرض أو سحبه — لعروض المورد فقط */
const ownOffer = async (vendorId: string, id: string) => {
  const o = await prisma.tenderOffer.findFirst({ where: { id, vendorId }, include: { tender: true } });
  if (!o) throw notFound('العرض غير موجود');
  return o;
};

vendorRouter.post(
  '/tender-offers/:id/attachments',
  formLimiter,
  uploadGuard(40),
  memoryUpload(15, 5).array('files', 5),
  asyncHandler(async (req, res) => {
    const o = await ownOffer(vid(req), req.params.id);
    if (o.status !== 'SUBMITTED') throw conflict('لا يمكن تعديل هذا العرض');
    const added = await storeAttachments(req.files as Express.Multer.File[], 'tender-offers');
    ok(res, await prisma.tenderOffer.update({ where: { id: o.id }, data: { attachments: [...((o.attachments as Attachment[]) ?? []), ...added] } }));
  }),
);

vendorRouter.post(
  '/tender-offers/:id/withdraw',
  asyncHandler(async (req, res) => {
    const o = await ownOffer(vid(req), req.params.id);
    if (o.status !== 'SUBMITTED') throw conflict('لا يمكن سحب هذا العرض');
    ok(res, await prisma.tenderOffer.update({ where: { id: o.id }, data: { status: 'WITHDRAWN' } }));
  }),
);
