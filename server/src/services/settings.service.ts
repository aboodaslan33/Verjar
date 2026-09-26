import { z } from 'zod';
import { env } from '../config/env';
import { badRequest } from '../lib/http';
import { prisma } from '../lib/prisma';

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

export const settingsSchema = z.object({
  whatsappNumber: z.string().regex(/^\d{8,15}$/, 'رقم واتساب بالصيغة الدولية بدون +'),
  phone: z.string().min(5),
  email: z.string().email('بريد غير صالح'),
  address: z.string().min(2),
  inspectionFeeInside: z.number().min(0),
  inspectionFeeOutside: z.number().min(0),
  emergencyFeeInside: z.number().min(0),
  emergencyFeeOutside: z.number().min(0),
  emergencyNote: z.string(),
  /** أيام العمل: 0 = الأحد … 6 = السبت */
  workingDays: z.array(z.number().int().min(0).max(6)),
  workStart: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  workEnd: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  slotMinutes: z.number().int().min(15).max(240),
  bookingGapHours: z.number().min(0).max(24),
  maxDaysAhead: z.number().int().min(1).max(365),
  contractReminderDays: z.number().int().min(1).max(180),
  aboutTitle: z.string(),
  aboutContent: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  mapUrl: z.string(),
  workingHoursText: z.string(),
  instagram: z.string(),
  facebook: z.string(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  whatsappNumber: env.ADMIN_WHATSAPP,
  phone: '0780192930',
  email: 'info@verjar.jo',
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
  aboutTitle: 'فيرجار للمقاولات والصيانة',
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
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
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
