import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { HttpError, forbidden, unauthorized } from '../lib/http';
import { prisma } from '../lib/prisma';

export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
export type AuthPayload = { sub: string; role: Role; name: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/** كوكي الجلسة الموحّدة (عميل أو أدمن) */
export const SESSION_COOKIE = 'vj_session';
/** كوكيز الإصدار السابق — تُقرأ مرة واحدة ثم تُستبدل بـ vj_session */
export const ADMIN_COOKIE = 'vj_admin';
export const CUSTOMER_COOKIE = 'vj_customer';

export const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 يومًا
/** تُجدَّد الجلسة تلقائيًا إذا مضى على إصدارها أكثر من يوم */
const REFRESH_AFTER_S = 60 * 60 * 24;

export const isAdminRole = (role: Role) => role === 'ADMIN' || role === 'STAFF';

function cookieOptions(maxAgeS: number) {
  return {
    httpOnly: true,
    secure: env.isProd || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    maxAge: maxAgeS * 1000,
    path: '/',
  } as const;
}

export function setAuthCookie(res: Response, payload: AuthPayload) {
  const token = jwt.sign({ sub: payload.sub, role: payload.role, name: payload.name }, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_S,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_S));
}

export function clearAuthCookie(res: Response) {
  const { maxAge: _m, ...opts } = cookieOptions(0);
  for (const name of [SESSION_COOKIE, ADMIN_COOKIE, CUSTOMER_COOKIE]) res.clearCookie(name, opts);
}

type Decoded = AuthPayload & { iat: number; exp: number };

function verify(token: string | undefined): Decoded | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as Decoded;
    return p && typeof p.sub === 'string' && ['ADMIN', 'STAFF', 'CUSTOMER'].includes(p.role) ? p : null;
  } catch {
    return null;
  }
}

/** يتأكد أن صاحب الجلسة ما زال موجودًا ومفعّلًا، ويعيد بياناته الحالية */
export async function loadPrincipal(p: Pick<AuthPayload, 'sub' | 'role'>): Promise<AuthPayload | null> {
  if (p.role === 'CUSTOMER') {
    const c = await prisma.customer.findUnique({ where: { id: p.sub }, select: { id: true, name: true, deletedAt: true } });
    return c && !c.deletedAt ? { sub: c.id, role: 'CUSTOMER', name: c.name } : null;
  }
  const u = await prisma.user.findUnique({ where: { id: p.sub }, select: { id: true, name: true, role: true, active: true } });
  return u && u.active ? { sub: u.id, role: u.role, name: u.name } : null;
}

/**
 * يقرأ الجلسة من الكوكي (إن وُجدت) ويضعها في req.auth — لا يرفض الطلب أبدًا.
 * التجديد التلقائي: بعد يوم من إصدار التوكن يُتحقق من الحساب ويُصدر توكن جديد لمدة 30 يومًا.
 */
export async function attachSession(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = req.cookies ?? {};
    let p = verify(cookies[SESSION_COOKIE]);
    let legacy = false;
    if (!p) {
      p = verify(cookies[ADMIN_COOKIE]) ?? verify(cookies[CUSTOMER_COOKIE]);
      legacy = Boolean(p);
    }
    if (!p) {
      if (cookies[SESSION_COOKIE] || cookies[ADMIN_COOKIE] || cookies[CUSTOMER_COOKIE]) clearAuthCookie(res);
      return next();
    }
    const age = Math.floor(Date.now() / 1000) - p.iat;
    if (legacy || age > REFRESH_AFTER_S) {
      const fresh = await loadPrincipal(p);
      if (!fresh) {
        clearAuthCookie(res);
        return next();
      }
      if (legacy) clearAuthCookie(res);
      setAuthCookie(res, fresh);
      req.auth = fresh;
    } else {
      req.auth = { sub: p.sub, role: p.role, name: p.name };
    }
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

/** لوحة التحكم: الأدمن والموظفون فقط، مع التأكد أن الحساب ما زال مفعّلًا */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) return next(unauthorized());
    if (!isAdminRole(req.auth.role)) return next(forbidden('هذه الصفحة للإدارة فقط'));
    const fresh = await loadPrincipal(req.auth);
    if (!fresh) {
      clearAuthCookie(res);
      return next(new HttpError(401, 'انتهت الجلسة أو تم إيقاف الحساب، سجّل الدخول مجددًا', 'UNAUTHORIZED'));
    }
    req.auth = fresh;
    next();
  } catch (e) {
    next(e);
  }
}

/** صفحات العميل: كل عميل يرى بياناته فقط (req.auth.sub = معرّف العميل) */
export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) return next(unauthorized());
    if (req.auth.role !== 'CUSTOMER') return next(forbidden('هذه الصفحة لحسابات العملاء'));
    const fresh = await loadPrincipal(req.auth);
    if (!fresh) {
      clearAuthCookie(res);
      return next(new HttpError(401, 'انتهت الجلسة، سجّل الدخول مجددًا', 'UNAUTHORIZED'));
    }
    req.auth = fresh;
    next();
  } catch (e) {
    next(e);
  }
}
