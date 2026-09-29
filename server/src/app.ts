import './lib/zodArabic';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { ok } from './lib/http';
import { prisma } from './lib/prisma';
import { attachSession } from './middleware/auth';
import { originGuard } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { accountRouter } from './routes/customer/account';
import { bookingsRouter } from './routes/public/bookings';
import { corporateRouter } from './routes/public/corporate';
import { emailRouter } from './routes/public/email';
import { siteRouter } from './routes/public/site';
import { storeRouter } from './routes/public/store';
import { vendorRouter } from './routes/vendor';
import { driverRouter } from './routes/driver';
import { notificationsRouter } from './routes/notifications';
import { trackRouter } from './routes/public/track';
import { LOCAL_UPLOAD_DIR } from './services/upload.service';
import { marketRouter } from './routes/market';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || env.clientOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(compression({ filter: (req, res) => req.path.endsWith('/events') ? false : compression.filter(req, res) }));
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  // الملفات المحلية (التطوير فقط — في الإنتاج Cloudinary)
  if (!env.cloudinaryEnabled) {
    app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d', index: false }));
  }

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'up', time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(originGuard);
  api.use(attachSession);
  api.use('/site', siteRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/store', storeRouter);
  api.use('/corporate', corporateRouter);
  api.use('/email', emailRouter);
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use('/admin', adminRouter);
  api.use('/vendor', vendorRouter);
  api.use('/driver', driverRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/track', trackRouter);
  api.use('/market', marketRouter);
  app.use('/api/v1', api);
  // نفس المسارات بدون رقم الإصدار: /api/auth/me و /api/admin/...
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
