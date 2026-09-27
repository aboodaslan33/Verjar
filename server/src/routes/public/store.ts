import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { emitAdmin } from '../../lib/events';
import { HttpError, asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { makeRef } from '../../lib/ids';
import { round3, toNum } from '../../lib/money';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { formLimiter } from '../../middleware/rateLimit';
import { accountCustomer } from '../../services/customer.service';
import { effectiveSpecFields, publicProductWhere, specList, visibleCategoryWhere } from '../../services/catalog.service';
import { customerConfirmationMessage, orderMessage } from '../../services/messages';
import { splitLine } from '../../services/vendor.service';
import { confirmCustomer, notifyAdmin } from '../../services/whatsapp.service';
import { orderSchema } from '../../validators/order';

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
  category: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
  vendor: { select: { id: true, name: true, slug: true, logoUrl: true, isHouse: true } },
  media: { orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, url: true } },
} satisfies Prisma.ProductSelect;

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

storeRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        category: z.string().optional(),
        vendor: z.string().max(80).optional(),
        featured: z.enum(['true', 'false']).optional(),
        q: z.string().trim().max(100).optional(),
        sort: z.enum(['new', 'price_asc', 'price_desc', 'discount']).default('new'),
      })
      .parse(req.query);
    const ids = q.category ? await categoryIds(q.category) : null;
    const where = publicProductWhere({
      ...(ids ? { categoryId: { in: ids } } : {}),
      ...(q.vendor ? { vendor: { active: true, slug: q.vendor } } : {}),
      ...(q.featured === 'true' ? { featured: true } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
    });
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      q.sort === 'price_asc'
        ? { finalPrice: 'asc' }
        : q.sort === 'price_desc'
          ? { finalPrice: 'desc' }
          : q.sort === 'discount'
            ? { discountPercent: 'desc' }
            : { createdAt: 'desc' };
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy, select: productPublicSelect, ...pageArgs(q) }),
      prisma.product.count({ where }),
    ]);
    ok(res, paged(items, total, q));
  }),
);

/** صفحة متجر المورد العامة */
storeRouter.get(
  '/vendors/:slug',
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({
      where: { slug: req.params.slug, active: true },
      select: { id: true, name: true, slug: true, description: true, logoUrl: true, isHouse: true, createdAt: true },
    });
    if (!vendor) throw notFound('المتجر غير موجود');
    const productCount = await prisma.product.count({ where: publicProductWhere({ vendorId: vendor.id }) });
    ok(res, { ...vendor, productCount });
  }),
);

storeRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: publicProductWhere({ slug: req.params.slug }),
      select: { ...productPublicSelect, category: { select: { ...productPublicSelect.category.select, specFields: true, parent: { select: { id: true, name: true, slug: true, specFields: true } } } } },
    });
    if (!product) throw notFound('المنتج غير موجود');
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

    // دمج المنتجات المكررة
    const qty = new Map<string, number>();
    for (const it of input.items) qty.set(it.productId, (qty.get(it.productId) ?? 0) + it.quantity);

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: publicProductWhere({ id: { in: [...qty.keys()] } }),
        include: { vendor: { select: { id: true, name: true, commissionPercent: true } } },
      });
      if (products.length !== qty.size) throw badRequest('بعض المنتجات في السلة لم تعد متوفرة، حدّث السلة');

      let subtotal = 0;
      let total = 0;
      const lines = products.map((p) => {
        const quantity = qty.get(p.id)!;
        if (p.stock < quantity) {
          throw badRequest(p.stock === 0 ? `"${p.name}" غير متوفر حاليًا` : `المتوفر من "${p.name}" ${p.stock} فقط`);
        }
        const unit = toNum(p.price);
        const unitFinal = toNum(p.finalPrice);
        const lineTotal = round3(unitFinal * quantity);
        subtotal += unit * quantity;
        total += lineTotal;
        // العمولة تُثبَّت وقت البيع بنسبة المورد الحالية ولا يُعاد حسابها لاحقًا
        const split = splitLine(lineTotal, toNum(p.vendor.commissionPercent));
        return {
          vendorId: p.vendorId,
          vendorName: p.vendor.name,
          lineSubtotal: unit * quantity,
          item: {
            productId: p.id,
            vendorId: p.vendorId,
            name: p.name,
            unitPrice: p.price,
            discountPercent: p.discountPercent,
            unitFinalPrice: p.finalPrice,
            quantity,
            lineTotal: new Prisma.Decimal(lineTotal),
            commissionPercent: new Prisma.Decimal(split.commissionPercent),
            commissionAmount: new Prisma.Decimal(split.commission),
            vendorNet: new Prisma.Decimal(split.vendorNet),
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
      const created = await tx.order.create({
        data: {
          ref: makeRef('O'),
          customerId: customer.id,
          customerName: input.name,
          phone: input.phone,
          address: input.address,
          notes: input.notes ?? null,
          subtotal: new Prisma.Decimal(subtotal),
          discountTotal: new Prisma.Decimal(round3(subtotal - total)),
          total: new Prisma.Decimal(total),
          whatsappText: '',
        },
      });

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
    await audit({ actorType: 'public', action: 'create', entity: 'order', entityId: order.id });

    ok(
      res,
      {
        id: order.id,
        number: order.number,
        ref: order.ref,
        status: order.status,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        total: order.total,
        items: order.items.map(({ commissionPercent: _p, commissionAmount: _c, vendorNet: _n, ...it }) => it),
        vendorOrders: order.vendorOrders,
        message: order.whatsappText,
        whatsapp: { link: wa.link, sent: wa.sent },
      },
      201,
    );
  }),
);
