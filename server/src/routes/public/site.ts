import { Router } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { getSettings, publicSettings } from '../../services/settings.service';
import { whatsappMode } from '../../services/whatsapp.service';

export const siteRouter = Router();

siteRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    ok(res, { ...publicSettings(s), whatsappMode: whatsappMode() });
  }),
);
