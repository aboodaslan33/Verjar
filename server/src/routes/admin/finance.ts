import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, notFound, ok } from '../../lib/http';
import { paged, paginationSchema } from '../../lib/pagination';
import { displayPhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { customerFinance } from '../../services/customer.service';
import { moneyInput, toCsv } from './shared';

export const financeRouter = Router();

type FinanceRow = {
  id: string;
  name: string;
  phone: string;
  companyName: string | null;
  billed: number;
  paid: number;
  remaining: number;
};

/** استعلام واحد يحسب لكل عميل: المطلوب، المدفوع، المتبقي */
function financeQuery(opts: { search?: string; onlyDue?: boolean; limit?: number; offset?: number }) {
  const search = opts.search ? `%${opts.search}%` : null;
  return Prisma.sql`
    WITH o AS (
      SELECT "customerId", SUM("total") AS t FROM "Order"
      WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' GROUP BY 1
    ), b AS (
      SELECT "customerId", SUM(COALESCE("quotedAmount", "inspectionFee", 0)) AS t FROM "Booking"
      WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' GROUP BY 1
    ), k AS (
      SELECT "customerId", SUM("value") AS t FROM "Contract"
      WHERE "deletedAt" IS NULL AND "status" <> 'CANCELLED' GROUP BY 1
    ), cr AS (
      SELECT r."customerId", SUM(COALESCE(r."quotedAmount", 0)) AS t FROM "CorporateRequest" r
      WHERE r."deletedAt" IS NULL AND r."status" <> 'CANCELLED'
        AND NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."corporateRequestId" = r."id" AND c."deletedAt" IS NULL)
      GROUP BY 1
    ), p AS (
      SELECT "customerId", SUM("amount") AS t FROM "Payment" WHERE "deletedAt" IS NULL GROUP BY 1
    ), rows AS (
      SELECT c."id", c."name", c."phone", c."companyName",
        (COALESCE(o.t,0) + COALESCE(b.t,0) + COALESCE(k.t,0) + COALESCE(cr.t,0))::float8 AS billed,
        COALESCE(p.t,0)::float8 AS paid
      FROM "Customer" c
      LEFT JOIN o ON o."customerId" = c."id"
      LEFT JOIN b ON b."customerId" = c."id"
      LEFT JOIN k ON k."customerId" = c."id"
      LEFT JOIN cr ON cr."customerId" = c."id"
      LEFT JOIN p ON p."customerId" = c."id"
      WHERE c."deletedAt" IS NULL
        ${search ? Prisma.sql`AND (c."name" ILIKE ${search} OR c."phone" LIKE ${search} OR c."companyName" ILIKE ${search})` : Prisma.empty}
    )
    SELECT *, ROUND((billed - paid)::numeric, 3)::float8 AS remaining, COUNT(*) OVER()::int AS "totalCount"
    FROM rows
    ${opts.onlyDue ? Prisma.sql`WHERE billed - paid > 0.0005` : Prisma.empty}
    ORDER BY (billed - paid) DESC, name ASC
    ${opts.limit ? Prisma.sql`LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}` : Prisma.empty}
  `;
}

financeRouter.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ q: z.string().trim().optional(), due: z.enum(['true']).optional() })
      .parse(req.query);
    const rows = await prisma.$queryRaw<(FinanceRow & { totalCount: number })[]>(
      financeQuery({ search: q.q, onlyDue: Boolean(q.due), limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
    );
    const totals = await prisma.$queryRaw<{ billed: number; paid: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(billed),0)::float8 AS billed, COALESCE(SUM(paid),0)::float8 AS paid FROM (${financeQuery({})}) t
    `);
    const total = rows[0]?.totalCount ?? 0;
    ok(res, {
      ...paged(rows.map(({ totalCount: _t, ...r }) => r), total, q),
      totals: {
        billed: totals[0]?.billed ?? 0,
        paid: totals[0]?.paid ?? 0,
        remaining: Math.round(((totals[0]?.billed ?? 0) - (totals[0]?.paid ?? 0)) * 1000) / 1000,
      },
    });
  }),
);

financeRouter.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!c) throw notFound('العميل غير موجود');
    const [summary, payments] = await Promise.all([
      customerFinance(c.id),
      prisma.payment.findMany({
        where: { customerId: c.id, deletedAt: null },
        orderBy: { paidAt: 'desc' },
        include: {
          booking: { select: { number: true } },
          order: { select: { number: true } },
          contract: { select: { number: true } },
          recordedBy: { select: { name: true } },
        },
      }),
    ]);
    ok(res, { customer: { id: c.id, name: c.name, phone: c.phone, companyName: c.companyName }, summary, payments });
  }),
);

const paymentInput = z.object({
  customerId: z.string().min(1, 'اختر العميل'),
  amount: moneyInput.refine((v) => v > 0, 'المبلغ يجب أن يكون أكبر من صفر'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CLIQ', 'CARD', 'OTHER']).default('CASH'),
  paidAt: z.coerce.date().optional(),
  reference: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  bookingId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  contractId: z.string().optional().nullable(),
});

financeRouter.post(
  '/payments',
  asyncHandler(async (req, res) => {
    const input = paymentInput.parse(req.body);
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw notFound('العميل غير موجود');
    // التأكد أن الحجز/الطلب/العقد يخص نفس العميل
    const checks = await Promise.all([
      input.bookingId ? prisma.booking.findFirst({ where: { id: input.bookingId, customerId: customer.id } }) : true,
      input.orderId ? prisma.order.findFirst({ where: { id: input.orderId, customerId: customer.id } }) : true,
      input.contractId ? prisma.contract.findFirst({ where: { id: input.contractId, customerId: customer.id } }) : true,
    ]);
    if (checks.some((c) => !c)) throw badRequest('العنصر المرتبط لا يخص هذا العميل');
    const payment = await prisma.payment.create({
      data: {
        customerId: customer.id,
        amount: new Prisma.Decimal(input.amount),
        method: input.method,
        paidAt: input.paidAt ?? new Date(),
        reference: input.reference ?? null,
        note: input.note ?? null,
        bookingId: input.bookingId ?? null,
        orderId: input.orderId ?? null,
        contractId: input.contractId ?? null,
        recordedById: req.auth!.sub,
      },
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'payment', entityId: payment.id, meta: { amount: input.amount } });
    ok(res, { payment, summary: await customerFinance(customer.id) }, 201);
  }),
);

financeRouter.delete(
  '/payments/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.payment.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'payment', entityId: p.id });
    ok(res, { deleted: true, summary: await customerFinance(p.customerId) });
  }),
);

const METHOD_AR: Record<string, string> = { CASH: 'نقدًا', BANK_TRANSFER: 'تحويل بنكي', CLIQ: 'كليك', CARD: 'بطاقة', OTHER: 'أخرى' };

/** تصدير CSV: ملخص العملاء أو سجل الدفعات */
financeRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { kind } = z.object({ kind: z.enum(['customers', 'payments']).default('customers') }).parse(req.query);
    let csv: string;
    if (kind === 'customers') {
      const rows = await prisma.$queryRaw<FinanceRow[]>(financeQuery({}));
      csv = toCsv(
        ['العميل', 'الهاتف', 'الشركة', 'إجمالي المطلوب', 'المدفوع', 'المتبقي'],
        rows.map((r) => [r.name, displayPhone(r.phone), r.companyName ?? '', r.billed.toFixed(3), r.paid.toFixed(3), r.remaining.toFixed(3)]),
      );
    } else {
      const payments = await prisma.payment.findMany({
        where: { deletedAt: null },
        orderBy: { paidAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          booking: { select: { number: true } },
          order: { select: { number: true } },
          contract: { select: { number: true } },
        },
      });
      csv = toCsv(
        ['التاريخ', 'العميل', 'الهاتف', 'المبلغ', 'طريقة الدفع', 'مرتبط بـ', 'المرجع', 'ملاحظة'],
        payments.map((p) => [
          p.paidAt.toISOString().slice(0, 10),
          p.customer.name,
          displayPhone(p.customer.phone),
          Number(p.amount).toFixed(3),
          METHOD_AR[p.method],
          p.booking ? `حجز #${p.booking.number}` : p.order ? `طلب #${p.order.number}` : p.contract ? `عقد #${p.contract.number}` : '',
          p.reference ?? '',
          p.note ?? '',
        ]),
      );
    }
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="farjar-group-${kind}-${date}.csv"`);
    res.send(csv);
  }),
);
