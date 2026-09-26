import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export async function audit(params: {
  actorId?: string | null;
  actorType: 'admin' | 'customer' | 'system' | 'public';
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorType === 'admin' ? params.actorId ?? null : null,
        actorType: params.actorType,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        meta: params.meta,
      },
    });
  } catch (e) {
    // سجل التدقيق لا يجب أن يوقف العملية الأساسية
    console.error('audit failed', e);
  }
}
