-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "options" JSONB,
ADD COLUMN     "variant" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "options" JSONB NOT NULL DEFAULT '[]';

