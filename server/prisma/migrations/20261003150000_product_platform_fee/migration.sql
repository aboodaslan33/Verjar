-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "platformFeePercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "platformFeeAmount" DECIMAL(10,3),
ADD COLUMN     "platformFeePercent" DECIMAL(5,2),
ADD COLUMN     "supplierUnitPrice" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "feeRequestAt" TIMESTAMP(3),
ADD COLUMN     "feeRequestNote" TEXT,
ADD COLUMN     "feeRequestPercent" DECIMAL(5,2),
ADD COLUMN     "platformFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
ADD COLUMN     "supplierPrice" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "platformFeePercent" DECIMAL(5,2);


-- منتجات الموردين الحالية: سعر العميل يبقى كما هو، ويُستخرج سعر المورد بنسبة فرجار الافتراضية 2%
UPDATE "Product" p SET "supplierPrice" = ROUND(p."price" / 1.02, 3), "platformFeePercent" = 2
FROM "Vendor" v WHERE v."id" = p."vendorId" AND v."isHouse" = false;

-- منتجات فرجار نفسها: لا نسبة، سعر المورد = سعر العميل
UPDATE "Product" p SET "supplierPrice" = p."price", "platformFeePercent" = 0
FROM "Vendor" v WHERE v."id" = p."vendorId" AND v."isHouse" = true;

-- بنود الطلبات القديمة: لقطة من العمولة المحفوظة وقتها
UPDATE "OrderItem" oi SET
  "supplierUnitPrice" = CASE WHEN oi."quantity" > 0 THEN ROUND(oi."vendorNet" / oi."quantity", 3) ELSE oi."unitFinalPrice" END,
  "platformFeePercent" = oi."commissionPercent",
  "platformFeeAmount" = oi."commissionAmount"
FROM "Vendor" v WHERE v."id" = oi."vendorId" AND v."isHouse" = false;

UPDATE "OrderItem" oi SET "supplierUnitPrice" = oi."unitFinalPrice", "platformFeePercent" = 0, "platformFeeAmount" = 0
FROM "Vendor" v WHERE v."id" = oi."vendorId" AND v."isHouse" = true;
