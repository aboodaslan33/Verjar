import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** خطأ HTTP برسالة عربية تُعرض للمستخدم */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'يجب تسجيل الدخول') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'لا تملك صلاحية الوصول') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'العنصر غير موجود') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, 'CONFLICT', details);
export const tooMany = (msg: string) => new HttpError(429, msg, 'TOO_MANY_REQUESTS');

/** استجابة موحّدة { ok, data, error } */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data, error: null });
}

export function asyncHandler<P = Record<string, string>>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler<P> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
