import { Router } from 'express';
import { requireAccess, requireAdmin, requirePermission } from '../../middleware/auth';
import { bookingsAdminRouter, techniciansRouter } from './bookings';
import { corporateAdminRouter } from './corporate';
import { customersRouter } from './customers';
import { insightsRouter } from './insights';
import { dashboardRouter } from './dashboard';
import { filesRouter } from './files';
import { financeRouter } from './finance';
import { ordersRouter } from './orders';
import { productsRouter } from './products';
import { supplierFinanceRouter } from './supplierFinance';
import { newsletterRouter } from './newsletter';
import { logsRouter, settingsRouter } from './settings';
import { vendorsAdminRouter } from './vendors';
import { deliveryRouter } from './delivery';
import { tendersAdminRouter } from './tenders';
import { reportsRouter } from './reports';
import { usersRouter } from './users';
import { marketAdminRouter } from './market';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// كل قسم محمي بصلاحيته: العرض (GET) أو الإدارة (باقي الطلبات) — RBAC
adminRouter.use('/dashboard', requirePermission('dashboard.view'), dashboardRouter);
adminRouter.use('/store', requireAccess('catalog.manage', 'catalog.manage'), productsRouter);
adminRouter.use('/orders', requireAccess('orders.view', 'orders.manage'), ordersRouter);
adminRouter.use('/bookings', requireAccess('bookings.manage', 'bookings.manage'), bookingsAdminRouter);
adminRouter.use('/technicians', requireAccess('bookings.manage', 'bookings.manage'), techniciansRouter);
adminRouter.use('/corporate', requireAccess('corporate.manage', 'corporate.manage'), corporateAdminRouter);
adminRouter.use('/files', requireAccess('customers.view', 'customers.manage'), filesRouter);
adminRouter.use('/finance', requireAccess('payments.view', 'payments.manage'), financeRouter);
adminRouter.use('/supplier-finance', requireAccess('payments.view', 'payments.manage'), supplierFinanceRouter);
adminRouter.use('/customers', requireAccess('customers.view', 'customers.manage'), customersRouter);
adminRouter.use('/settings', requireAccess('settings.manage', 'settings.manage'), settingsRouter);
adminRouter.use('/logs', requirePermission('audit.view'), logsRouter);
adminRouter.use('/newsletter', requireAccess('newsletter.manage', 'newsletter.manage'), newsletterRouter);
adminRouter.use('/vendors', requireAccess('suppliers.view', 'suppliers.manage'), vendorsAdminRouter);
// التوصيل: صلاحيات تفصيلية داخل كل مسار
adminRouter.use('/delivery', requirePermission('orders.view', 'delivery.manage', 'collections.view'), deliveryRouter);
adminRouter.use('/tenders', requireAccess('corporate.manage', 'corporate.manage'), tendersAdminRouter);
adminRouter.use('/reports', requirePermission('reports.view'), reportsRouter);
adminRouter.use('/market', requireAccess('market.view', 'market.manage'), marketAdminRouter);
adminRouter.use('/users', requirePermission('users.manage'), usersRouter);
// إحصائيات المنصة والتميز والمكافآت والكوبونات: Super Admin فقط
adminRouter.use('/insights', requirePermission('insights.view'), insightsRouter);
