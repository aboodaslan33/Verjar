-- AlterTable
ALTER TABLE "VendorOrder" ADD COLUMN     "feeDisputeNote" TEXT,
ADD COLUMN     "feeDisputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feeDisputedAt" TIMESTAMP(3),
ADD COLUMN     "feeDisputedBy" TEXT,
ADD COLUMN     "feePaid" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FarjarFeePayment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarjarFeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarjarFeeAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "amount" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "FarjarFeeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FarjarFeePayment_vendorId_idx" ON "FarjarFeePayment"("vendorId");

-- CreateIndex
CREATE INDEX "FarjarFeePayment_paidAt_idx" ON "FarjarFeePayment"("paidAt");

-- CreateIndex
CREATE INDEX "FarjarFeeAllocation_paymentId_idx" ON "FarjarFeeAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "FarjarFeeAllocation_vendorOrderId_idx" ON "FarjarFeeAllocation"("vendorOrderId");

-- AddForeignKey
ALTER TABLE "FarjarFeePayment" ADD CONSTRAINT "FarjarFeePayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarjarFeePayment" ADD CONSTRAINT "FarjarFeePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarjarFeeAllocation" ADD CONSTRAINT "FarjarFeeAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FarjarFeePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarjarFeeAllocation" ADD CONSTRAINT "FarjarFeeAllocation_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

