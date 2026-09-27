-- السوق متعدد الموردين: الأقسام الفرعية، الموردون، الطلبات الفرعية، والتسويات.
-- البيانات القائمة تنتقل للمورد الافتراضي (الشركة) دون فقدان.

-- CreateEnum
CREATE TYPE "ProductApproval" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "specFields" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "logoPublicId" TEXT,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isHouse" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- المورد الافتراضي: الشركة نفسها (عمولة 100% = كل الإيراد للشركة، لا مستحقات)
INSERT INTO "Vendor" ("id", "name", "slug", "description", "commissionPercent", "isHouse", "updatedAt")
VALUES ('house_vendor', 'مجموعة فرجا', 'farja-group', 'منتجات من ورشة مجموعة فرجا.', 100, true, CURRENT_TIMESTAMP);

-- المنتجات القائمة: للمورد الافتراضي ومعتمدة
ALTER TABLE "Product" ADD COLUMN "approvalStatus" "ProductApproval" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "specs" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "vendorId" TEXT;
UPDATE "Product" SET "vendorId" = 'house_vendor';
ALTER TABLE "Product" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "VendorOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "subtotal" DECIMAL(10,3) NOT NULL,
    "total" DECIMAL(10,3) NOT NULL,
    "commissionTotal" DECIMAL(10,3) NOT NULL,
    "vendorNet" DECIMAL(10,3) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorOrder_pkey" PRIMARY KEY ("id")
);
ALTER SEQUENCE "VendorOrder_number_seq" RESTART WITH 1000;

-- الطلبات القائمة: طلب فرعي واحد للمورد الافتراضي
INSERT INTO "VendorOrder" ("id", "orderId", "vendorId", "status", "subtotal", "total", "commissionTotal", "vendorNet", "createdAt", "updatedAt")
SELECT 'vo_' || o."id", o."id", 'house_vendor', o."status", o."subtotal", o."total", o."total", 0, o."createdAt", CURRENT_TIMESTAMP
FROM "Order" o ORDER BY o."number";

ALTER TABLE "OrderItem" ADD COLUMN "commissionAmount" DECIMAL(10,3),
ADD COLUMN "commissionPercent" DECIMAL(5,2),
ADD COLUMN "vendorId" TEXT,
ADD COLUMN "vendorNet" DECIMAL(10,3),
ADD COLUMN "vendorOrderId" TEXT;
UPDATE "OrderItem" SET "vendorId" = 'house_vendor', "vendorOrderId" = 'vo_' || "orderId",
  "commissionPercent" = 100, "commissionAmount" = "lineTotal", "vendorNet" = 0;
ALTER TABLE "OrderItem" ALTER COLUMN "commissionAmount" SET NOT NULL,
ALTER COLUMN "commissionPercent" SET NOT NULL,
ALTER COLUMN "vendorId" SET NOT NULL,
ALTER COLUMN "vendorNet" SET NOT NULL,
ALTER COLUMN "vendorOrderId" SET NOT NULL;

-- CreateTable
CREATE TABLE "VendorPayout" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "salesTotal" DECIMAL(12,3) NOT NULL,
    "commissionTotal" DECIMAL(12,3) NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_customerId_key" ON "Vendor"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE INDEX "Vendor_active_idx" ON "Vendor"("active");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOrder_number_key" ON "VendorOrder"("number");

-- CreateIndex
CREATE INDEX "VendorOrder_vendorId_status_idx" ON "VendorOrder"("vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorOrder_payoutId_idx" ON "VendorOrder"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorOrder_orderId_vendorId_key" ON "VendorOrder"("orderId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorPayout_vendorId_idx" ON "VendorPayout"("vendorId");

-- CreateIndex
CREATE INDEX "VendorPayout_paidAt_idx" ON "VendorPayout"("paidAt");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "OrderItem_vendorOrderId_idx" ON "OrderItem"("vendorOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_vendorId_idx" ON "OrderItem"("vendorId");

-- CreateIndex
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");

-- CreateIndex
CREATE INDEX "Product_approvalStatus_idx" ON "Product"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "VendorPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vendorOrderId_fkey" FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayout" ADD CONSTRAINT "VendorPayout_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayout" ADD CONSTRAINT "VendorPayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
