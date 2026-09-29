-- إثبات الدفع اليدوي على فواتير السوق (صورة/PDF الحوالة + المرجع) ومراجعة الإدارة
ALTER TABLE "MarketInvoice" ADD COLUMN "proofUrl" TEXT,
ADD COLUMN "proofPublicId" TEXT,
ADD COLUMN "proofName" TEXT,
ADD COLUMN "proofKind" TEXT,
ADD COLUMN "proofStatus" TEXT,
ADD COLUMN "proofSubmittedAt" TIMESTAMP(3),
ADD COLUMN "payerReference" TEXT,
ADD COLUMN "payerNote" TEXT,
ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "MarketInvoice_proofStatus_idx" ON "MarketInvoice"("proofStatus");
