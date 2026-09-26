import type { RequestStatus } from '@prisma/client';
import { z } from 'zod';

export const statusEnum = z.enum(['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

export const idParam = z.object({ id: z.string().min(1) });

export const moneyInput = z.coerce.number().min(0, 'المبلغ لا يمكن أن يكون سالبًا').max(10_000_000);

/** تحويل مدخل تاريخ (YYYY-MM-DD) إلى نطاق */
export const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // حماية من حقن الصيغ في Excel (اسم عميل مثل =HYPERLINK(...)): تُعامل كنص. الأرقام السالبة تبقى أرقامًا
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM حتى يفتح Excel الملف بترميز UTF-8 بشكل صحيح
  return '﻿' + [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export type StatusValue = RequestStatus;
