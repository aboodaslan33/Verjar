import type { Prisma } from '@prisma/client';
import { unauthorized } from '../lib/http';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

/**
 * حساب العميل المسجّل الذي يُربط به حجز/طلب جديد (الحجز كضيف غير مسموح).
 * يُكمل اسم الشركة في الحساب إن كان فارغًا.
 */
export async function accountCustomer(tx: Tx, customerId: string, extra: { companyName?: string | null } = {}) {
  const c = await tx.customer.findUnique({ where: { id: customerId } });
  if (!c || c.deletedAt) throw unauthorized('انتهت الجلسة، سجّل الدخول مجددًا');
  if (extra.companyName && !c.companyName) {
    return tx.customer.update({ where: { id: c.id }, data: { companyName: extra.companyName } });
  }
  return c;
}

/** ملخص مالي لعميل: إجمالي المطلوب، المدفوع، المتبقي */
export async function customerFinance(customerId: string) {
  const [orders, bookings, contracts, corporates, payments] = await Promise.all([
    prisma.order.aggregate({
      where: { customerId, deletedAt: null, status: { not: 'CANCELLED' } },
      _sum: { total: true },
    }),
    prisma.booking.findMany({
      where: { customerId, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { quotedAmount: true, inspectionFee: true },
    }),
    prisma.contract.aggregate({
      where: { customerId, deletedAt: null, status: { not: 'CANCELLED' } },
      _sum: { value: true },
    }),
    prisma.corporateRequest.aggregate({
      where: {
        customerId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        // الطلبات التي تحولت لعقود تُحسب قيمتها من العقد
        contracts: { none: { deletedAt: null } },
      },
      _sum: { quotedAmount: true },
    }),
    prisma.payment.aggregate({ where: { customerId, deletedAt: null }, _sum: { amount: true } }),
  ]);
  const bookingsTotal = bookings.reduce(
    (s, b) => s + Number(b.quotedAmount ?? b.inspectionFee ?? 0),
    0,
  );
  const billed =
    Number(orders._sum.total ?? 0) +
    bookingsTotal +
    Number(contracts._sum.value ?? 0) +
    Number(corporates._sum.quotedAmount ?? 0);
  const paid = Number(payments._sum.amount ?? 0);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { billed: r(billed), paid: r(paid), remaining: r(billed - paid) };
}
