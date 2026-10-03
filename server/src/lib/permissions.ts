import type { UserRole } from '@prisma/client';

/**
 * الصلاحيات (RBAC): قائمة ثابتة في الكود (تتطور مع الإصدارات)، ولكل مستخدم قائمته الفعلية
 * في قاعدة البيانات (User.permissions) يحددها الـ Super Admin، وتبدأ من صلاحيات دوره.
 * الـ Super Admin (ADMIN) يملك كل الصلاحيات دائمًا.
 */
export const PERMISSIONS = [
  'dashboard.view',
  'users.manage',
  'orders.view',
  'orders.manage',
  'orders.assign',
  'orders.editAmounts',
  'delivery.manage',
  'collections.view',
  'collections.settle',
  'proofs.edit',
  'customers.view',
  'customers.manage',
  'suppliers.view',
  'suppliers.manage',
  'catalog.manage',
  'market.view',
  'market.manage',
  'market.finance',
  'bookings.manage',
  'corporate.manage',
  'payments.view',
  'payments.manage',
  'reports.view',
  'settings.manage',
  'newsletter.manage',
  'audit.view',
  'driver.app',
  /** إحصائيات المنصة الشهرية ونمو المنصة (Super Admin فقط) */
  'insights.view',
  /** التميز الشهري والمكافآت والكوبونات (Super Admin فقط) */
  'rewards.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

/** صلاحيات لا تُمنح إلا للـ Super Admin (منع رفع الصلاحيات) */
const SUPER_ONLY: Permission[] = ['users.manage', 'insights.view', 'rewards.manage'];

/** ما يمكن منحه لكل دور (الحد الأقصى) */
const ALLOWED: Record<UserRole, Permission[]> = {
  ADMIN: ALL,
  STAFF: ALL.filter((p) => !SUPER_ONLY.includes(p) && p !== 'driver.app'),
  MANAGER: ALL.filter((p) => !SUPER_ONLY.includes(p) && p !== 'driver.app'),
  DRIVER: ['driver.app'],
};

/** الصلاحيات الافتراضية عند إنشاء مستخدم بهذا الدور */
export const ROLE_DEFAULTS: Record<UserRole, Permission[]> = {
  ADMIN: ALL,
  // موظف الإدارة: كل شيء عدا إدارة المستخدمين (كما كان يعمل قبل نظام الصلاحيات)
  STAFF: ALLOWED.STAFF,
  MANAGER: [
    'dashboard.view',
    'orders.view',
    'orders.manage',
    'orders.assign',
    'delivery.manage',
    'collections.view',
    'collections.settle',
    'customers.view',
    'suppliers.view',
    'market.view',
    'reports.view',
  ],
  DRIVER: ['driver.app'],
};

export function allowedFor(role: UserRole): Permission[] {
  return ALLOWED[role];
}

/** يقصر القائمة المطلوبة على ما يسمح به الدور ويزيل التكرار والقيم غير المعروفة */
export function sanitizePermissions(role: UserRole, list: string[]): Permission[] {
  const allowed = new Set(ALLOWED[role]);
  return [...new Set(list)].filter((p): p is Permission => allowed.has(p as Permission));
}

/** الصلاحيات الفعلية: الـ Super Admin كل شيء؛ القائمة الفارغة (حسابات قديمة) = صلاحيات الدور الافتراضية */
export function effectivePermissions(role: UserRole, stored: string[]): Permission[] {
  if (role === 'ADMIN') return ALL;
  if (!stored.length) return ROLE_DEFAULTS[role];
  return sanitizePermissions(role, stored);
}

/** أدوار لوحة التحكم (الإدارة) — موظف التوصيل له لوحته الخاصة */
export const STAFF_ROLES: UserRole[] = ['ADMIN', 'STAFF', 'MANAGER'];
