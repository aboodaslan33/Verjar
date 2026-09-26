import { z } from 'zod';
import { env } from '../config/env';
import { badRequest } from '../lib/http';
import { prisma } from '../lib/prisma';

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

/** رابط https فقط (أو فارغ) — يمنع روابط javascript: وما شابه في الصفحات العامة */
const httpsUrl = (msg: string, hosts?: RegExp) =>
  z
    .string()
    .trim()
    .max(2000)
    .refine((v) => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.protocol === 'https:' && (!hosts || hosts.test(u.hostname));
      } catch {
        return false;
      }
    }, msg);

export const settingsSchema = z.object({
  whatsappNumber: z.string().regex(/^\d{8,15}$/, 'رقم واتساب بالصيغة الدولية بدون +'),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email('بريد غير صالح').max(150),
  address: z.string().trim().min(2).max(300),
  inspectionFeeInside: z.number().min(0),
  inspectionFeeOutside: z.number().min(0),
  emergencyFeeInside: z.number().min(0),
  emergencyFeeOutside: z.number().min(0),
  emergencyNote: z.string().max(1000),
  /** أيام العمل: 0 = الأحد … 6 = السبت */
  workingDays: z.array(z.number().int().min(0).max(6)),
  workStart: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  workEnd: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  slotMinutes: z.number().int().min(15).max(240),
  bookingGapHours: z.number().min(0).max(24),
  maxDaysAhead: z.number().int().min(1).max(365),
  contractReminderDays: z.number().int().min(1).max(180),
  aboutTitle: z.string().max(200),
  aboutContent: z.string().max(10000),
  heroTitle: z.string().max(200),
  heroSubtitle: z.string().max(500),
  /** يُعرض داخل iframe في صفحة التواصل — خرائط Google فقط */
  mapUrl: httpsUrl('رابط الخريطة يجب أن يكون رابط تضمين من خرائط Google يبدأ بـ https://', /^(www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$/),
  workingHoursText: z.string().max(200),
  instagram: httpsUrl('رابط إنستغرام يجب أن يبدأ بـ https://'),
  facebook: httpsUrl('رابط فيسبوك يجب أن يبدأ بـ https://'),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  whatsappNumber: env.ADMIN_WHATSAPP,
  phone: '0780192930',
  email: 'farjarweb@gmail.com',
  address: 'عمّان — الأردن',
  inspectionFeeInside: 15,
  inspectionFeeOutside: 25,
  emergencyFeeInside: 30,
  emergencyFeeOutside: 45,
  emergencyNote: 'الطلب الطارئ يُجدول بأولوية خلال نفس اليوم إن أمكن، ورسومه أعلى من الكشف العادي.',
  workingDays: [0, 1, 2, 3, 4, 6],
  workStart: '08:00',
  workEnd: '18:00',
  slotMinutes: 60,
  bookingGapHours: 3,
  maxDaysAhead: 60,
  contractReminderDays: 30,
  aboutTitle: 'فرجار قروب للمقاولات والصيانة',
  aboutContent:
    'نحن فريق أردني يعمل في البناء والصيانة والدهان والأعمال المعدنية. نزور الموقع، نكشف على المشكلة، ونعطيك سعرًا مكتوبًا قبل أن نبدأ.\n\nنعمل مع البيوت والشقق والفلل، ومع المصانع والشركات بعقود صيانة سنوية تشمل المرافق والكهرباء والأرضيات الإيبوكسي ومتطلبات GMP وISO.\n\nكل عمل نستلمه يكون له مسؤول واحد يتابعه معك من الكشف حتى التسليم، وتقدر تشوف حالة طلبك وعروض الأسعار من صفحتك على الموقع.',
  heroTitle: 'صيانة وبناء ودهان في عمّان وكل المحافظات',
  heroSubtitle: 'احجز كشفًا على موقعك، واستلم سعرًا واضحًا قبل البدء. فنيّون معروفون، ومواعيد نلتزم بها.',
  mapUrl: '',
  workingHoursText: 'السبت – الخميس، 8 صباحًا – 6 مساءً',
  instagram: '',
  facebook: '',
};

let cache: { value: Settings; at: number } | null = null;
const TTL = 30_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await prisma.setting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = settingsSchema.shape as Record<string, z.ZodTypeAny>;
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    // كل حقل يُتحقق منه على حدة: قيمة قديمة غير صالحة تُستبدل بالافتراضية دون إسقاط باقي الإعدادات
    const field = shape[r.key].safeParse(r.value);
    if (field.success) merged[r.key] = field.data;
    else console.warn(`[settings] تم تجاهل قيمة غير صالحة للإعداد ${r.key}`);
  }
  const parsed = settingsSchema.safeParse(merged);
  const value = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  if (next.workStart >= next.workEnd) throw badRequest('نهاية الدوام يجب أن تكون بعد بدايته', { field: 'workEnd' });
  if (next.workingDays.length === 0) throw badRequest('اختر يوم عمل واحدًا على الأقل', { field: 'workingDays' });
  await prisma.$transaction(
    Object.keys(patch).map((key) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: next[key as keyof Settings] as never },
        update: { value: next[key as keyof Settings] as never },
      }),
    ),
  );
  cache = null;
  return getSettings();
}

export function invalidateSettingsCache() {
  cache = null;
}

/** الإعدادات التي يجوز عرضها للزوار */
export function publicSettings(s: Settings) {
  return {
    whatsappNumber: s.whatsappNumber,
    phone: s.phone,
    email: s.email,
    address: s.address,
    inspectionFeeInside: s.inspectionFeeInside,
    inspectionFeeOutside: s.inspectionFeeOutside,
    emergencyFeeInside: s.emergencyFeeInside,
    emergencyFeeOutside: s.emergencyFeeOutside,
    emergencyNote: s.emergencyNote,
    workingDays: s.workingDays,
    workStart: s.workStart,
    workEnd: s.workEnd,
    bookingGapHours: s.bookingGapHours,
    maxDaysAhead: s.maxDaysAhead,
    aboutTitle: s.aboutTitle,
    aboutContent: s.aboutContent,
    heroTitle: s.heroTitle,
    heroSubtitle: s.heroSubtitle,
    mapUrl: s.mapUrl,
    workingHoursText: s.workingHoursText,
    instagram: s.instagram,
    facebook: s.facebook,
  };
}
