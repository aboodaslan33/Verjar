import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth';
import { bookingsAdminRouter, techniciansRouter } from './bookings';
import { corporateAdminRouter } from './corporate';
import { customersRouter } from './customers';
import { dashboardRouter } from './dashboard';
import { filesRouter } from './files';
import { financeRouter } from './finance';
import { ordersRouter } from './orders';
import { productsRouter } from './products';
import { newsletterRouter } from './newsletter';
import { logsRouter, settingsRouter } from './settings';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/store', productsRouter);
adminRouter.use('/orders', ordersRouter);
adminRouter.use('/bookings', bookingsAdminRouter);
adminRouter.use('/technicians', techniciansRouter);
adminRouter.use('/corporate', corporateAdminRouter);
adminRouter.use('/files', filesRouter);
adminRouter.use('/finance', financeRouter);
adminRouter.use('/customers', customersRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/logs', logsRouter);
adminRouter.use('/newsletter', newsletterRouter);
