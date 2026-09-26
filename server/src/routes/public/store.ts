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
import { customerConfirmationMessage, orderMessage } from '../../services/messages';
import { notifyAdmin, notifyCustomer } from '../../services/whatsapp.service';
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
  category: { select: { id: true, name: true, slug: true } },
  media: { orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, url: true } },
} satisfies Prisma.ProductSelect;

storeRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null, visible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { products: { where: { deletedAt: null, visible: true } } } },
      },
    });
    ok(res, categories.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })));
  }),
);

storeRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({
        category: z.string().optional(),
        featured: z.enum(['true', 'false']).optional(),
        q: z.string().trim().max(100).optional(),
        sort: z.enum(['new', 'price_asc', 'price_desc', 'discount']).default('new'),
      })
      .parse(req.query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      visible: true,
      category: { deletedAt: null, visible: true, ...(q.category ? { slug: q.category } : {}) },
      ...(q.featured === 'true' ? { featured: true } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
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

storeRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, deletedAt: null, visible: true },
      select: productPublicSelect,
    });
    if (!product) throw notFound('المنتج غير موجود');
    const related = await prisma.product.findMany({
      where: { categoryId: product.category.id, id: { not: product.id }, deletedAt: null, visible: true },
      take: 4,
      orderBy: { createdAt: 'desc' },
      select: productPublicSelect,
    });
    ok(res, { product, related });
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
        where: { id: { in: [...qty.keys()] }, deletedAt: null, visible: true },
      });
      if (products.length !== qty.size) throw badRequest('بعض المنتجات في السلة لم تعد متوفرة، حدّث السلة');

      let subtotal = 0;
      let total = 0;
      const items = products.map((p) => {
        const quantity = qty.get(p.id)!;
        if (p.stock < quantity) {
          throw badRequest(p.stock === 0 ? `"${p.name}" غير متوفر حاليًا` : `المتوفر من "${p.name}" ${p.stock} فقط`);
        }
        const unit = toNum(p.price);
        const unitFinal = toNum(p.finalPrice);
        const lineTotal = round3(unitFinal * quantity);
        subtotal += unit * quantity;
        total += lineTotal;
        return {
          productId: p.id,
          name: p.name,
          unitPrice: p.price,
          discountPercent: p.discountPercent,
          unitFinalPrice: p.finalPrice,
          quantity,
          lineTotal: new Prisma.Decimal(lineTotal),
        };
      });

      // خصم المخزون بشرط عدم النزول تحت الصفر (حماية من الطلبات المتزامنة)
      for (const it of items) {
        const updated = await tx.product.updateMany({
          where: { id: it.productId, stock: { gte: it.quantity } },
          data: { stock: { decrement: it.quantity } },
        });
        if (updated.count === 0) throw badRequest(`الكمية المطلوبة من "${it.name}" لم تعد متوفرة`);
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
          items: { create: items },
        },
        include: { items: true },
      });
      return tx.order.update({
        where: { id: created.id },
        data: { whatsappText: orderMessage(created) },
        include: { items: true },
      });
    });

    const wa = await notifyAdmin(order.whatsappText, { entityType: 'order', entityId: order.id });
    await notifyCustomer(order.phone, customerConfirmationMessage('طلبك', order.number, order.ref, order.customerName), {
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
        items: order.items,
        message: order.whatsappText,
        whatsapp: { link: wa.link, sent: wa.sent },
      },
      201,
    );
  }),
);
