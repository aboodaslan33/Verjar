-- حسابات العملاء: تسجيل ذاتي + دخول بالبريد

-- توحيد البريد (أحرف صغيرة، والفارغ يصبح NULL)
UPDATE "Customer" SET "email" = NULLIF(LOWER(TRIM("email")), '') WHERE "email" IS NOT NULL;

-- إن تكرر بريد بين أكثر من عميل يبقى عند الأقدم فقط حتى يمكن إنشاء الفهرس الفريد
UPDATE "Customer" c SET "email" = NULL
WHERE c."email" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Customer" d
    WHERE d."email" = c."email"
      AND (d."createdAt" < c."createdAt" OR (d."createdAt" = c."createdAt" AND d."id" < c."id"))
  );

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "registeredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
