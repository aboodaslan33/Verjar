import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/http';

export type AuthPayload = { sub: string; role: 'ADMIN' | 'STAFF' | 'CUSTOMER'; name: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export const ADMIN_COOKIE = 'vj_admin';
export const CUSTOMER_COOKIE = 'vj_customer';

const ADMIN_TTL_S = 60 * 60 * 12; // 12 ساعة
const CUSTOMER_TTL_S = 60 * 60 * 24 * 30; // 30 يومًا

export function signToken(payload: AuthPayload, ttlSeconds: number) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ttlSeconds });
}

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
  const isCustomer = payload.role === 'CUSTOMER';
  const ttl = isCustomer ? CUSTOMER_TTL_S : ADMIN_TTL_S;
  res.cookie(isCustomer ? CUSTOMER_COOKIE : ADMIN_COOKIE, signToken(payload, ttl), cookieOptions(ttl));
}

export function clearAuthCookie(res: Response, kind: 'admin' | 'customer') {
  const { maxAge: _m, ...opts } = cookieOptions(0);
  res.clearCookie(kind === 'admin' ? ADMIN_COOKIE : CUSTOMER_COOKIE, opts);
}

function readToken(req: Request, cookie: string): AuthPayload | null {
  const token = req.cookies?.[cookie];
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const p = readToken(req, ADMIN_COOKIE);
  if (!p) return next(unauthorized());
  if (p.role !== 'ADMIN' && p.role !== 'STAFF') return next(forbidden());
  req.auth = p;
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  const p = readToken(req, CUSTOMER_COOKIE);
  if (!p || p.role !== 'CUSTOMER') return next(unauthorized());
  req.auth = p;
  next();
}
