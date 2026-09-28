-- عقود الصيانة والعقود السنوية، مكافحة الآفات، العطاءات، التوصيل والدفع عند الاستلام. إضافات فقط، بدون حذف.
-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('MAINTENANCE', 'ANNUAL_CORPORATE');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('NONE', 'PENDING', 'RENEWED', 'NOT_RENEWING');

-- CreateEnum
CREATE TYPE "ContractVisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'UNDER_REVIEW', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenderOfferStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CodStatus" AS ENUM ('PENDING', 'COLLECTED', 'SETTLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('CONFIRMED', 'VOIDED');

-- AlterEnum
ALTER TYPE "ContractStatus" ADD VALUE 'DRAFT';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'COD';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "ref" TEXT,
ADD COLUMN     "renewalStatus" "RenewalStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "responseHours" INTEGER,
ADD COLUMN     "technicianId" TEXT,
ADD COLUMN     "tenderId" TEXT,
ADD COLUMN     "terms" TEXT,
ADD COLUMN     "type" "ContractType" NOT NULL DEFAULT 'MAINTENANCE',
ADD COLUMN     "visitsIncluded" INTEGER;

-- AlterTable
ALTER TABLE "CorporateRequest" ADD COLUMN     "contractId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codAmount" DECIMAL(10,3),
ADD COLUMN     "codCollected" DECIMAL(10,3),
ADD COLUMN     "codCollectedAt" TIMESTAMP(3),
ADD COLUMN     "codStatus" "CodStatus",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCompanyId" TEXT,
ADD COLUMN     "deliveryFee" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "settlementId" TEXT;

-- CreateTable
CREATE TABLE "ContractVisit" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "technicianId" TEXT,
    "status" "ContractVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceId" TEXT,
    "location" TEXT NOT NULL,
    "durationMonths" INTEGER,
    "deadline" TIMESTAMP(3) NOT NULL,
    "budget" DECIMAL(12,3),
    "requirements" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
    "awardedOfferId" TEXT,
    "awardedAmount" DECIMAL(12,3),
    "commissionPercent" DECIMAL(5,2),
    "commissionAmount" DECIMAL(12,3),
    "providerAmount" DECIMAL(12,3),
    "awardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderOffer" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "vendorId" TEXT,
    "providerName" TEXT NOT NULL,
    "price" DECIMAL(12,3) NOT NULL,
    "proposal" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "TenderOfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "defaultFee" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverySettlement" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "driverId" TEXT,
    "deliveryCompanyId" TEXT,
    "amount" DECIMAL(12,3) NOT NULL,
    "ordersCount" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RefCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_ContractServices" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContractServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ContractVisit_contractId_idx" ON "ContractVisit"("contractId");

-- CreateIndex
CREATE INDEX "ContractVisit_scheduledAt_idx" ON "ContractVisit"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_ref_key" ON "Tender"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_awardedOfferId_key" ON "Tender"("awardedOfferId");

-- CreateIndex
CREATE INDEX "Tender_status_idx" ON "Tender"("status");

-- CreateIndex
CREATE INDEX "Tender_deadline_idx" ON "Tender"("deadline");

-- CreateIndex
CREATE INDEX "Tender_customerId_idx" ON "Tender"("customerId");

-- CreateIndex
CREATE INDEX "TenderOffer_tenderId_idx" ON "TenderOffer"("tenderId");

-- CreateIndex
CREATE INDEX "TenderOffer_vendorId_idx" ON "TenderOffer"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverySettlement_ref_key" ON "DeliverySettlement"("ref");

-- CreateIndex
CREATE INDEX "DeliverySettlement_driverId_idx" ON "DeliverySettlement"("driverId");

-- CreateIndex
CREATE INDEX "DeliverySettlement_deliveryCompanyId_idx" ON "DeliverySettlement"("deliveryCompanyId");

-- CreateIndex
CREATE INDEX "DeliverySettlement_receivedAt_idx" ON "DeliverySettlement"("receivedAt");

-- CreateIndex
CREATE INDEX "_ContractServices_B_index" ON "_ContractServices"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_ref_key" ON "Contract"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenderId_key" ON "Contract"("tenderId");

-- CreateIndex
CREATE INDEX "Contract_type_idx" ON "Contract"("type");

-- CreateIndex
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");

-- CreateIndex
CREATE INDEX "Order_driverId_idx" ON "Order"("driverId");

-- CreateIndex
CREATE INDEX "Order_codStatus_idx" ON "Order"("codStatus");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "DeliverySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateRequest" ADD CONSTRAINT "CorporateRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVisit" ADD CONSTRAINT "ContractVisit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVisit" ADD CONSTRAINT "ContractVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CorporateService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_awardedOfferId_fkey" FOREIGN KEY ("awardedOfferId") REFERENCES "TenderOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderOffer" ADD CONSTRAINT "TenderOffer_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderOffer" ADD CONSTRAINT "TenderOffer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_deliveryCompanyId_fkey" FOREIGN KEY ("deliveryCompanyId") REFERENCES "DeliveryCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverySettlement" ADD CONSTRAINT "DeliverySettlement_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractServices" ADD CONSTRAINT "_ContractServices_A_fkey" FOREIGN KEY ("A") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContractServices" ADD CONSTRAINT "_ContractServices_B_fkey" FOREIGN KEY ("B") REFERENCES "CorporateService"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- العقود القائمة المحوّلة من طلب شركة سنوي تصبح "عقد سنوي لشركة"
UPDATE "Contract" c SET "type" = 'ANNUAL_CORPORATE'
FROM "CorporateRequest" r WHERE c."corporateRequestId" = r."id" AND r."type" = 'ANNUAL';

-- خدمة مكافحة الآفات ضمن كتالوج خدمات الشركات (سنوي وعاجل)
INSERT INTO "CorporateService" ("id", "key", "name", "kind", "sortOrder", "active")
VALUES ('svc_pest_annual', 'pest-control', 'مكافحة الآفات', 'ANNUAL', 50, true),
       ('svc_pest_urgent', 'pest-control-urgent', 'مكافحة الآفات (طارئ)', 'URGENT', 50, true)
ON CONFLICT ("key") DO NOTHING;
