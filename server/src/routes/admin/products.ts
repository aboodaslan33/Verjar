import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { randomSuffix, slugify } from '../../lib/ids';
import { applyDiscount } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { memoryUpload } from '../../middleware/upload';
import { categoryForProduct, cleanSpecs, specFieldsSchema, specsInput } from '../../services/catalog.service';
import { POLICIES, deleteStored, validateAndStore } from '../../services/upload.service';
import { HOUSE_VENDOR_ID, ensureHouseVendor } from '../../services/vendor.service';
import { checkPrice, industrialFields, priceField } from '../../validators/product';
import { MAX_PRODUCT_DOCS, addProductDocs, removeProductDoc } from '../../market/productDocs';

export const productsRouter = Router();

// ───────────── الأقسام (رئيسية وفرعية) ─────────────

const categoryInput = z.object({
  name: z.string().trim().min(2, 'اسم القسم مطلوب').max(60),
  parentId: z.string().min(1).nullable().default(null),
  specFields: specFieldsSchema.default([]),
  sortOrder: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
  /** مجموعة العمولة (قطع غيار، ماكينات…) تُستخدم في محرك العمولات */
  commissionGroup: z.string().trim().max(40).nullable().optional().transform((v) => v || null),
  description: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
});

productsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const cats = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } }, children: { where: { deletedAt: null } } } } },
    });
    ok(res, cats.map(({ _count, ...c }) => ({ ...c, productCount: _count.products, childCount: _count.children })));
  }),
);

async function uniqueCategorySlug(name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  while (await prisma.category.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

/** مستويان فقط: القسم الرئيسي لا يكون فرعيًا، والقسم الذي له أقسام فرعية لا يصبح فرعيًا */
async function checkParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw badRequest('لا يمكن أن يكون القسم فرعيًا لنفسه', { fields: { parentId: 'اختر قسمًا آخر' } });
  const parent = await prisma.category.findFirst({ where: { id: parentId, deletedAt: null } });
  if (!parent) throw badRequest('القسم الرئيسي غير موجود', { fields: { parentId: 'اختر القسم الرئيسي' } });
  if (parent.parentId) throw badRequest('القسم المختار فرعي. الأقسام بمستويين فقط', { fields: { parentId: 'اختر قسمًا رئيسيًا' } });
  if (selfId && (await prisma.category.count({ where: { parentId: selfId, deletedAt: null } }))) {
    throw badRequest('هذا القسم له أقسام فرعية ولا يمكن نقله تحت قسم آخر', { fields: { parentId: 'انقل أقسامه الفرعية أولًا' } });
  }
}

productsRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const input = categoryInput.parse(req.body);
    await checkParent(input.parentId);
    const cat = await prisma.category.create({ data: { ...input, slug: await uniqueCategorySlug(input.name) } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'category', entityId: cat.id });
    ok(res, cat, 201);
  }),
);

productsRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const input = categoryInput.partial().parse(req.body);
    if (input.parentId !== undefined) await checkParent(input.parentId, req.params.id);
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'category', entityId: cat.id });
    ok(res, cat);
  }),
);

productsRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { categoryId: req.params.id, deletedAt: null } });
    if (count > 0) throw badRequest(`لا يمكن حذف قسم يحتوي ${count} منتج. انقل المنتجات أو أخفِ القسم.`);
    const children = await prisma.category.count({ where: { parentId: req.params.id, deletedAt: null } });
    if (children > 0) throw badRequest(`لا يمكن حذف قسم له ${children} أقسام فرعية. احذفها أو انقلها أولًا.`);
    await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'category', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

// ───────────── المنتجات ─────────────

const productInput = z.object({
  name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(150),
  description: z.string().trim().min(1, 'الشرح مطلوب').max(5000),
  price: priceField,
  ...industrialFields,
  discountPercent: z.coerce.number().int().min(0).max(90, 'الخصم الأقصى 90%').default(0),
  stock: z.coerce.number().int().min(0, 'المخزون لا يكون سالبًا').default(0),
  visible: z.boolean().default(true),
  featured: z.boolean().default(false),
  categoryId: z.string().min(1, 'اختر القسم'),
  specs: specsInput,
  /** منتجات الأدمن للمورد الافتراضي ما لم يُحدَّد مورد */
  vendorId: z.string().min(1).optional(),
});

async function uniqueProductSlug(name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  while (await prisma.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

productsRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        q: z.string().trim().optional(),
        categoryId: z.string().optional(),
        visible: z.enum(['true', 'false']).optional(),
        lowStock: z.enum(['true']).optional(),
        approval: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
        vendorId: z.string().optional(),
      })
      .parse(req.query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q.categoryId ? { OR: [{ categoryId: q.categoryId }, { category: { parentId: q.categoryId } }] } : {}),
      ...(q.approval ? { approvalStatus: q.approval } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.visible ? { visible: q.visible === 'true' } : {}),
      ...(q.lowStock ? { stock: { lte: 3 } } : {}),
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
          vendor: { select: { id: true, name: true, slug: true, isHouse: true } },
          media: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        ...pageArgs(q),
      }),
      prisma.product.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

productsRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { category: true, vendor: { select: { id: true, name: true, slug: true, isHouse: true } }, media: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!p) throw notFound('المنتج غير موجود');
    ok(res, p);
  }),
);

productsRouter.post(
  '/products',
  asyncHandler(async (req, res) => {
    const { vendorId, specs, ...input } = productInput.parse(req.body);
    const pe = checkPrice(input);
    if (pe) throw badRequest(pe, { fields: { price: pe } });
    const { fields } = await categoryForProduct(prisma, input.categoryId);
    if (vendorId && vendorId !== HOUSE_VENDOR_ID && !(await prisma.vendor.findUnique({ where: { id: vendorId } }))) {
      throw badRequest('المورد غير موجود');
    }
    if (!vendorId || vendorId === HOUSE_VENDOR_ID) await ensureHouseVendor();
    const p = await prisma.product.create({
      data: {
        ...input,
        vendorId: vendorId ?? HOUSE_VENDOR_ID,
        // ما يضيفه الأدمن معتمد مباشرة
        approvalStatus: 'APPROVED',
        specs: cleanSpecs(fields, specs),
        slug: await uniqueProductSlug(input.name),
        price: new Prisma.Decimal(input.price),
        finalPrice: new Prisma.Decimal(applyDiscount(input.price, input.discountPercent)),
      },
      include: { category: true, media: true },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'product', entityId: p.id });
    ok(res, p, 201);
  }),
);

productsRouter.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { vendorId: _v, specs, ...input } = productInput.partial().parse(req.body);
    const current = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('المنتج غير موجود');
    const price = input.price ?? Number(current.price);
    const pe = checkPrice({ price, priceOnRequest: input.priceOnRequest ?? current.priceOnRequest });
    if (pe) throw badRequest(pe, { fields: { price: pe } });
    const discount = input.discountPercent ?? current.discountPercent;
    // المواصفات تُتحقق من جديد عند تغيير القسم أو المواصفات
    const specsData =
      specs !== undefined || input.categoryId
        ? { specs: cleanSpecs((await categoryForProduct(prisma, input.categoryId ?? current.categoryId)).fields, specs ?? (current.specs as Record<string, string>)) }
        : {};
    const p = await prisma.product.update({
      where: { id: current.id },
      data: {
        ...input,
        ...specsData,
        ...(input.name && input.name !== current.name ? { slug: await uniqueProductSlug(input.name, current.id) } : {}),
        price: new Prisma.Decimal(price),
        finalPrice: new Prisma.Decimal(applyDiscount(price, discount)),
      },
      include: { category: true, media: { orderBy: { sortOrder: 'asc' } } },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'product', entityId: p.id, meta: input });
    ok(res, p);
  }),
);

productsRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    await prisma.product.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), visible: false } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'product', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

/** مراجعة منتجات الموردين: موافقة أو رفض مع السبب */
productsRouter.post(
  '/products/:id/approve',
  asyncHandler(async (req, res) => {
    const p = await prisma.product.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'APPROVED', rejectionReason: null },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'approve', entity: 'product', entityId: p.id });
    ok(res, p);
  }),
);

productsRouter.post(
  '/products/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(3, 'اكتب سبب الرفض ليعرفه المورد').max(500) }).parse(req.body);
    const p = await prisma.product.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'REJECTED', rejectionReason: reason },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'reject', entity: 'product', entityId: p.id, meta: { reason } });
    ok(res, p);
  }),
);

const mediaUpload = memoryUpload(60, 10).array('files', 10);

/** رفع صور/فيديو للمنتج */
productsRouter.post(
  '/products/:id/media',
  mediaUpload,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null }, include: { media: true } });
    if (!product) throw notFound('المنتج غير موجود');
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('اختر ملفًا واحدًا على الأقل');
    const stored = await validateAndStore(files, POLICIES.productMedia, 'products');
    const videos = stored.filter((f) => f.kind === 'VIDEO').length + product.media.filter((m) => m.kind === 'VIDEO').length;
    if (videos > 1) throw badRequest('فيديو واحد فقط لكل منتج');
    const start = product.media.length;
    await prisma.productMedia.createMany({
      data: stored.map((f, i) => ({ productId: product.id, kind: f.kind, url: f.url, publicId: f.publicId, sortOrder: start + i })),
    });
    const media = await prisma.productMedia.findMany({ where: { productId: product.id }, orderBy: { sortOrder: 'asc' } });
    ok(res, media, 201);
  }),
);

productsRouter.delete(
  '/products/:id/media/:mediaId',
  asyncHandler(async (req, res) => {
    const m = await prisma.productMedia.findFirst({ where: { id: req.params.mediaId, productId: req.params.id } });
    if (!m) throw notFound('الملف غير موجود');
    await prisma.productMedia.delete({ where: { id: m.id } });
    await deleteStored(m.publicId, m.kind);
    ok(res, { deleted: true });
  }),
);

productsRouter.put(
  '/products/:id/media/order',
  asyncHandler(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$transaction(
      ids.map((id, i) => prisma.productMedia.updateMany({ where: { id, productId: req.params.id }, data: { sortOrder: i } })),
    );
    ok(res, await prisma.productMedia.findMany({ where: { productId: req.params.id }, orderBy: { sortOrder: 'asc' } }));
  }),
);

const docsUpload = memoryUpload(20, MAX_PRODUCT_DOCS).array('files', MAX_PRODUCT_DOCS);

/** ملفات فنية للمنتج: Datasheet / كتالوج / CAD */
productsRouter.post(
  '/products/:id/documents',
  docsUpload,
  asyncHandler(async (req, res) => {
    ok(res, await addProductDocs(req.params.id, (req.files as Express.Multer.File[] | undefined) ?? []), 201);
  }),
);

productsRouter.delete(
  '/products/:id/documents/:index',
  asyncHandler(async (req, res) => {
    ok(res, await removeProductDoc(req.params.id, Number(req.params.index)));
  }),
);
