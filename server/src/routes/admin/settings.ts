import { Router } from 'express';
import { audit } from '../../lib/audit';
import { asyncHandler, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { getSettings, settingsSchema, updateSettings } from '../../services/settings.service';
import { whatsappMode } from '../../services/whatsapp.service';
import { env } from '../../config/env';

export const settingsRouter = Router();

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, {
      settings: await getSettings(),
      system: { whatsappMode: whatsappMode(), cloudinary: env.cloudinaryEnabled, email: env.emailEnabled },
    });
  }),
);

settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const patch = settingsSchema.partial().parse(req.body);
    const s = await updateSettings(patch);
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'update', entity: 'settings', meta: Object.keys(patch) });
    ok(res, s);
  }),
);

export const logsRouter = Router();

logsRouter.get(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.whatsAppLog.findMany({ orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.whatsAppLog.count(),
    ]);
    ok(res, paged(items, total, q));
  }),
);

logsRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
        ...pageArgs(q),
      }),
      prisma.auditLog.count(),
    ]);
    ok(res, paged(items, total, q));
  }),
);
