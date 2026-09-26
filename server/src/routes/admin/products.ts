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
import { POLICIES, deleteStored, validateAndStore } from '../../services/upload.service';

export const productsRouter = Router();

// ───────────── التصنيفات ─────────────

const categoryInput = z.object({
  name: z.string().trim().min(2, 'اسم التصنيف مطلوب').max(60),
  sortOrder: z.coerce.number().int().default(0),
  visible: z.boolean().default(true),
});

productsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const cats = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    ok(res, cats.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })));
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

productsRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const input = categoryInput.parse(req.body);
    const cat = await prisma.category.create({ data: { ...input, slug: await uniqueCategorySlug(input.name) } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'category', entityId: cat.id });
    ok(res, cat, 201);
  }),
);

productsRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const input = categoryInput.partial().parse(req.body);
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: input });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'category', entityId: cat.id });
    ok(res, cat);
  }),
);

productsRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const count = await prisma.product.count({ where: { categoryId: req.params.id, deletedAt: null } });
    if (count > 0) throw badRequest(`لا يمكن حذف تصنيف يحتوي ${count} منتج. انقل المنتجات أولًا.`);
    await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'category', entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

// ───────────── المنتجات ─────────────

const productInput = z.object({
  name: z.string().trim().min(2, 'اسم المنتج مطلوب').max(150),
  description: z.string().trim().min(1, 'الشرح مطلوب').max(5000),
  price: z.coerce.number().positive('السعر يجب أن يكون أكبر من صفر').max(1_000_000),
  discountPercent: z.coerce.number().int().min(0).max(90, 'الخصم الأقصى 90%').default(0),
  stock: z.coerce.number().int().min(0, 'المخزون لا يكون سالبًا').default(0),
  visible: z.boolean().default(true),
  featured: z.boolean().default(false),
  categoryId: z.string().min(1, 'اختر التصنيف'),
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
      })
      .parse(req.query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.visible ? { visible: q.visible === 'true' } : {}),
      ...(q.lowStock ? { stock: { lte: 3 } } : {}),
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

productsRouter.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { category: true, media: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!p) throw notFound('المنتج غير موجود');
    ok(res, p);
  }),
);

productsRouter.post(
  '/products',
  asyncHandler(async (req, res) => {
    const input = productInput.parse(req.body);
    const p = await prisma.product.create({
      data: {
        ...input,
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
    const input = productInput.partial().parse(req.body);
    const current = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!current) throw notFound('المنتج غير موجود');
    const price = input.price ?? Number(current.price);
    const discount = input.discountPercent ?? current.discountPercent;
    const p = await prisma.product.update({
      where: { id: current.id },
      data: {
        ...input,
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
