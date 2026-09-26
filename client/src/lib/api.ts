/** عميل الـ API — كل الاستجابات بالشكل { ok, data, error } */

const BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    /** أخطاء الحقول: { "details.area": "المساحة مطلوبة" } */
    public fields: Record<string, string> = {},
    public details?: unknown,
  ) {
    super(message);
  }
  /** الحقل المرتبط بالخطأ إن وُجد (من details.field) */
  get field(): string | undefined {
    const d = this.details as { field?: string } | undefined;
    return d?.field;
  }
}

type Envelope<T> = { ok: boolean; data: T; error: null | { code: string; message: string; fields?: Record<string, string>; details?: unknown } };

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.', 0, 'NETWORK');
  }
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // استجابة غير JSON
  }
  if (!res.ok || !json?.ok) {
    const e = json?.error;
    throw new ApiError(
      e?.message ?? (res.status >= 500 ? 'حدث خطأ في الخادم، حاول بعد قليل' : 'تعذر تنفيذ الطلب'),
      res.status,
      e?.code ?? 'ERROR',
      e?.fields ?? {},
      e?.details,
    );
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined | null>, init?: RequestInit) => {
    const qs = params
      ? '?' +
        new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)]),
        ).toString()
      : '';
    return request<T>('GET', path + (qs === '?' ? '' : qs), undefined, init);
  },
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** رابط مباشر (لتحميل CSV أو EventSource) */
  url: (path: string) => `${BASE}${path}`,
};

/** يبني FormData من كائن JSON + ملفات: الحقل data يحمل JSON */
export function toFormData(data: unknown, files: Record<string, File[] | File | null | undefined> = {}) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(data));
  for (const [name, value] of Object.entries(files)) {
    if (!value) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const f of list) fd.append(name, f);
  }
  return fd;
}
