-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "VendorMemberRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('NEW', 'DISTRIBUTED', 'QUOTED', 'NEGOTIATING', 'AWARDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('SENT', 'VIEWED', 'QUOTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdType" AS ENUM ('FEATURED_PRODUCT', 'FEATURED_SUPPLIER', 'INDUSTRIAL_DEAL', 'PRODUCT_OF_WEEK', 'SUPPLIER_OF_MONTH');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoicePurpose" AS ENUM ('SUBSCRIPTION', 'AD', 'LEAD_FEE', 'COMMISSION', 'ORDER', 'PROCUREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "commissionGroup" TEXT,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'IN_STOCK',
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "documents" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "keywords" TEXT,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "minOrderQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "originCountry" TEXT,
ADD COLUMN     "partNumber" TEXT,
ADD COLUMN     "priceOnRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warranty" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessField" TEXT,
ADD COLUMN     "catalogFiles" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "certificates" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planStartedAt" TIMESTAMP(3),
ADD COLUMN     "productTypes" TEXT,
ADD COLUMN     "profileViews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "VendorStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "SupplierPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "maxProducts" INTEGER,
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "maxRfqPerMonth" INTEGER,
    "searchBoost" INTEGER NOT NULL DEFAULT 0,
    "rfqPriority" INTEGER NOT NULL DEFAULT 0,
    "leadsIncluded" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB NOT NULL DEFAULT '{}',
    "badge" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSubscription" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amount" DECIMAL(10,3) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorMember" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "role" "VendorMemberRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "location" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "productId" TEXT,
    "directVendorId" TEXT,
    "budget" DECIMAL(12,3),
    "neededBy" TIMESTAMP(3),
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "status" "RfqStatus" NOT NULL DEFAULT 'NEW',
    "expectedValue" DECIMAL(12,3),
    "finalValue" DECIMAL(12,3),
    "acceptedQuoteId" TEXT,
    "revenueModel" TEXT,
    "commissionRate" DECIMAL(6,3),
    "commissionAmount" DECIMAL(12,3),
    "commissionRuleId" TEXT,
    "orderId" TEXT,
    "adminNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqItem" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'قطعة',
    "specs" TEXT,
    "brand" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqRecipient" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'SENT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "leadFee" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "leadInvoiceId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "RfqRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,3) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "total" DECIMAL(12,3) NOT NULL,
    "leadTimeDays" INTEGER,
    "warranty" TEXT,
    "originCountry" TEXT,
    "brand" TEXT,
    "specs" TEXT,
    "paymentTerms" TEXT,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "fileUrl" TEXT,
    "filePublicId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqEvent" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerReadAt" TIMESTAMP(3),
    "vendorReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "commissionGroup" TEXT,
    "planCode" TEXT,
    "dealType" TEXT,
    "percent" DECIMAL(6,3) NOT NULL,
    "minAmount" DECIMAL(12,3),
    "maxAmount" DECIMAL(12,3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPackage" (
    "id" TEXT NOT NULL,
    "type" "AdType" NOT NULL,
    "name" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'MARKET_HOME',
    "price" DECIMAL(10,3) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketAd" (
    "id" TEXT NOT NULL,
    "type" "AdType" NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'MARKET_HOME',
    "vendorId" TEXT NOT NULL,
    "productId" TEXT,
    "packageId" TEXT,
    "title" TEXT,
    "price" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'REQUESTED',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "invoiceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT,
    "customerId" TEXT,
    "purpose" "InvoicePurpose" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JOD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerRef" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierReview" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "delivery" INTEGER NOT NULL,
    "commitment" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "comment" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDailyStat" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "productViews" INTEGER NOT NULL DEFAULT 0,
    "rfqs" INTEGER NOT NULL DEFAULT 0,
    "quotes" INTEGER NOT NULL DEFAULT 0,
    "adImpressions" INTEGER NOT NULL DEFAULT 0,
    "adClicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VendorDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPlan_code_key" ON "SupplierPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSubscription_invoiceId_key" ON "VendorSubscription"("invoiceId");

-- CreateIndex
CREATE INDEX "VendorSubscription_vendorId_status_idx" ON "VendorSubscription"("vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorSubscription_endsAt_idx" ON "VendorSubscription"("endsAt");

-- CreateIndex
CREATE INDEX "VendorMember_customerId_idx" ON "VendorMember"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorMember_vendorId_customerId_key" ON "VendorMember"("vendorId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_code_key" ON "Rfq"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_acceptedQuoteId_key" ON "Rfq"("acceptedQuoteId");

-- CreateIndex
CREATE INDEX "Rfq_status_idx" ON "Rfq"("status");

-- CreateIndex
CREATE INDEX "Rfq_customerId_idx" ON "Rfq"("customerId");

-- CreateIndex
CREATE INDEX "Rfq_categoryId_idx" ON "Rfq"("categoryId");

-- CreateIndex
CREATE INDEX "Rfq_createdAt_idx" ON "Rfq"("createdAt");

-- CreateIndex
CREATE INDEX "RfqItem_rfqId_idx" ON "RfqItem"("rfqId");

-- CreateIndex
CREATE INDEX "RfqRecipient_vendorId_status_idx" ON "RfqRecipient"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RfqRecipient_rfqId_vendorId_key" ON "RfqRecipient"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "Quote_vendorId_status_idx" ON "Quote"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_rfqId_vendorId_key" ON "Quote"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "RfqEvent_rfqId_createdAt_idx" ON "RfqEvent"("rfqId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_vendorId_lastAt_idx" ON "Conversation"("vendorId", "lastAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_rfqId_vendorId_key" ON "Conversation"("rfqId", "vendorId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionRule_active_idx" ON "CommissionRule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "MarketAd_invoiceId_key" ON "MarketAd"("invoiceId");

-- CreateIndex
CREATE INDEX "MarketAd_status_placement_startsAt_endsAt_idx" ON "MarketAd"("status", "placement", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "MarketAd_vendorId_idx" ON "MarketAd"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketInvoice_number_key" ON "MarketInvoice"("number");

-- CreateIndex
CREATE INDEX "MarketInvoice_vendorId_status_idx" ON "MarketInvoice"("vendorId", "status");

-- CreateIndex
CREATE INDEX "MarketInvoice_purpose_status_idx" ON "MarketInvoice"("purpose", "status");

-- CreateIndex
CREATE INDEX "MarketInvoice_createdAt_idx" ON "MarketInvoice"("createdAt");

-- CreateIndex
CREATE INDEX "SupplierReview_vendorId_visible_idx" ON "SupplierReview"("vendorId", "visible");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierReview_rfqId_vendorId_key" ON "SupplierReview"("rfqId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDailyStat_vendorId_day_key" ON "VendorDailyStat"("vendorId", "day");

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product"("brand");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- CreateIndex
CREATE INDEX "Vendor_verified_idx" ON "Vendor"("verified");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SupplierPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubscription" ADD CONSTRAINT "VendorSubscription_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubscription" ADD CONSTRAINT "VendorSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SupplierPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSubscription" ADD CONSTRAINT "VendorSubscription_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "MarketInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorMember" ADD CONSTRAINT "VendorMember_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorMember" ADD CONSTRAINT "VendorMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_directVendorId_fkey" FOREIGN KEY ("directVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_acceptedQuoteId_fkey" FOREIGN KEY ("acceptedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqRecipient" ADD CONSTRAINT "RfqRecipient_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqRecipient" ADD CONSTRAINT "RfqRecipient_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqEvent" ADD CONSTRAINT "RfqEvent_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAd" ADD CONSTRAINT "MarketAd_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAd" ADD CONSTRAINT "MarketAd_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAd" ADD CONSTRAINT "MarketAd_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "AdPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketAd" ADD CONSTRAINT "MarketAd_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "MarketInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInvoice" ADD CONSTRAINT "MarketInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReview" ADD CONSTRAINT "SupplierReview_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReview" ADD CONSTRAINT "SupplierReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReview" ADD CONSTRAINT "SupplierReview_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDailyStat" ADD CONSTRAINT "VendorDailyStat_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═════════ بيانات أولية للسوق الصناعي (كلها قابلة للتعديل من لوحة الإدارة) ═════════

-- الباقات
INSERT INTO "SupplierPlan" ("id","code","name","description","price","durationDays","maxProducts","maxUsers","maxRfqPerMonth","searchBoost","rfqPriority","leadsIncluded","features","badge","isDefault","active","sortOrder","updatedAt") VALUES
('plan_free','FREE','Free','حساب مجاني: صفحة مورد، عدد محدود من المنتجات، الظهور في البحث واستقبال طلبات عروض أسعار محدودة.',0,36500,20,1,5,0,0,false,'{"analytics":false,"advancedReports":false,"catalog":false,"specialOffers":false,"featuredBadge":false,"campaigns":false}',NULL,true,true,1,NOW()),
('plan_pro','PRO','PRO','منتجات أكثر، صفحة شركة احترافية، ظهور أفضل في البحث، إحصائيات، رفع الكتالوج، عروض خاصة وأولوية في طلبات الشركات.',29,30,200,3,NULL,10,10,true,'{"analytics":true,"advancedReports":false,"catalog":true,"specialOffers":true,"featuredBadge":false,"campaigns":false}','PRO',false,true,2,NOW()),
('plan_business','BUSINESS','BUSINESS','كل مزايا PRO مع ظهور مميز وأعلى أولوية في البحث والطلبات، مستخدمون أكثر، تقارير متقدمة، منتجات مميزة وحملات إعلانية.',79,30,NULL,10,NULL,20,20,true,'{"analytics":true,"advancedReports":true,"catalog":true,"specialOffers":true,"featuredBadge":true,"campaigns":true}','BUSINESS',false,true,3,NOW())
ON CONFLICT ("code") DO NOTHING;

-- الموردون الحاليون: معتمدون على الباقة المجانية
UPDATE "Vendor" SET "planId" = 'plan_free', "planStartedAt" = NOW() WHERE "planId" IS NULL AND "isHouse" = false;
-- متجر FARJAR نفسه: مورد موثّق على باقة BUSINESS
UPDATE "Vendor" SET "planId" = 'plan_business', "planStartedAt" = NOW(), "verified" = true, "verifiedAt" = NOW(), "status" = 'APPROVED', "city" = COALESCE("city", 'عمّان') WHERE "isHouse" = true;
-- مالكو المتاجر الحالية كأعضاء
INSERT INTO "VendorMember" ("id","vendorId","customerId","role")
SELECT 'vm_' || "id", "id", "customerId", 'OWNER' FROM "Vendor" WHERE "customerId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- التصنيفات الصناعية الأولية (لا تُكرر إن وُجدت)
INSERT INTO "Category" ("id","name","slug","sortOrder","visible","commissionGroup","updatedAt")
SELECT 'cat_' || v.slug, v.name, v.slug, v.ord, true, v.grp, NOW()
FROM (VALUES
  ('قطع غيار صناعية','spare-parts',10,'spare_parts'),
  ('ماكينات','machines',11,'machines'),
  ('خطوط إنتاج','production-lines',12,'machines'),
  ('معدات صناعية','industrial-equipment',13,'equipment'),
  ('معدات مناولة','material-handling',14,'equipment'),
  ('عربات داخلية','trolleys-carts',15,'fabrication'),
  ('سيور ناقلة','conveyor-belts',16,'spare_parts'),
  ('محركات','motors',17,'equipment'),
  ('مضخات','pumps',18,'equipment'),
  ('كهرباء صناعية','industrial-electrical',19,'spare_parts'),
  ('Automation & Control','automation-control',20,'spare_parts'),
  ('حساسات','sensors',21,'spare_parts'),
  ('ستانلس ستيل','stainless-steel',22,'fabrication'),
  ('حديد وتصنيع','steel-fabrication',23,'fabrication'),
  ('أدوات ومعدات','tools',24,'spare_parts'),
  ('مواد تشغيل','consumables',25,'spare_parts'),
  ('أنظمة السلامة','safety-systems',26,'spare_parts'),
  ('خدمات صيانة','maintenance-services',27,'services'),
  ('خدمات هندسية','engineering-services',28,'services'),
  ('تصنيع حسب الطلب','custom-manufacturing',29,'fabrication')
) AS v(name, slug, ord, grp)
WHERE NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."slug" = v.slug);

UPDATE "Category" SET "commissionGroup" = 'spare_parts' WHERE "slug" = 'industrial' AND "commissionGroup" IS NULL;

-- قواعد العمولات الافتراضية
INSERT INTO "CommissionRule" ("id","name","commissionGroup","percent","minAmount","maxAmount","priority","active","updatedAt") VALUES
('cr_spare','قطع الغيار والمنتجات الصغيرة','spare_parts',5,1,500,10,true,NOW()),
('cr_machines','المعدات والماكينات','machines',2,NULL,1000,10,true,NOW()),
('cr_equipment','المعدات الصناعية','equipment',3,NULL,750,10,true,NOW()),
('cr_fabrication','التصنيع والستانلس والحديد','fabrication',4,NULL,750,10,true,NOW()),
('cr_services','الخدمات','services',5,NULL,500,10,true,NOW()),
('cr_default','القاعدة العامة',NULL,3,NULL,1000,0,true,NOW())
ON CONFLICT DO NOTHING;

-- باقات الإعلانات
INSERT INTO "AdPackage" ("id","type","name","placement","price","durationDays","active","sortOrder","updatedAt") VALUES
('adp_fp_w','FEATURED_PRODUCT','منتج مميز — أسبوع','MARKET_HOME',10,7,true,1,NOW()),
('adp_fp_m','FEATURED_PRODUCT','منتج مميز — شهر','MARKET_HOME',30,30,true,2,NOW()),
('adp_fs_w','FEATURED_SUPPLIER','مورد مميز — أسبوع','MARKET_HOME',15,7,true,3,NOW()),
('adp_deal_w','INDUSTRIAL_DEAL','عرض صناعي — أسبوع','MARKET_HOME',12,7,true,4,NOW()),
('adp_pow','PRODUCT_OF_WEEK','منتج الأسبوع','MARKET_HOME',25,7,true,5,NOW()),
('adp_som','SUPPLIER_OF_MONTH','مورد الشهر','MARKET_HOME',60,30,true,6,NOW()),
('adp_search_w','FEATURED_PRODUCT','أعلى نتائج البحث — أسبوع','SEARCH_TOP',15,7,true,7,NOW())
ON CONFLICT DO NOTHING;
