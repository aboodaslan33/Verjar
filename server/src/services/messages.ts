import type { Booking, CorporateRequest, CorporateService, Order, OrderItem } from '@prisma/client';
import {
  BOOKING_TYPE_AR,
  CORPORATE_TYPE_AR,
  DETAIL_LABELS,
  PRODUCTION_IMPACT_AR,
  STATUS_AR,
  URGENCY_LEVEL_AR,
  formatDetailValue,
} from '../lib/labels';
import { env } from '../config/env';
import { formatJOD, toNum } from '../lib/money';
import { displayPhone } from '../lib/phone';
import { formatAmman } from '../lib/time';

const BRAND = 'مجموعة فرجا';

function mapLink(lat?: number | null, lng?: number | null) {
  return lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;
}

/** رسالة الطلب من المتجر — بنفس الصيغة المعتمدة */
export function orderMessage(order: Order & { items: OrderItem[] }): string {
  const lines: string[] = [];
  lines.push(`طلب جديد #${order.number} — ${BRAND}`);
  lines.push(`العميل: ${order.customerName}  الهاتف: ${displayPhone(order.phone)}`);
  lines.push(`العنوان: ${order.address}`);
  lines.push('المنتجات:');
  for (const it of order.items) {
    const disc = it.discountPercent > 0 ? ` (بعد خصم ${it.discountPercent}%)` : '';
    lines.push(`- ${it.name} × ${it.quantity} = ${formatJOD(it.lineTotal)}${disc}`);
  }
  lines.push(`المجموع قبل الخصم: ${formatJOD(order.subtotal)}`);
  if (toNum(order.discountTotal) > 0) lines.push(`الخصم: ${formatJOD(order.discountTotal)}`);
  lines.push(`الإجمالي: ${formatJOD(order.total)}`);
  if (order.notes) lines.push(`ملاحظات: ${order.notes}`);
  lines.push(`المرجع: ${order.ref}`);
  return lines.join('\n');
}

export function bookingMessage(b: Booking, mediaCount = 0): string {
  const lines: string[] = [];
  const urgent = b.urgency === 'EMERGENCY' ? ' — طارئ' : b.urgency === 'URGENT' ? ' — عاجل' : '';
  lines.push(`حجز جديد #${b.number} — ${BOOKING_TYPE_AR[b.type]}${urgent}`);
  lines.push(`العميل: ${b.name}  الهاتف: ${displayPhone(b.phone)}`);
  lines.push(`الموعد: ${formatAmman(b.scheduledAt)}`);
  lines.push(`الموقع: ${b.locationText}${b.floor ? ` — الطابق ${b.floor}` : ''}`);
  const map = mapLink(b.lat, b.lng);
  if (map) lines.push(`الخريطة: ${map}`);
  if (b.zone) lines.push(`المنطقة: ${b.zone === 'INSIDE_AMMAN' ? 'داخل عمّان' : 'خارج عمّان'}`);
  const details = (b.details ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${DETAIL_LABELS[k] ?? k}: ${formatDetailValue(k, v)}`);
  }
  if (b.inspectionFee != null) lines.push(`رسوم الكشف: ${formatJOD(b.inspectionFee)}`);
  if (mediaCount > 0) lines.push(`مرفقات: ${mediaCount} ملف (تظهر في لوحة التحكم)`);
  if (b.notes) lines.push(`ملاحظات: ${b.notes}`);
  lines.push(`المرجع: ${b.ref}`);
  return lines.join('\n');
}

export function corporateMessage(r: CorporateRequest & { services: CorporateService[] }): string {
  const lines: string[] = [];
  lines.push(`طلب شركة #${r.number} — ${CORPORATE_TYPE_AR[r.type]}`);
  lines.push(`الشركة: ${r.companyName}`);
  lines.push(`المسؤول: ${r.contactName}`);
  lines.push(`هاتف المدير: ${displayPhone(r.managerPhone)}  |  مسؤول الصيانة: ${displayPhone(r.maintenancePhone)}`);
  lines.push(`الموقع: ${r.locationText}`);
  const map = mapLink(r.lat, r.lng);
  if (map) lines.push(`الخريطة: ${map}`);
  lines.push('الخدمات المطلوبة:');
  for (const s of r.services) lines.push(`- ${s.name}`);
  if (r.type === 'URGENT') {
    if (r.workLocation) lines.push(`موقع العمل: ${r.workLocation}`);
    if (r.productionImpact) lines.push(`الإنتاج: ${PRODUCTION_IMPACT_AR[r.productionImpact]}`);
    if (r.productionLineAffected != null) lines.push(`خط إنتاج متأثر: ${r.productionLineAffected ? 'نعم' : 'لا'}`);
    if (r.urgencyLevel) lines.push(`درجة الاستعجال: ${URGENCY_LEVEL_AR[r.urgencyLevel]}`);
  }
  const files = [r.commercialRegisterUrl && 'السجل التجاري', r.licenseUrl && 'رخصة الشركة'].filter(Boolean);
  if (files.length) lines.push(`المرفقات: ${files.join('، ')}`);
  if (r.notes) lines.push(`ملاحظات: ${r.notes}`);
  lines.push(`المرجع: ${r.ref}`);
  return lines.join('\n');
}

export function statusMessage(kind: string, number: number, status: keyof typeof STATUS_AR, name: string): string {
  return `مرحبًا ${name}،\nتم تحديث حالة ${kind} رقم #${number} لدى ${BRAND} إلى: ${STATUS_AR[status]}.\nتقدر تتابع التفاصيل من حسابك: ${env.siteUrl}/account`;
}

export function quoteFileMessage(name: string, title: string, url: string, amount?: number | null): string {
  const lines = [`مرحبًا ${name}،`, `رفعنا لك ملفًا جديدًا في حسابك لدى ${BRAND}: ${title}`];
  if (amount != null) lines.push(`المبلغ: ${formatJOD(amount)}`);
  lines.push(`رابط الملف: ${url}`);
  lines.push('لأي استفسار ردّ على هذه الرسالة.');
  return lines.join('\n');
}

export function customerConfirmationMessage(kind: string, number: number, ref: string, name: string): string {
  return `مرحبًا ${name}،\nوصلنا ${kind} رقم #${number} (المرجع ${ref}). سنتواصل معك لتأكيد التفاصيل.\n— ${BRAND}`;
}

export function contractReminderMessage(companyName: string, number: number, endDate: Date, days: number): string {
  return `تذكير: عقد الصيانة #${number} مع ${companyName} ينتهي بتاريخ ${endDate.toISOString().slice(0, 10)} (بعد ${days} يوم). يُنصح بالتواصل للتجديد.`;
}
