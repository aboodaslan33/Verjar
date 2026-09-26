import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { requireCustomer } from '../../middleware/auth';
import { customerFinance } from '../../services/customer.service';

export const accountRouter = Router();
accountRouter.use(requireCustomer);

/** كل ما يخص العميل: الحجوزات والطلبات وطلبات الشركات والعقود والملفات والدفعات */
accountRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const customerId = req.auth!.sub;
    const notDeleted = { customerId, deletedAt: null };
    const [bookings, orders, corporate, contracts, files, payments, finance] = await Promise.all([
      prisma.booking.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          ref: true,
          type: true,
          status: true,
          scheduledAt: true,
          locationText: true,
          urgency: true,
          inspectionFee: true,
          quotedAmount: true,
          details: true,
          createdAt: true,
          media: { select: { id: true, url: true, kind: true } },
        },
      }),
      prisma.order.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          ref: true,
          status: true,
          total: true,
          subtotal: true,
          discountTotal: true,
          address: true,
          createdAt: true,
          items: { select: { id: true, name: true, quantity: true, lineTotal: true } },
        },
      }),
      prisma.corporateRequest.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          ref: true,
          type: true,
          status: true,
          companyName: true,
          quotedAmount: true,
          createdAt: true,
          services: { select: { name: true } },
        },
      }),
      prisma.contract.findMany({
        where: notDeleted,
        orderBy: { startDate: 'desc' },
        select: { id: true, number: true, title: true, startDate: true, endDate: true, value: true, status: true, fileUrl: true },
      }),
      prisma.quoteFile.findMany({
        where: notDeleted,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          kind: true,
          title: true,
          url: true,
          amount: true,
          createdAt: true,
          booking: { select: { number: true } },
          order: { select: { number: true } },
          corporateRequest: { select: { number: true } },
          contract: { select: { number: true } },
        },
      }),
      prisma.payment.findMany({
        where: notDeleted,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          reference: true,
          note: true,
          booking: { select: { number: true } },
          order: { select: { number: true } },
          contract: { select: { number: true } },
        },
      }),
      customerFinance(customerId),
    ]);
    ok(res, { bookings, orders, corporate, contracts, files, payments, finance });
  }),
);
