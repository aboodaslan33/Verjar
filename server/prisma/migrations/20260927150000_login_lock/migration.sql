-- قفل تسجيل الدخول بعد المحاولات الخاطئة
-- CreateTable
CREATE TABLE "LoginLock" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginLock_pkey" PRIMARY KEY ("key")
);

