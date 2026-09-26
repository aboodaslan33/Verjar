import { Prisma, PrismaClient } from '@prisma/client';

// المبالغ تُرسل للواجهة كأرقام بدل نصوص
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function toJSON(this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
