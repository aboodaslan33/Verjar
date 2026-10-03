import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, notFound, ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { ammanToUtc } from '../../lib/time';
import { marketNotify } from '../../market/notify';
import {
  FEE_STATUSES,
  allSuppliers,
  deleteFeePayment,
  paymentsOf,
  periodReport,
  recentActivity,
  recordFeePayment,
  setDispute,
  statement,
  supplierSummary,
} from '../../market/supplierFinance';
import { optionalDate } from './shared';

/** إدارة مالية الموردين: نسبة فرجار المستحقة على كل مورد، الدفعات اليدوية، النزاعات، والتقارير */
export const supplierFinanceRouter = Router();

const range = (from?: string, to?: string) => ({
  from: from ? ammanToUtc(from, '00:00') : undefined,
  to: to ? ammanToUtc(to, '23:59') : undefined,
});

supplierFinanceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, await allSuppliers());
  }),
);

supplierFinanceRouter.get(
  '/report',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        groupBy: z.enum(['day', 'week', 'month', 'year']).default('month'),
        vendorId: z.string().max(40).optional(),
        status: z.enum(FEE_STATUSES).optional(),
        from: optionalDate,
        to: optionalDate,
      })
      .parse(req.query);
    ok(res, await periodReport({ groupBy: q.groupBy, vendorId: q.vendorId || undefined, status: q.status, ...range(q.from, q.to) }));
  }),
);

supplierFinanceRouter.get(
  '/:vendorId',
  asyncHandler(async (req, res) => {
    const q = z.object({ status: z.enum(FEE_STATUSES).optional(), from: optionalDate, to: optionalDate }).parse(req.query);
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.vendorId, isHouse: false },
      select: { id: true, name: true, slug: true, active: true, status: true, phone: true, email: true, platformFeePercent: true },
    });
    if (!vendor) throw notFound('المورد غير موجود');
    const [s, st, payments, activity] = await Promise.all([
      supplierSummary(vendor.id),
      statement(vendor.id, { status: q.status, ...range(q.from, q.to) }),
      paymentsOf(vendor.id),
      recentActivity(vendor.id),
    ]);
    ok(res, { vendor, ...s, statement: st, payments, activity });
  }),
);

const paymentInput = z.object({
  amount: z.coerce.number().positive('المبلغ يجب أن يكون أكبر من صفر').max(10_000_000),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CLIQ', 'CARD', 'OTHER']).default('BANK_TRANSFER'),
  reference: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  paidAt: optionalDate,
});

/** تسجيل دفعة يدوية من المورد لفرجار (لا توجد بوابة دفع حاليًا) */
supplierFinanceRouter.post(
  '/:vendorId/payments',
  asyncHandler(async (req, res) => {
    const input = paymentInput.parse(req.body);
    const r = await prisma.$transaction((tx) =>
      recordFeePayment(
        tx,
        req.params.vendorId,
        { ...input, paidAt: input.paidAt ? ammanToUtc(input.paidAt, '12:00') : undefined },
        req.auth!.sub,
      ),
    );
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'fee_payment',
      entity: 'vendor',
      entityId: req.params.vendorId,
      meta: { paymentId: r.payment.id, amount: input.amount, reference: input.reference ?? null },
    });
    await marketNotify(prisma, { vendorIds: [req.params.vendorId] }, {
      title: 'تم تسجيل دفعتك لفرجار',
      body: `سُجّلت دفعة بقيمة ${input.amount} د.أ من نسبة فرجار. المتبقي عليك ${r.remaining} د.أ.`,
      link: '/vendor/finance',
      cta: 'كشف الحساب',
    }).catch(() => undefined);
    ok(res, { id: r.payment.id, remaining: r.remaining }, 201);
  }),
);

supplierFinanceRouter.delete(
  '/payments/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.$transaction((tx) => deleteFeePayment(tx, req.params.id));
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'fee_payment_delete', entity: 'vendor', entityId: p.vendorId, meta: { paymentId: p.id, amount: Number(p.amount) } });
    ok(res, { deleted: true });
  }),
);

/** فتح أو إغلاق نزاع على نسبة فرجار لطلب */
supplierFinanceRouter.post(
  '/vendor-orders/:id/dispute',
  asyncHandler(async (req, res) => {
    const input = z.object({ disputed: z.boolean(), note: z.string().trim().max(500).optional().nullable() }).parse(req.body);
    const vo = await setDispute(prisma, req.params.id, { ...input, by: 'ADMIN' });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: input.disputed ? 'fee_dispute' : 'fee_dispute_resolve', entity: 'vendorOrder', entityId: vo.id, meta: input });
    await marketNotify(prisma, { vendorIds: [vo.vendorId] }, {
      title: input.disputed ? `نزاع على نسبة فرجار — طلب #${vo.number}` : `أُغلق النزاع على طلب #${vo.number}`,
      body: input.note || (input.disputed ? 'فتحت الإدارة نزاعًا على هذا الطلب.' : 'عاد المبلغ لحالته الطبيعية في كشف الحساب.'),
      link: '/vendor/finance',
    }).catch(() => undefined);
    ok(res, { disputed: input.disputed });
  }),
);
