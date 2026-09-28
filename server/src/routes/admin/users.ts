import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { DeliveryStatus, Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { asyncHandler, badRequest, conflict, notFound, ok } from '../../lib/http';
import { pageArgs, paged, paginationSchema } from '../../lib/pagination';
import { PERMISSIONS, ROLE_DEFAULTS, allowedFor, effectivePermissions, sanitizePermissions } from '../../lib/permissions';
import { prisma } from '../../lib/prisma';
import { isWeakPassword } from '../../validators/common';
import { USERNAME_RE } from '../auth';

/**
 * إدارة المستخدمين (Super Admin فقط): موظفو الإدارة ومديرو التوصيل وموظفو التوصيل.
 * موظف التوصيل له سجل سائق مرتبط (للإسناد والتحصيل والتسويات).
 */
export const usersRouter = Router();

const ROLES = ['ADMIN', 'STAFF', 'MANAGER', 'DRIVER'] as const;

const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  role: true,
  permissions: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  deletedAt: true,
  driver: { select: { id: true, status: true, areas: true } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const present = (u: Row) => ({ ...u, permissions: effectivePermissions(u.role, u.permissions) });

const passwordField = z
  .string()
  .min(8, 'كلمة المرور 8 أحرف على الأقل')
  .max(100)
  .refine((v) => !isWeakPassword(v), 'كلمة المرور سهلة التخمين، اختر كلمة أقوى');

const baseInput = z.object({
  name: z.string().trim().min(2, 'الاسم مطلوب').max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, 'اسم المستخدم: 3–32 حرفًا إنجليزيًا صغيرًا أو رقمًا ويبدأ بحرف'),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z
    .union([z.string().trim().toLowerCase().email('بريد غير صالح').max(150), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => v || null),
  role: z.enum(ROLES),
  permissions: z.array(z.string().max(60)).max(PERMISSIONS.length).optional(),
  active: z.boolean().default(true),
  /** مناطق عمل موظف التوصيل */
  areas: z.string().trim().max(300).nullable().optional(),
});

/** كتالوج الصلاحيات للواجهة: كل صلاحية، وما يسمح به كل دور، وافتراضياته */
usersRouter.get('/permissions', (_req, res) => {
  ok(res, {
    permissions: PERMISSIONS,
    roles: Object.fromEntries(ROLES.map((r) => [r, { allowed: allowedFor(r), defaults: ROLE_DEFAULTS[r] }])),
  });
});

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema
      .extend({ role: z.enum(ROLES).optional(), q: z.string().trim().max(100).optional(), active: z.enum(['true', 'false']).optional(), deleted: z.enum(['true']).optional() })
      .parse(req.query);
    const where: Prisma.UserWhereInput = {
      deletedAt: q.deleted ? { not: null } : null,
      ...(q.role ? { role: q.role } : {}),
      ...(q.active ? { active: q.active === 'true' } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { username: { contains: q.q.toLowerCase() } },
              { email: { contains: q.q.toLowerCase() } },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }], select: userSelect, ...pageArgs(q) }),
      prisma.user.count({ where }),
    ]);
    // عبء موظفي التوصيل الحالي
    const driverIds = items.map((u) => u.driver?.id).filter((x): x is string => Boolean(x));
    const load = driverIds.length
      ? await prisma.order.groupBy({
          by: ['driverId'],
          where: { driverId: { in: driverIds }, deletedAt: null, deliveryStatus: { in: ACTIVE_STATUSES } },
          _count: { _all: true },
        })
      : [];
    const byDriver = new Map(load.map((l) => [l.driverId, (l._count as { _all: number })._all]));
    ok(res, paged(items.map((u) => ({ ...present(u), activeOrders: u.driver ? byDriver.get(u.driver.id) ?? 0 : 0 })), total, q));
  }),
);

const ACTIVE_STATUSES: DeliveryStatus[] = ['PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'RESCHEDULED'];

async function assertUnique(data: { username?: string; email?: string | null }, exceptId?: string) {
  if (data.username) {
    const u = await prisma.user.findUnique({ where: { username: data.username }, select: { id: true } });
    if (u && u.id !== exceptId) throw conflict('اسم المستخدم مستخدم لحساب آخر', { field: 'username' });
  }
  if (data.email) {
    const [u, c] = await Promise.all([
      prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
      prisma.customer.findUnique({ where: { email: data.email }, select: { id: true } }),
    ]);
    if ((u && u.id !== exceptId) || c) throw conflict('هذا البريد مستخدم لحساب آخر', { field: 'email' });
  }
}

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = baseInput.extend({ password: passwordField }).parse(req.body);
    await assertUnique(input);
    const permissions = input.permissions ? sanitizePermissions(input.role, input.permissions) : ROLE_DEFAULTS[input.role];
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          phone: input.phone ?? null,
          email: input.email,
          role: input.role,
          permissions: input.role === 'ADMIN' ? [] : permissions,
          active: input.active,
          passwordHash: await bcrypt.hash(input.password, 11),
        },
      });
      if (input.role === 'DRIVER') {
        await tx.driver.create({
          data: { name: input.name, phone: input.phone ?? '', userId: u.id, areas: input.areas ?? null, status: input.active ? 'ACTIVE' : 'INACTIVE' },
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id: u.id }, select: userSelect });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'create', entity: 'user', entityId: user.id, meta: { role: user.role, username: user.username } });
    ok(res, present(user), 201);
  }),
);

/** لا يمكن إزالة آخر Super Admin فعّال (يُقفل النظام) */
async function assertNotLastAdmin(userId: string, nextRole: UserRole | undefined, nextActive: boolean | undefined, deleting = false) {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (current.role !== 'ADMIN') return;
  const losing = deleting || (nextRole && nextRole !== 'ADMIN') || nextActive === false;
  if (!losing) return;
  const others = await prisma.user.count({ where: { role: 'ADMIN', active: true, deletedAt: null, id: { not: userId } } });
  if (others === 0) throw conflict('لا يمكن إيقاف أو تغيير آخر Super Admin');
}

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = baseInput.partial().extend({ password: passwordField.optional() }).parse(req.body);
    const current = await prisma.user.findUnique({ where: { id: req.params.id }, include: { driver: true } });
    if (!current || current.deletedAt) throw notFound('المستخدم غير موجود');
    if (current.id === req.auth!.sub && (input.role && input.role !== current.role || input.active === false)) {
      throw badRequest('لا يمكنك تغيير دورك أو إيقاف حسابك بنفسك');
    }
    await assertNotLastAdmin(current.id, input.role, input.active);
    await assertUnique({ username: input.username, email: input.email ?? undefined }, current.id);
    const role = input.role ?? current.role;
    const permissions =
      role === 'ADMIN'
        ? []
        : input.permissions
          ? sanitizePermissions(role, input.permissions)
          : input.role && input.role !== current.role
            ? ROLE_DEFAULTS[role]
            : sanitizePermissions(role, current.permissions.length ? current.permissions : ROLE_DEFAULTS[role]);

    const user = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.username !== undefined ? { username: input.username } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          role,
          permissions,
          // كلمة مرور جديدة تُنهي كل جلسات المستخدم (تتغير بصمتها)
          ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 11) } : {}),
        },
      });
      const active = input.active ?? current.active;
      if (role === 'DRIVER') {
        const data = {
          name: input.name ?? current.name,
          phone: (input.phone !== undefined ? input.phone : current.phone) ?? '',
          status: active ? ('ACTIVE' as const) : ('INACTIVE' as const),
          ...(input.areas !== undefined ? { areas: input.areas } : {}),
        };
        if (current.driver) await tx.driver.update({ where: { id: current.driver.id }, data });
        else await tx.driver.create({ data: { ...data, userId: current.id } });
      } else if (current.driver) {
        // لم يعد موظف توصيل: يبقى سجل السائق للتاريخ لكن يتوقف
        await tx.driver.update({ where: { id: current.driver.id }, data: { status: 'INACTIVE' } });
      }
      return tx.user.findUniqueOrThrow({ where: { id: current.id }, select: userSelect });
    });
    await audit({
      actorId: req.auth!.sub,
      actorType: 'admin',
      action: 'update',
      entity: 'user',
      entityId: user.id,
      meta: JSON.parse(JSON.stringify({ role: [current.role, user.role], active: [current.active, user.active], passwordReset: Boolean(input.password), permissions: input.permissions ? user.permissions : undefined })),
    });
    ok(res, present(user));
  }),
);

/** حذف ناعم: يتوقف الحساب ويُحرَّر اسم المستخدم والبريد، ويبقى في السجلات والطلبات */
usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = await prisma.user.findUnique({ where: { id: req.params.id }, include: { driver: true } });
    if (!current || current.deletedAt) throw notFound('المستخدم غير موجود');
    if (current.id === req.auth!.sub) throw badRequest('لا يمكنك حذف حسابك');
    await assertNotLastAdmin(current.id, undefined, undefined, true);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: current.id }, data: { active: false, deletedAt: new Date(), username: null, email: null } });
      if (current.driver) await tx.driver.update({ where: { id: current.driver.id }, data: { status: 'INACTIVE' } });
    });
    await audit({ actorId: req.auth!.sub, actorType: 'admin', action: 'delete', entity: 'user', entityId: current.id, meta: { username: current.username, email: current.email, role: current.role } });
    ok(res, { deleted: true });
  }),
);

/** نشاط المستخدم: تغييرات حالات الطلبات، الإسنادات (لموظف التوصيل)، وسجل العمليات */
usersRouter.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    if (!user) throw notFound('المستخدم غير موجود');
    const [events, logs, delivered, failed, collected] = await Promise.all([
      prisma.orderStatusEvent.findMany({
        where: { actorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { order: { select: { id: true, code: true, number: true, customerName: true } } },
      }),
      prisma.auditLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      user.driver ? prisma.order.count({ where: { driverId: user.driver.id, deliveredAt: { not: null }, deletedAt: null } }) : 0,
      user.driver
        ? prisma.order.count({ where: { driverId: user.driver.id, deletedAt: null, deliveryStatus: { in: ['DELIVERY_FAILED', 'CUSTOMER_NOT_AVAILABLE', 'CUSTOMER_REFUSED', 'WRONG_ADDRESS'] } } })
        : 0,
      prisma.order.aggregate({ where: { collectedById: user.id, deletedAt: null }, _sum: { codCollected: true }, _count: { _all: true } }),
    ]);
    ok(res, {
      user: present(user),
      stats: { delivered, failed, collectedOrders: collected._count._all, collectedAmount: Number(collected._sum.codCollected ?? 0) },
      events,
      logs,
    });
  }),
);
