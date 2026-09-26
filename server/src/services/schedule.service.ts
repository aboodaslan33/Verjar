import type { Prisma } from '@prisma/client';
import { badRequest, conflict } from '../lib/http';
import { prisma } from '../lib/prisma';
import { ammanParts, ammanToUtc, minutesToTime, timeToMinutes, weekdayOf } from '../lib/time';
import { getSettings, type Settings } from './settings.service';

export type Slot = { time: string; available: boolean; reason?: 'past' | 'booked' };

const HOUR = 3600_000;
/** أقل مهلة قبل الموعد */
const MIN_LEAD_MS = 60 * 60_000;

function dayRangeUtc(date: string) {
  const start = ammanToUtc(date, '00:00');
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start, end: ammanToUtc(next, '00:00') };
}

function slotTimes(s: Settings): string[] {
  const out: string[] = [];
  const start = timeToMinutes(s.workStart);
  const end = timeToMinutes(s.workEnd);
  for (let t = start; t < end; t += s.slotMinutes) out.push(minutesToTime(t));
  return out;
}

function daysBetween(fromDate: string, toDate: string) {
  const a = Date.UTC(...(fromDate.split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(toDate.split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400_000);
}

/** الأوقات المتاحة في يوم معيّن (الأوقات المحجوزة تظهر معطّلة) */
export async function getDaySlots(date: string, excludeBookingId?: string) {
  const s = await getSettings();
  const today = ammanParts(new Date()).date;
  const weekday = weekdayOf(date);
  const ahead = daysBetween(today, date);

  if (!s.workingDays.includes(weekday)) {
    return { date, open: false, reason: 'closed' as const, gapHours: s.bookingGapHours, slots: [] as Slot[] };
  }
  if (ahead < 0 || ahead > s.maxDaysAhead) {
    return { date, open: false, reason: 'out_of_range' as const, gapHours: s.bookingGapHours, slots: [] as Slot[] };
  }

  const gapMs = s.bookingGapHours * HOUR;
  const { start, end } = dayRangeUtc(date);
  const booked = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
      scheduledAt: { gt: new Date(start.getTime() - gapMs), lt: new Date(end.getTime() + gapMs) },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { scheduledAt: true },
  });

  const now = Date.now();
  const slots: Slot[] = slotTimes(s).map((time) => {
    const at = ammanToUtc(date, time).getTime();
    if (at - now < MIN_LEAD_MS) return { time, available: false, reason: 'past' };
    const clash = booked.some((b) => Math.abs(b.scheduledAt.getTime() - at) < gapMs);
    return clash ? { time, available: false, reason: 'booked' } : { time, available: true };
  });

  return { date, open: true, reason: null, gapHours: s.bookingGapHours, slots };
}

/**
 * يتحقق أن الموعد صالح ومتاح داخل معاملة.
 * يستخدم قفلًا استشاريًا لمنع حجزين متزامنين لنفس الفترة.
 */
export async function assertSlotAvailable(
  tx: Prisma.TransactionClient,
  date: string,
  time: string,
  opts: { excludeBookingId?: string; skipHoursCheck?: boolean } = {},
): Promise<Date> {
  const s = await getSettings();
  const scheduledAt = ammanToUtc(date, time);

  if (!opts.skipHoursCheck) {
    if (!s.workingDays.includes(weekdayOf(date))) throw badRequest('هذا اليوم ليس من أيام العمل');
    const t = timeToMinutes(time);
    if (t < timeToMinutes(s.workStart) || t >= timeToMinutes(s.workEnd)) {
      throw badRequest(`الوقت خارج ساعات العمل (${s.workStart} – ${s.workEnd})`);
    }
    if (!slotTimes(s).includes(time)) throw badRequest('اختر وقتًا من الأوقات المعروضة');
    if (scheduledAt.getTime() - Date.now() < MIN_LEAD_MS) throw badRequest('لا يمكن الحجز في وقت مضى أو خلال الساعة القادمة');
    const ahead = daysBetween(ammanParts(new Date()).date, date);
    if (ahead > s.maxDaysAhead) throw badRequest(`الحجز متاح حتى ${s.maxDaysAhead} يومًا مقدمًا فقط`);
  }

  // قفل على مستوى المعاملة — يُحرّر تلقائيًا عند نهايتها
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(727001)');

  const gapMs = s.bookingGapHours * HOUR;
  const clash = await tx.booking.findFirst({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
      scheduledAt: { gt: new Date(scheduledAt.getTime() - gapMs), lt: new Date(scheduledAt.getTime() + gapMs) },
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw conflict(
      `هذا الموعد لم يعد متاحًا — يجب أن يفصل ${s.bookingGapHours} ساعات على الأقل بين المواعيد. اختر وقتًا آخر.`,
      { field: 'time' },
    );
  }
  return scheduledAt;
}

export type UrgencyValue = 'NORMAL' | 'URGENT' | 'EMERGENCY';
export type ZoneValue = 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN';

/**
 * رسوم الكشف وقت الحجز:
 * - الكشف الفني (أعطال البناء): ثابتة لكل المحافظات حسب الأولوية (عادي / عاجل / طارئ)
 * - أعمال الدهان: حسب المنطقة (داخل / خارج عمّان)
 * - باقي الأنواع: بدون رسوم كشف (السعر بعد الزيارة)
 */
export function bookingFee(
  s: Settings,
  b: { type: string; urgency?: UrgencyValue; zone?: ZoneValue | null },
): number | null {
  if (b.type === 'INSPECTION') {
    if (b.urgency === 'EMERGENCY') return s.inspectionFeeEmergency;
    if (b.urgency === 'URGENT') return s.inspectionFeeUrgent;
    return s.inspectionFeeNormal;
  }
  if (b.type === 'PAINTING' && b.zone) return b.zone === 'INSIDE_AMMAN' ? s.paintingFeeInside : s.paintingFeeOutside;
  return null;
}
