-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PAID', 'COD', 'PARTIAL_PAYMENT', 'PAYMENT_PENDING', 'COLLECTED', 'NOT_COLLECTED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('STORE', 'SUPPLIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "NotificationRecipient" AS ENUM ('USER', 'CUSTOMER', 'VENDOR');

-- AlterEnum: إعادة تسمية قيم حالة التوصيل في مكانها (بدون فقد بيانات) ثم إضافة القيم الجديدة
ALTER TYPE "DeliveryStatus" RENAME VALUE 'PENDING' TO 'NEW';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'PREPARING' TO 'ACCEPTED';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'ASSIGNED' TO 'PICKUP_ASSIGNED';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'OUT_FOR_DELIVERY' TO 'IN_TRANSIT';
ALTER TYPE "DeliveryStatus" RENAME VALUE 'FAILED' TO 'DELIVERY_FAILED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP' AFTER 'ACCEPTED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'ARRIVED' AFTER 'IN_TRANSIT';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_COLLECTED' AFTER 'DELIVERED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'COMPLETED' AFTER 'PAYMENT_COLLECTED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_NOT_AVAILABLE' AFTER 'DELIVERY_FAILED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_REFUSED' AFTER 'CUSTOMER_NOT_AVAILABLE';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'WRONG_ADDRESS' AFTER 'CUSTOMER_REFUSED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULED' AFTER 'WRONG_ADDRESS';
ALTER TABLE "Order" ALTER COLUMN "deliveryStatus" SET DEFAULT 'NEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "areas" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "area" TEXT,
ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "code" TEXT,
ADD COLUMN     "collectedById" TEXT,
ADD COLUMN     "collectedMethod" "PaymentMethod",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "customerPaysFee" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "financialStatus" "FinancialStatus",
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpHash" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "pickupPhone" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'STORE',
ADD COLUMN     "supplierId" TEXT,
ALTER COLUMN "deliveryStatus" SET DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "recipientName" TEXT NOT NULL,
    "signatureUrl" TEXT,
    "photoUrl" TEXT,
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "amountCollected" DECIMAL(10,3),
    "note" TEXT,
    "createdById" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientType" "NotificationRecipient" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "orderId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAssignment_orderId_idx" ON "DeliveryAssignment"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_driverId_status_idx" ON "DeliveryAssignment"("driverId", "status");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON "OrderStatusEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_actorId_idx" ON "OrderStatusEvent"("actorId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_createdAt_idx" ON "OrderStatusEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_orderId_key" ON "DeliveryProof"("orderId");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_readAt_idx" ON "Notification"("recipientType", "recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE INDEX "Order_supplierId_idx" ON "Order"("supplierId");

-- CreateIndex
CREATE INDEX "Order_area_idx" ON "Order"("area");

-- CreateIndex
CREATE INDEX "Order_financialStatus_idx" ON "Order"("financialStatus");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ───────── بيانات: ترقيم الطلبات الحالية FG-ORD-000001 حسب الأقدم ─────────
UPDATE "Order" o SET "code" = 'FG-ORD-' || lpad(x.n::text, 6, '0')
FROM (SELECT "id", row_number() OVER (ORDER BY "number") AS n FROM "Order") x
WHERE o."id" = x."id" AND o."code" IS NULL;
INSERT INTO "RefCounter" ("key", "value") SELECT 'FG-ORD', count(*)::int FROM "Order"
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("RefCounter"."value", EXCLUDED."value");

-- المبلغ المطلوب تحصيله للدفع عند الاستلام يشمل أجرة التوصيل (للطلبات التي لم تُحصَّل بعد)
UPDATE "Order" SET "codAmount" = "total" + "deliveryFee"
WHERE "paymentMethod" = 'COD' AND ("codStatus" IS NULL OR "codStatus" = 'PENDING');

-- الحالة المالية الابتدائية
UPDATE "Order" SET "financialStatus" = CASE
  WHEN "paymentMethod" = 'COD' AND "codStatus" IN ('COLLECTED', 'SETTLED') AND COALESCE("codCollected", 0) + 0.0005 < COALESCE("codAmount", 0) THEN 'PARTIAL_PAYMENT'::"FinancialStatus"
  WHEN "paymentMethod" = 'COD' AND "codStatus" IN ('COLLECTED', 'SETTLED') THEN 'COLLECTED'::"FinancialStatus"
  WHEN "paymentMethod" = 'COD' AND "deliveryStatus" = 'DELIVERED' THEN 'NOT_COLLECTED'::"FinancialStatus"
  WHEN "paymentMethod" = 'COD' THEN 'COD'::"FinancialStatus"
  ELSE 'PAYMENT_PENDING'::"FinancialStatus"
END
WHERE "financialStatus" IS NULL;

-- الطلبات المسندة حاليًا لسائق: سجل إسناد، وحدث أولي في سجل الحالات
INSERT INTO "DeliveryAssignment" ("id", "orderId", "driverId", "status", "assignedAt")
SELECT gen_random_uuid()::text, "id", "driverId", 'ASSIGNED', "updatedAt" FROM "Order" WHERE "driverId" IS NOT NULL;
INSERT INTO "OrderStatusEvent" ("id", "orderId", "toStatus", "actorType", "note", "createdAt")
SELECT gen_random_uuid()::text, "id", "deliveryStatus", 'system', 'الحالة عند تفعيل نظام التوصيل', "updatedAt" FROM "Order";
