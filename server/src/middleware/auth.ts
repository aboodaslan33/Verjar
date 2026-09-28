import { createHmac } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/http';
import { prisma } from '../lib/prisma';
import { effectivePermissions, type Permission } from '../lib/permissions';

export type Role = 'ADMIN' | 'STAFF' | 'MANAGER' | 'DRIVER' | 'CUSTOMER';
export type AuthPayload = { sub: string; role: Role; name: string };
/** الجلسة بعد التحقق: صلاحيات المستخدم تُقرأ من قاعدة البيانات مع كل طلب (السحب يسري فورًا) */
export type SessionAuth = AuthPayload & { perms: Permission[] };

/** متجر المورد صاحب الجلسة (يُضبط في requireVendor) */
export type VendorContext = { id: string; name: string; slug: string; commissionPercent: number };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: SessionAuth;
      vendor?: VendorContext;
      /** موظف التوصيل صاحب الجلسة (يُضبط في requireDriver) */
      driver?: { id: string; name: string };
    }
  }
}

/** كوكي الجلسة الموحّدة (عميل أو أدمن) */
export const SESSION_COOKIE = 'vj_session';
/** كوكيز الإصدار الأول — لم تعد مقبولة، تُمسح فقط عند الخروج أو عند وجودها */
const LEGACY_COOKIES = ['vj_admin', 'vj_customer'];

export const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 يومًا
/** تُجدَّد الجلسة تلقائيًا إذا مضى على إصدارها أكثر من يوم */
const REFRESH_AFTER_S = 60 * 60 * 24;

/** أدوار لوحة التحكم (موظف التوصيل له لوحته الخاصة /driver) */
export const isAdminRole = (role: Role) => role === 'ADMIN' || role === 'STAFF' || role === 'MANAGER';
const ROLES: Role[] = ['ADMIN', 'STAFF', 'MANAGER', 'DRIVER', 'CUSTOMER'];

function cookieOptions(maxAgeS: number) {
  return {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    maxAge: maxAgeS * 1000,
    path: '/',
  } as const;
}

/**
 * بصمة كلمة المرور داخل التوكن: عند تغيير كلمة المرور أو إعادة تعيينها
 * تتغير البصمة فتُلغى كل الجلسات الأخرى فورًا.
 */
export function passwordFingerprint(passwordHash: string | null | undefined) {
  return createHmac('sha256', env.JWT_SECRET).update(`pv:${passwordHash ?? ''}`).digest('base64url').slice(0, 16);
}

/** صاحب الجلسة كما في قاعدة البيانات */
export type Principal = AuthPayload & { pv: string; perms: Permission[] };

type UserRow = { id: string; name: string; passwordHash: string; role: Exclude<Role, 'CUSTOMER'>; permissions?: string[] };
type CustomerRow = { id: string; name: string; passwordHash: string | null; role?: undefined };

export function principalOf(row: UserRow | CustomerRow): Principal {
  if (row.role) {
    return { sub: row.id, role: row.role, name: row.name, pv: passwordFingerprint(row.passwordHash), perms: effectivePermissions(row.role, row.permissions ?? []) };
  }
  return { sub: row.id, role: 'CUSTOMER', name: row.name, pv: passwordFingerprint(row.passwordHash), perms: [] };
}

export function sessionToken(p: Principal) {
  return jwt.sign({ sub: p.sub, role: p.role, name: p.name, pv: p.pv }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_S,
  });
}

export function setAuthCookie(res: Response, p: Principal) {
  res.cookie(SESSION_COOKIE, sessionToken(p), cookieOptions(SESSION_TTL_S));
}

export function clearAuthCookie(res: Response) {
  const { maxAge: _m, ...opts } = cookieOptions(0);
  for (const name of [SESSION_COOKIE, ...LEGACY_COOKIES]) res.clearCookie(name, opts);
}

type Decoded = AuthPayload & { pv?: string; iat: number; exp: number };

function verify(token: string | undefined): Decoded | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as Decoded;
    return p && typeof p.sub === 'string' && ROLES.includes(p.role) ? p : null;
  } catch {
    return null;
  }
}

/** يتأكد أن صاحب الجلسة ما زال موجودًا ومفعّلًا، ويعيد بياناته الحالية */
export async function loadPrincipal(p: Pick<AuthPayload, 'sub' | 'role'>): Promise<Principal | null> {
  if (p.role === 'CUSTOMER') {
    const c = await prisma.customer.findUnique({
      where: { id: p.sub },
      select: { id: true, name: true, passwordHash: true, deletedAt: true },
    });
    return c && !c.deletedAt ? principalOf(c) : null;
  }
  const u = await prisma.user.findUnique({
    where: { id: p.sub },
    select: { id: true, name: true, role: true, active: true, passwordHash: true, permissions: true, deletedAt: true },
  });
  return u && u.active && !u.deletedAt ? principalOf(u) : null;
}

/**
 * يقرأ الجلسة من الكوكي (إن وُجدت) ويضعها في req.auth — لا يرفض الطلب أبدًا.
 * - يتحقق من الحساب في قاعدة البيانات مع كل طلب: الحساب المحذوف أو الموقوف أو الذي تغيّرت كلمة مروره تنتهي جلسته فورًا
 * - التجديد التلقائي: بعد يوم من إصدار التوكن يُصدر توكن جديد لمدة 30 يومًا
 */
export async function attachSession(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = req.cookies ?? {};
    // تطبيقات الجوال (لاحقًا) ترسل التوكن في ترويسة Authorization بدل الكوكي
    const bearer = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const viaBearer = !cookies[SESSION_COOKIE] && Boolean(bearer);
    const p = verify(viaBearer ? bearer : cookies[SESSION_COOKIE]);
    if (!p) {
      if (cookies[SESSION_COOKIE] || LEGACY_COOKIES.some((c) => cookies[c])) clearAuthCookie(res);
      return next();
    }
    const fresh = await loadPrincipal(p);
    if (!fresh || fresh.role !== p.role || p.pv !== fresh.pv) {
      clearAuthCookie(res);
      return next();
    }
    const age = Math.floor(Date.now() / 1000) - p.iat;
    if (!viaBearer && (age > REFRESH_AFTER_S || fresh.name !== p.name)) setAuthCookie(res, fresh);
    req.auth = { sub: fresh.sub, role: fresh.role, name: fresh.name, perms: fresh.perms };
    next();
  } catch (e) {
    next(e);
  }
}

/** أي مستخدم مسجّل (عميل أو أدمن) */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

/** يتطلب إحدى الصلاحيات المذكورة (الـ Super Admin يملكها كلها) */
export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!perms.some((p) => req.auth!.perms.includes(p))) return next(forbidden('لا تملك صلاحية لهذا الإجراء'));
    next();
  };
}

/**
 * صلاحية قراءة وكتابة لمسار كامل: GET/HEAD تتطلب صلاحية العرض أو الإدارة، وباقي الطلبات صلاحية الإدارة.
 */
export function requireAccess(view: Permission, manage: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    const read = req.method === 'GET' || req.method === 'HEAD';
    const ok = read ? req.auth.perms.includes(view) || req.auth.perms.includes(manage) : req.auth.perms.includes(manage);
    if (!ok) return next(forbidden('لا تملك صلاحية لهذا الإجراء'));
    next();
  };
}

/** موظف التوصيل: حساب بدور DRIVER مرتبط بسجل سائق فعّال */
export async function requireDriver(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) return next(unauthorized());
    if (req.auth.role !== 'DRIVER' || !req.auth.perms.includes('driver.app')) return next(forbidden('هذه الصفحة لموظفي التوصيل'));
    const d = await prisma.driver.findFirst({ where: { userId: req.auth.sub, status: 'ACTIVE' }, select: { id: true, name: true } });
    if (!d) return next(forbidden('حساب التوصيل غير مفعّل'));
    req.driver = d;
    next();
  } catch (e) {
    next(e);
  }
}

/** لوحة التحكم: الأدمن والموظفون فقط (الحساب تم التحقق منه في attachSession) */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (!isAdminRole(req.auth.role)) return next(forbidden('هذه الصفحة للإدارة فقط'));
  next();
}

/** صفحات العميل: كل عميل يرى بياناته فقط (req.auth.sub = معرّف العميل) */
export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'CUSTOMER') return next(forbidden('هذه الصفحة لحسابات العملاء'));
  next();
}

/**
 * لوحة المورد: عميل لديه صلاحية مورد فعّالة. تُقرأ من قاعدة البيانات مع كل طلب،
 * فسحب الصلاحية يسري فورًا. كل استعلامات اللوحة تُقيَّد بـ req.vendor.id.
 */
export async function requireVendor(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) return next(unauthorized());
    if (req.auth.role !== 'CUSTOMER') return next(forbidden('لوحة الموردين لحسابات الموردين فقط'));
    const v = await prisma.vendor.findFirst({
      where: { customerId: req.auth.sub, active: true },
      select: { id: true, name: true, slug: true, commissionPercent: true },
    });
    if (!v) return next(forbidden('حسابك ليس لديه صلاحية مورد'));
    req.vendor = { id: v.id, name: v.name, slug: v.slug, commissionPercent: v.commissionPercent.toNumber() };
    next();
  } catch (e) {
    next(e);
  }
}
