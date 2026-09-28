import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizePhone } from '../lib/phone';

const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
const lat = z.number().min(-90).max(90).nullable().optional();
const lng = z.number().min(-180).max(180).nullable().optional();

/**
 * طلب توصيل (مورد أو إدارة). الخريطة اختيارية: العنوان النصي يكفي.
 * المبالغ تُحسب في السيرفر من الأصناف؛ أجرة التوصيل تحددها الإدارة.
 */
export const deliveryOrderInput = z.object({
  customerName: z.string().trim().min(2, 'اسم العميل مطلوب').max(100),
  customerPhone: z
    .string()
    .trim()
    .min(1, 'رقم هاتف العميل مطلوب')
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'رقم هاتف العميل غير صحيح' });
        return z.NEVER;
      }
      return n;
    }),
  address: z.string().trim().min(5, 'اكتب عنوان التسليم بالتفصيل').max(300),
  area: optStr(100),
  deliveryLat: lat,
  deliveryLng: lng,
  pickupAddress: optStr(300),
  pickupPhone: optStr(30),
  pickupLat: lat,
  pickupLng: lng,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'اسم الصنف مطلوب').max(200),
        quantity: z.coerce.number().int().min(1, 'الكمية 1 على الأقل').max(1000),
        unitPrice: z.coerce.number().min(0, 'السعر لا يكون سالبًا').max(100_000),
      }),
    )
    .min(1, 'أضف صنفًا واحدًا على الأقل')
    .max(50),
  discount: z.coerce.number().min(0).max(100_000).default(0),
  deliveryFee: z.coerce.number().min(0).max(1000).optional(),
  customerPaysFee: z.boolean().default(true),
  paymentMethod: z.enum(['COD', 'CASH', 'CLIQ', 'BANK_TRANSFER', 'CARD', 'OTHER']).default('COD'),
  notes: optStr(1000),
});

export type DeliveryOrderBody = z.infer<typeof deliveryOrderInput>;

/** تفاصيل الطلب للإدارة: البنود، السجل، الإسنادات، الإثبات، المدفوعات */
export const orderDetailInclude = {
  items: { select: { id: true, name: true, quantity: true, unitPrice: true, unitFinalPrice: true, lineTotal: true, productId: true } },
  supplier: { select: { id: true, name: true, phone: true, pickupAddress: true } },
  vendorOrders: { select: { id: true, number: true, status: true, total: true, vendor: { select: { id: true, name: true } } } },
  customer: { select: { id: true, name: true, phone: true, passwordHash: false } },
  driver: { select: { id: true, name: true, phone: true } },
  deliveryCompany: { select: { id: true, name: true } },
  settlement: { select: { id: true, ref: true, status: true } },
  collectedBy: { select: { id: true, name: true } },
  statusEvents: { orderBy: { createdAt: 'asc' }, select: { id: true, fromStatus: true, toStatus: true, actorType: true, actorName: true, note: true, lat: true, lng: true, createdAt: true } },
  assignments: { orderBy: { assignedAt: 'desc' }, include: { driver: { select: { id: true, name: true } }, assignedBy: { select: { name: true } } } },
  proof: { include: { createdBy: { select: { name: true } } } },
  payments: { where: { deletedAt: null }, select: { id: true, amount: true, method: true, paidAt: true, reference: true } },
} satisfies Prisma.OrderInclude;
