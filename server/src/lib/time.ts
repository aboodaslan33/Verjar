/** أدوات التوقيت — كل المواعيد تُحسب بتوقيت عمّان */
export const TZ = 'Asia/Amman';

function tzOffsetMinutes(date: Date, timeZone = TZ): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** يحوّل تاريخ ووقت محلي في عمّان (YYYY-MM-DD, HH:mm) إلى Date بتوقيت UTC */
export function ammanToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const off = tzOffsetMinutes(guess);
  const result = new Date(guess.getTime() - off * 60000);
  // تصحيح نادر عند تغيير التوقيت
  const off2 = tzOffsetMinutes(result);
  return off2 === off ? result : new Date(guess.getTime() - off2 * 60000);
}

/** أجزاء التاريخ بتوقيت عمّان */
export function ammanParts(date: Date): { date: string; time: string; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: weekdays[p.weekday] };
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** تنسيق الموعد بالعربية: الثلاثاء 2026-09-29 الساعة 10:00 */
export function formatAmman(date: Date): string {
  const p = ammanParts(date);
  return `${WEEKDAYS_AR[p.weekday]} ${p.date} الساعة ${p.time}`;
}
