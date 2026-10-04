import { Router } from 'express';
import { evaluateCoupon, redeemCoupon } from '../../insights/coupons';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { HttpError, asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { makeRef } from '../../lib/ids';
import { round3, toNum } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { initStoreOrder } from '../../services/delivery.service';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { accountCustomer } from '../../services/customer.service';
import { effectiveSpecFields, publicProductWhere, specList, visibleCategoryWhere } from '../../services/catalog.service';
import { customerConfirmationMessage, orderMessage } from '../../services/messages';
import { lineSplit } from '../../market/fees';
import { confirmCustomer, notifyAdmin } from '../../services/whatsapp.service';
import { orderSchema } from '../../validators/order';
import { bumpStat } from '../../market/stats';
import { emailSuppliersOfSale } from '../../market/notify';
import { type Selection, resolveSelection, selectionKey, variantText } from '../../market/options';

export const storeRouter = Router();

const productPublicSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  discountPercent: true,
  finalPrice: true,
  stock: true,
  featured: true,
  specs: true,
  sku: true,
  partNumber: true,
  manufacturer: true,
  brand: true,
  originCountry: true,
  priceOnRequest: true,
  minOrderQty: true,
  options: true,
  availability: true,
  leadTimeDays: true,
  warranty: true,
  category: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
  vendor: { select: { id: true, name: true, slug: true, logoUrl: true, isHouse: true, verified: true, city: true, awardTitle: true, awardUntil: true, plan: { select: { code: true, badge: true } } } },
  media: { orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, url: true } },
} satisfies Prisma.ProductSelect;

export { productPublicSelect };

/** معرّفات القسم وأقسامه الفرعية الظاهرة */
async function categoryIds(slug: string) {
  const cat = await prisma.category.findFirst({ where: { slug, ...visibleCategoryWhere }, select: { id: true } });
  if (!cat) return [];
  const children = await prisma.category.findMany({ where: { parentId: cat.id, deletedAt: null, visible: true }, select: { id: true } });
  return [cat.id, ...children.map((c) => c.id)];
}

/** شجرة الأقسام الظاهرة: أقسام رئيسية وتحتها الفرعية، مع عدد المنتجات المعروضة */
storeRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const [cats, counts] = await Promise.all([
      prisma.category.findMany({
        where: visibleCategoryWhere,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, parentId: true, specFields: true },
      }),
      prisma.product.groupBy({ by: ['categoryId'], where: publicProductWhere(), _count: { _all: true } }),
    ]);
    const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const top = cats.filter((c) => !c.parentId);
    ok(
      res,
      top.map((c) => {
        const children = cats
          .filter((k) => k.parentId === c.id)
          .map((k) => ({ id: k.id, name: k.name, slug: k.slug, productCount: count.get(k.id) ?? 0 }));
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          productCount: (count.get(c.id) ?? 0) + children.reduce((n, k) => n + k.productCount, 0),
          children,
        };
      }),
    );
  }),
);

const csv = z
  .string()
  .max(400)
  .optional()
  .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20) : []));

const productQuery = paginationSchema.extend({
  category: z.string().optional(),
  vendor: z.string().max(80).optional(),
  featured: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['relevance', 'new', 'price_asc', 'price_desc', 'discount']).default('relevance'),
  brand: csv,
  origin: csv,
  city: csv,
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(['true']).optional(),
  verified: z.enum(['true']).optional(),
  plan: csv,
  house: z.enum(['true']).optional(),
});

/** شروط البحث الصناعي: الاسم، الوصف، SKU، رقم القطعة، الماركة، المصنّع، الكلمات المفتاحية، المورد والتصنيف */
export function searchWhere(q: string): Prisma.ProductWhereInput {
  const c = { contains: q, mode: 'insensitive' as const };
  return {
    OR: [
      { name: c },
      { description: c },
      { sku: c },
      { partNumber: c },
      { brand: c },
      { manufacturer: c },
      { keywords: c },
      { vendor: { name: c } },
      { category: { name: c } },
    ],
  };
}

storeRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = productQuery.parse(req.query);
    const ids = q.category ? await categoryIds(q.category) : null;
    const and: Prisma.ProductWhereInput[] = [];
    if (q.q) and.push(searchWhere(q.q));
    if (q.brand.length) and.push({ OR: q.brand.map((b) => ({ brand: { equals: b, mode: 'insensitive' as const } })) });
    if (q.origin.length) and.push({ OR: q.origin.map((o) => ({ originCountry: { equals: o, mode: 'insensitive' as const } })) });
    if (q.minPrice != null || q.maxPrice != null) {
      and.push({ priceOnRequest: false, finalPrice: { ...(q.minPrice != null ? { gte: q.minPrice } : {}), ...(q.maxPrice != null ? { lte: q.maxPrice } : {}) } });
    }
    if (q.inStock) and.push({ availability: { not: 'OUT_OF_STOCK' } });
    const vendorWhere: Prisma.VendorWhereInput = {
      active: true,
      status: 'APPROVED',
      ...(q.vendor ? { slug: q.vendor } : {}),
      ...(q.city.length ? { city: { in: q.city } } : {}),
      ...(q.verified ? { verified: true } : {}),
      ...(q.plan.length ? { plan: { code: { in: q.plan } } } : {}),
      ...(q.house ? { isHouse: true } : {}),
    };
    const where = publicProductWhere({
      ...(ids ? { categoryId: { in: ids } } : {}),
      ...(q.featured === 'true' ? { featured: true } : {}),
      ...(and.length ? { AND: and } : {}),
      vendor: vendorWhere,
    });
    // الترتيب الافتراضي: أولوية باقة المورد في البحث، ثم المميز، ثم الأحدث
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ priceOnRequest: 'asc' }, { finalPrice: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ priceOnRequest: 'asc' }, { finalPrice: 'desc' }]
          : q.sort === 'discount'
            ? [{ discountPercent: 'desc' }]
            : q.sort === 'new'
              ? [{ createdAt: 'desc' }]
              : [{ vendor: { plan: { searchBoost: 'desc' } } }, { featured: 'desc' }, { createdAt: 'desc' }];
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, select: productPublicSelect, ...pageArgs(q) }),
      prisma.product.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

let facetsCache: { at: number; data: unknown } | null = null;

/** قيم الفلاتر المتاحة (الماركات، بلد المنشأ، المدن) من المنتجات المعروضة فعلًا */
storeRouter.get(
  '/facets',
  asyncHandler(async (_req, res) => {
    if (facetsCache && Date.now() - facetsCache.at < 60_000) {
      ok(res, facetsCache.data);
      return;
    }
    const where = publicProductWhere();
    const [brands, origins, cities, price] = await Promise.all([
      prisma.product.groupBy({ by: ['brand'], where: { ...where, brand: { not: null } }, _count: { _all: true }, orderBy: { _count: { brand: 'desc' } }, take: 40 }),
      prisma.product.groupBy({ by: ['originCountry'], where: { ...where, originCountry: { not: null } }, _count: { _all: true }, orderBy: { _count: { originCountry: 'desc' } }, take: 30 }),
      prisma.vendor.groupBy({ by: ['city'], where: { active: true, status: 'APPROVED', city: { not: null } }, _count: { _all: true }, orderBy: { _count: { city: 'desc' } }, take: 30 }),
      prisma.product.aggregate({ where: { ...where, priceOnRequest: false }, _min: { finalPrice: true }, _max: { finalPrice: true } }),
    ]);
    const data = {
      brands: brands.map((b) => ({ value: b.brand!, count: b._count._all })),
      origins: origins.map((o) => ({ value: o.originCountry!, count: o._count._all })),
      cities: cities.map((c) => ({ value: c.city!, count: c._count._all })),
      price: { min: toNum(price._min.finalPrice ?? 0), max: toNum(price._max.finalPrice ?? 0) },
    };
    facetsCache = { at: Date.now(), data };
    ok(res, data);
  }),
);

const supplierPublicSelect = {
  id: true,
  name: true,
  awardTitle: true,
  awardUntil: true,
  slug: true,
  description: true,
  logoUrl: true,
  isHouse: true,
  verified: true,
  city: true,
  businessField: true,
  productTypes: true,
  createdAt: true,
  categoryIds: true,
  plan: { select: { code: true, name: true, badge: true, features: true } },
} satisfies Prisma.VendorSelect;

async function ratingsFor(vendorIds: string[]) {
  const rows = await prisma.supplierReview.groupBy({
    by: ['vendorId'],
    where: { vendorId: { in: vendorIds }, visible: true },
    _avg: { overall: true, quality: true, delivery: true, commitment: true, communication: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.vendorId, { average: Math.round((r._avg.overall ?? 0) * 10) / 10, count: r._count._all, quality: r._avg.quality, delivery: r._avg.delivery, commitment: r._avg.commitment, communication: r._avg.communication }]));
}

/** دليل الموردين: بحث وفلترة (المدينة، التصنيف، موثّق، الباقة) — الباقات الأعلى أولًا */
storeRouter.get(
  '/suppliers',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ q: z.string().trim().max(100).optional(), city: z.string().max(60).optional(), category: z.string().max(80).optional(), verified: z.enum(['true']).optional(), plan: csv })
      .parse(req.query);
    const catIds = q.category ? await categoryIds(q.category) : [];
    const c = q.q ? { contains: q.q, mode: 'insensitive' as const } : null;
    const where: Prisma.VendorWhereInput = {
      active: true,
      status: 'APPROVED',
      ...(q.city ? { city: q.city } : {}),
      ...(q.verified ? { verified: true } : {}),
      ...(q.plan.length ? { plan: { code: { in: q.plan } } } : {}),
      ...(catIds.length ? { OR: [{ categoryIds: { hasSome: catIds } }, { products: { some: publicProductWhere({ categoryId: { in: catIds } }) } }] } : {}),
      ...(c ? { AND: [{ OR: [{ name: c }, { description: c }, { businessField: c }, { productTypes: c }] }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        orderBy: [{ isHouse: 'desc' }, { plan: { searchBoost: 'desc' } }, { verified: 'desc' }, { createdAt: 'asc' }],
        select: { ...supplierPublicSelect, _count: { select: { products: { where: publicProductWhere() } } } },
        ...pageArgs(q),
      }),
      prisma.vendor.count({ where }),
    ]);
    // الموردون المميزون (شارة تميز فعّالة يمنحها الـ Super Admin) — تظهر أعلى الدليل في الصفحة الأولى
    const featured =
      q.page === 1
        ? await prisma.vendor.findMany({
            where: { active: true, status: 'APPROVED', isHouse: false, awardUntil: { gt: new Date() } },
            orderBy: { awardUntil: 'desc' },
            take: 6,
            select: { ...supplierPublicSelect, _count: { select: { products: { where: publicProductWhere() } } } },
          })
        : [];
    const r = await ratingsFor([...rows, ...featured].map((v) => v.id));
    const shape = ({ _count, plan, ...v }: (typeof rows)[number]) => ({ ...v, plan: plan ? { code: plan.code, name: plan.name, badge: plan.badge } : null, productCount: _count.products, rating: r.get(v.id) ?? null });
    ok(res, { ...paged(rows.map(shape), total, q), featured: featured.map(shape) });
  }),
);

/** صفحة المورد العامة (مع التقييم والكتالوج والشهادات حسب باقته) */
storeRouter.get(
  '/vendors/:slug',
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({
      where: { slug: req.params.slug, active: true, status: 'APPROVED' },
      select: { ...supplierPublicSelect, catalogFiles: true, certificates: true },
    });
    if (!vendor) throw notFound('المتجر غير موجود');
    const [productCount, ratings, cats, reviews, deals] = await Promise.all([
      prisma.product.count({ where: publicProductWhere({ vendorId: vendor.id }) }),
      ratingsFor([vendor.id]),
      prisma.category.findMany({ where: { id: { in: vendor.categoryIds }, deletedAt: null, visible: true }, select: { id: true, name: true, slug: true } }),
      prisma.supplierReview.findMany({ where: { vendorId: vendor.id, visible: true }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, overall: true, comment: true, createdAt: true, customer: { select: { companyName: true, name: true } } } }),
      prisma.rfq.count({ where: { acceptedQuote: { vendorId: vendor.id }, status: { in: ['AWARDED', 'CLOSED'] } } }),
    ]);
    // الكتالوج يظهر للباقات التي تتضمنه (ومتجر FARJAR دائمًا)
    const features = (vendor.plan?.features ?? {}) as Record<string, boolean>;
    const showCatalog = vendor.isHouse || features.catalog === true;
    void prisma.vendor.update({ where: { id: vendor.id }, data: { profileViews: { increment: 1 } } }).catch(() => undefined);
    void bumpStat(vendor.id, 'profileViews');
    const { plan, catalogFiles, ...rest } = vendor;
    ok(res, {
      ...rest,
      plan: plan ? { code: plan.code, name: plan.name, badge: plan.badge } : null,
      catalogFiles: showCatalog ? catalogFiles : [],
      categories: cats,
      productCount,
      completedDeals: deals,
      rating: ratings.get(vendor.id) ?? null,
      reviews: reviews.map((r) => ({ id: r.id, overall: r.overall, comment: r.comment, createdAt: r.createdAt, by: r.customer.companyName ?? r.customer.name.split(/\s+/)[0] })),
    });
  }),
);

storeRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: publicProductWhere({ slug: req.params.slug }),
      select: {
        ...productPublicSelect,
        documents: true,
        videoUrl: true,
        keywords: true,
        category: { select: { ...productPublicSelect.category.select, specFields: true, parent: { select: { id: true, name: true, slug: true, specFields: true } } } },
      },
    });
    if (!product) throw notFound('المنتج غير موجود');
    void prisma.product.update({ where: { id: product.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
    void bumpStat(product.vendor.id, 'productViews');
    const related = await prisma.product.findMany({
      where: publicProductWhere({ categoryId: product.category.id, id: { not: product.id } }),
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: productPublicSelect,
    });
    const { specFields: _sf, parent, ...category } = product.category;
    const specs = specList(effectiveSpecFields(product.category), product.specs);
    ok(res, {
      product: { ...product, category: { ...category, parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null }, specList: specs },
      related,
    });
  }),
);

/** معاينة كود الخصم على السلة الحالية قبل إتمام الطلب */
storeRouter.post(
  '/coupons/check',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = z
      .object({ code: z.string().trim().min(1, 'اكتب كود الخصم').max(30), items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(1000) })).min(1).max(30) })
      .parse(req.body);
    const products = await prisma.product.findMany({
      where: publicProductWhere({ id: { in: input.items.map((i) => i.productId) } }),
      select: { id: true, finalPrice: true, category: { select: { id: true, parentId: true } } },
    });
    const lines = products.map((p) => ({
      productId: p.id,
      categoryId: p.category.id,
      parentCategoryId: p.category.parentId,
      lineTotal: round3(toNum(p.finalPrice) * input.items.filter((i) => i.productId === p.id).reduce((n, i) => n + i.quantity, 0)),
    }));
    const r = await prisma.$transaction((tx) => evaluateCoupon(tx, input.code, req.auth!.sub, lines));
    ok(res, { code: r.coupon.code, name: r.coupon.name, discount: r.discount, eligible: r.eligible, type: r.coupon.type, value: toNum(r.coupon.value) });
  }),
);

/** إنشاء طلب من السلة — الأسعار تُحسب من قاعدة البيانات وليس من المتصفح */
storeRouter.post(
  '/orders',
  requireCustomer,
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = orderSchema.parse(req.body);
    // الطلب يحجز المخزون فورًا: حد للطلبات المفتوحة يمنع تفريغ المخزون بحساب واحد
    const open = await prisma.order.count({ where: { customerId: req.auth!.sub, deletedAt: null, status: 'NEW' } });
    if (open >= 3) {
      throw new HttpError(429, 'لديك 3 طلبات بانتظار التأكيد. انتظر تأكيدها قبل طلب جديد، أو تواصل معنا.', 'TOO_MANY_OPEN');
    }

    const productIds = [...new Set(input.items.map((i) => i.productId))];

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: publicProductWhere({ id: { in: productIds } }),
        include: { vendor: { select: { id: true, name: true, isHouse: true } }, category: { select: { id: true, parentId: true } } },
      });
      if (products.length !== productIds.length) throw badRequest('بعض المنتجات في السلة لم تعد متوفرة، حدّث السلة');
      const byId = new Map(products.map((p) => [p.id, p]));

      // بند لكل منتج + خيار (كنباية حمراء وكنباية زرقاء بندان)، والخيار يُتحقق منه هنا لا في المتصفح
      const merged = new Map<string, { p: (typeof products)[number]; sel: Selection; quantity: number }>();
      for (const it of input.items) {
        const p = byId.get(it.productId)!;
        const sel = resolveSelection(p.name, p.options, it.options);
        const k = selectionKey(p.id, sel);
        const cur = merged.get(k);
        if (cur) cur.quantity += it.quantity;
        else merged.set(k, { p, sel, quantity: it.quantity });
      }
      // الكمية والمخزون على مستوى المنتج (المخزون مشترك بين خياراته)
      const qty = new Map<string, number>();
      for (const l of merged.values()) qty.set(l.p.id, (qty.get(l.p.id) ?? 0) + l.quantity);
      for (const p of products) {
        const quantity = qty.get(p.id)!;
        if (p.priceOnRequest) throw badRequest(`"${p.name}" بالسعر عند الطلب — اطلب عرض سعر بدل الشراء المباشر`);
        if (quantity < p.minOrderQty) throw badRequest(`الحد الأدنى لطلب "${p.name}" هو ${p.minOrderQty}`);
        if (p.stock < quantity) {
          throw badRequest(p.stock === 0 ? `"${p.name}" غير متوفر حاليًا` : `المتوفر من "${p.name}" ${p.stock} فقط`);
        }
      }

      let subtotal = 0;
      let total = 0;
      const lines = [...merged.values()].map(({ p, sel, quantity }) => {
        const unit = toNum(p.price);
        // نسبة فرجار تُحسب لكل منتج على حدة من بيانات قاعدة البيانات، وتُثبَّت مع البند ولا يُعاد حسابها لاحقًا
        const split = lineSplit(p, quantity, p.vendor.isHouse);
        const lineTotal = split.lineTotal;
        subtotal += unit * quantity;
        total += lineTotal;
        return {
          vendorId: p.vendorId,
          vendorName: p.vendor.name,
          lineSubtotal: unit * quantity,
          item: {
            productId: p.id,
            vendorId: p.vendorId,
            name: p.name,
            ...(sel.length ? { options: sel, variant: variantText(sel) } : {}),
            unitPrice: p.price,
            discountPercent: p.discountPercent,
            unitFinalPrice: p.finalPrice,
            quantity,
            lineTotal: new Prisma.Decimal(lineTotal),
            commissionPercent: new Prisma.Decimal(split.commissionPercent),
            commissionAmount: new Prisma.Decimal(split.commission),
            vendorNet: new Prisma.Decimal(split.vendorNet),
            supplierUnitPrice: new Prisma.Decimal(split.supplierUnitPrice),
            platformFeePercent: new Prisma.Decimal(split.feePercent),
            platformFeeAmount: new Prisma.Decimal(split.feeAmount),
          },
        };
      });

      // خصم المخزون بشرط عدم النزول تحت الصفر (حماية من الطلبات المتزامنة)
      for (const { item } of lines) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) throw badRequest(`الكمية المطلوبة من "${item.name}" لم تعد متوفرة`);
      }

      const customer = await accountCustomer(tx, req.auth!.sub);
      subtotal = round3(subtotal);
      total = round3(total);
      // كود الخصم: تتحمله FARJAR من إجمالي الطلب، ومستحقات الموردين وعمولاتهم لا تتغير
      const applied = input.couponCode
        ? await evaluateCoupon(
            tx,
            input.couponCode,
            customer.id,
            products.map((p) => ({ productId: p.id, categoryId: p.category.id, parentCategoryId: p.category.parentId, lineTotal: round3(toNum(p.finalPrice) * qty.get(p.id)!) })),
          )
        : null;
      const productsTotal = total;
      if (applied) total = round3(Math.max(0, total - applied.discount));
      const created = await tx.order.create({
        data: {
          ref: makeRef('O'),
          customerId: customer.id,
          customerName: input.name,
          phone: input.phone,
          address: input.address,
          notes: input.notes ?? null,
          subtotal: new Prisma.Decimal(subtotal),
          discountTotal: new Prisma.Decimal(round3(subtotal - productsTotal)),
          total: new Prisma.Decimal(total),
          ...(applied ? { couponId: applied.coupon.id, couponCode: applied.coupon.code, couponDiscount: new Prisma.Decimal(applied.discount) } : {}),
          whatsappText: '',
          ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
          // الدفع عند الاستلام: المبلغ المطلوب تحصيله يُثبَّت وقت الطلب
          ...(input.paymentMethod === 'COD' ? { codAmount: new Prisma.Decimal(total), codStatus: 'PENDING' as const } : {}),
        },
      });

      if (applied) await redeemCoupon(tx, applied.coupon, created.id, customer.id, applied.discount);

      // طلب فرعي لكل مورد
      const byVendor = new Map<string, typeof lines>();
      for (const l of lines) byVendor.set(l.vendorId, [...(byVendor.get(l.vendorId) ?? []), l]);
      for (const [vendorId, group] of byVendor) {
        const sumOf = (f: (l: (typeof group)[number]) => number) => new Prisma.Decimal(round3(group.reduce((n, l) => n + f(l), 0)));
        await tx.vendorOrder.create({
          data: {
            orderId: created.id,
            vendorId,
            subtotal: sumOf((l) => l.lineSubtotal),
            total: sumOf((l) => toNum(l.item.lineTotal)),
            commissionTotal: sumOf((l) => toNum(l.item.commissionAmount)),
            vendorNet: sumOf((l) => toNum(l.item.vendorNet)),
            items: { create: group.map((l) => ({ ...l.item, orderId: created.id })) },
          },
        });
      }

      // رقم الطلب الموحّد، أول حدث في سجل الحالات، الحالة المالية، وإشعار الموردين
      await initStoreOrder(tx, created.id);

      const full = await tx.order.findUniqueOrThrow({
        where: { id: created.id },
        include: { items: true, vendorOrders: { include: { vendor: { select: { name: true } } } } },
      });
      return tx.order.update({
        where: { id: created.id },
        data: { whatsappText: orderMessage(full) },
        include: { items: true, vendorOrders: { select: { id: true, number: true, total: true, status: true, vendor: { select: { name: true, slug: true } } } } },
      });
    });

    const wa = await notifyAdmin(order.whatsappText, { entityType: 'order', entityId: order.id });
    await confirmCustomer(order.phone, customerConfirmationMessage('طلبك', order.number, order.ref, order.customerName), {
      entityType: 'order',
      entityId: order.id,
    });
    emitAdmin({ type: 'order.created', id: order.id, title: `طلب متجر #${order.number}` });
    // بريد تلقائي للموردين بما بيع من منتجاتهم (الإشعار داخل الموقع أُنشئ مع الطلب)
    void emailSuppliersOfSale(order.id).catch((e) => console.error('supplier sale email failed', e));
    await audit({ actorType: 'public', action: 'create', entity: 'order', entityId: order.id });

    ok(
      res,
      {
        id: order.id,
        number: order.number,
        code: order.code,
        ref: order.ref,
        status: order.status,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        couponCode: order.couponCode,
        couponDiscount: order.couponDiscount,
        total: order.total,
        items: order.items.map(({ commissionPercent: _p, commissionAmount: _c, vendorNet: _n, supplierUnitPrice: _s, platformFeePercent: _f, platformFeeAmount: _a, ...it }) => it),
        vendorOrders: order.vendorOrders,
        message: order.whatsappText,
        whatsapp: { link: wa.link, sent: wa.sent },
      },
      201,
    );
  }),
);
