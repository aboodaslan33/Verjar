-- CreateEnum
CREATE TYPE "RecognitionKind" AS ENUM ('SUPPLIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('FREE_SUBSCRIPTION', 'FEATURED_PLACEMENT', 'HOME_BANNER', 'EXTRA_PRODUCTS', 'SUBSCRIPTION_DISCOUNT', 'BADGE', 'COUPON', 'POINTS');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "LoyaltyAudience" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyTier" TEXT NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscount" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "couponId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "awardTitle" TEXT,
ADD COLUMN     "awardUntil" TIMESTAMP(3),
ADD COLUMN     "extraProducts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extraProductsUntil" TIMESTAMP(3),
ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyTier" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "subscriptionDiscountPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionDiscountUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "final" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recognition" (
    "id" TEXT NOT NULL,
    "kind" "RecognitionKind" NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "vendorId" TEXT,
    "customerId" TEXT,
    "score" JSONB,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "recognitionId" TEXT,
    "vendorId" TEXT,
    "customerId" TEXT,
    "type" "RewardType" NOT NULL,
    "title" TEXT NOT NULL,
    "planId" TEXT,
    "durationDays" INTEGER,
    "value" DECIMAL(12,3),
    "couponId" TEXT,
    "adId" TEXT,
    "subscriptionId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" "RewardStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "CouponType" NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL(10,3) NOT NULL,
    "maxDiscount" DECIMAL(10,3),
    "minOrder" DECIMAL(10,3),
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "discount" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTier" (
    "id" TEXT NOT NULL,
    "audience" "LoyaltyAudience" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "minPoints" INTEGER NOT NULL DEFAULT 0,
    "minSpend" DECIMAL(12,3),
    "benefits" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyPointsLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyPointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_period_key" ON "MonthlySnapshot"("period");

-- CreateIndex
CREATE INDEX "Recognition_period_idx" ON "Recognition"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Recognition_kind_period_key" ON "Recognition"("kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_couponId_key" ON "Reward"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_adId_key" ON "Reward"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_subscriptionId_key" ON "Reward"("subscriptionId");

-- CreateIndex
CREATE INDEX "Reward_vendorId_status_idx" ON "Reward"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Reward_customerId_status_idx" ON "Reward"("customerId", "status");

-- CreateIndex
CREATE INDEX "Reward_createdAt_idx" ON "Reward"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_customerId_idx" ON "CouponRedemption"("couponId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTier_audience_code_key" ON "LoyaltyTier"("audience", "code");

-- CreateIndex
CREATE INDEX "LoyaltyPointsLedger_customerId_idx" ON "LoyaltyPointsLedger"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyPointsLedger_vendorId_idx" ON "LoyaltyPointsLedger"("vendorId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyPointsLedger" ADD CONSTRAINT "LoyaltyPointsLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyPointsLedger" ADD CONSTRAINT "LoyaltyPointsLedger_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- مستويات الولاء الافتراضية (غير مفعّلة — جاهزة للمرحلة القادمة)
INSERT INTO "LoyaltyTier" ("id", "audience", "code", "name", "rank", "minPoints", "minSpend", "benefits", "active", "updatedAt") VALUES
  ('lt_c_regular', 'CUSTOMER', 'REGULAR', 'Regular', 0, 0, 0, '{}', false, NOW()),
  ('lt_c_silver', 'CUSTOMER', 'SILVER', 'Silver', 1, 500, 500, '{}', false, NOW()),
  ('lt_c_gold', 'CUSTOMER', 'GOLD', 'Gold', 2, 2000, 2000, '{}', false, NOW()),
  ('lt_c_vip', 'CUSTOMER', 'VIP', 'VIP', 3, 5000, 5000, '{}', false, NOW()),
  ('lt_s_standard', 'SUPPLIER', 'STANDARD', 'Standard', 0, 0, 0, '{}', false, NOW()),
  ('lt_s_verified', 'SUPPLIER', 'VERIFIED', 'Verified', 1, 1000, 5000, '{}', false, NOW()),
  ('lt_s_premium', 'SUPPLIER', 'PREMIUM', 'Premium', 2, 5000, 25000, '{}', false, NOW()),
  ('lt_s_featured', 'SUPPLIER', 'FEATURED', 'Featured', 3, 10000, 50000, '{}', false, NOW())
ON CONFLICT DO NOTHING;
