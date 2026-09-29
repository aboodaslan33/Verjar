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
  /** رسوم الكشف الفني — ثابتة لكل المحافظات حسب الأولوية */
  inspectionFeeNormal: z.number().min(0),
  inspectionFeeUrgent: z.number().min(0),
  inspectionFeeEmergency: z.number().min(0),
  /** رسوم الكشف على أعمال الدهان حسب المنطقة */
  paintingFeeInside: z.number().min(0),
  paintingFeeOutside: z.number().min(0),
  emergencyNote: z.string().max(1000),
  /** أيام العمل: 0 = الأحد … 6 = السبت */
  workingDays: z.array(z.number().int().min(0).max(6)),
  workStart: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  workEnd: z.string().regex(timeRe, 'صيغة الوقت HH:mm'),
  slotMinutes: z.number().int().min(15).max(240),
  bookingGapHours: z.number().min(0).max(24),
  maxDaysAhead: z.number().int().min(1).max(365),
  contractReminderDays: z.number().int().min(1).max(180),
  /** عمولة المنصة من العطاءات المُرسّاة (نسبة مئوية) */
  tenderCommissionPercent: z.number().min(0).max(100),
  /** أجرة التوصيل الافتراضية لطلبات الموردين (تعدّلها الإدارة لكل طلب) */
  deliveryFeeDefault: z.number().min(0).max(1000),
  /** إلزام رمز التحقق (OTP) عند التسليم */
  deliveryOtpRequired: z.boolean(),
  /** إلزام صورة إثبات التسليم */
  deliveryPhotoRequired: z.boolean(),
  // ── السوق الصناعي ──
  /** نموذج الإيراد الحالي: Leads فقط، عمولة على الصفقات، أو دفع إلكتروني + عمولة (يتغير بدون برمجة) */
  marketRevenueMode: z.enum(['LEAD', 'COMMISSION', 'ONLINE_PAYMENT']),
  /** رسوم الـ Lead العادي والكبير على المورد (0 = مجاني) */
  leadFeeStandard: z.number().min(0).max(10_000),
  leadFeeLarge: z.number().min(0).max(10_000),
  /** قيمة الصفقة المتوقعة التي يُعتبر فوقها الـ Lead كبيرًا */
  leadLargeThreshold: z.number().min(0).max(100_000_000),
  /** تفعيل تحصيل رسوم الـ Leads (عند الإيقاف تُسجَّل القيمة ولا تُحمَّل) */
  leadFeesEnabled: z.boolean(),
  /** إرسال الطلب تلقائيًا للموردين المقترحين */
  rfqAutoDistribute: z.boolean(),
  /** عدد الموردين لكل طلب عرض سعر */
  rfqSuppliersPerRequest: z.number().int().min(1).max(50),
  /** مورد جديد يحتاج موافقة الإدارة قبل الظهور */
  supplierApprovalRequired: z.boolean(),
  /** إخفاء بيانات التواصل بين العميل والمورد حتى قبول العرض */
  hideContactsUntilAward: z.boolean(),
  /** التذكير قبل انتهاء الاشتراك (أيام) */
  subscriptionReminderDays: z.number().int().min(1).max(60),
  // ── الدفع اليدوي (اشتراكات وإعلانات الموردين) ──
  /** اسم البنك الذي يُحوَّل إليه */
  paymentBankName: z.string().trim().max(80),
  /** اسم صاحب الحساب */
  paymentAccountName: z.string().trim().max(120),
  /** رقم أو اسم CliQ (Alias) */
  paymentCliq: z.string().trim().max(60),
  /** رقم الحساب أو IBAN (اختياري) */
  paymentIban: z.string().trim().max(60),
  /** تعليمات إضافية تظهر للمورد في صفحة الدفع */
  paymentInstructions: z.string().trim().max(1000),
  /** سياسة الحجز: كل سطر بند مستقل (تظهر في آخر خطوة من الحجز وفي صفحة السياسات) */
  bookingPolicy: z.string().trim().min(20, 'اكتب بنود سياسة الحجز').max(6000),
  /** سياسة الطلب والتوصيل للمتجر */
  storePolicy: z.string().trim().min(20, 'اكتب بنود سياسة الطلب').max(6000),
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
  inspectionFeeNormal: 25,
  inspectionFeeUrgent: 50,
  inspectionFeeEmergency: 70,
  paintingFeeInside: 15,
  paintingFeeOutside: 25,
  emergencyNote: 'الطلب الطارئ يُجدول بأولوية خلال نفس اليوم إن أمكن، ورسومه أعلى من الكشف العادي.',
  workingDays: [0, 1, 2, 3, 4, 6],
  workStart: '08:00',
  workEnd: '18:00',
  slotMinutes: 60,
  bookingGapHours: 3,
  maxDaysAhead: 60,
  contractReminderDays: 30,
  tenderCommissionPercent: 10,
  deliveryFeeDefault: 3,
  deliveryOtpRequired: false,
  deliveryPhotoRequired: false,
  marketRevenueMode: 'LEAD',
  leadFeeStandard: 3,
  leadFeeLarge: 15,
  leadLargeThreshold: 5000,
  leadFeesEnabled: false,
  rfqAutoDistribute: true,
  rfqSuppliersPerRequest: 5,
  supplierApprovalRequired: true,
  hideContactsUntilAward: true,
  subscriptionReminderDays: 7,
  paymentBankName: 'بنك الاتحاد',
  paymentAccountName: 'طارق',
  paymentCliq: '0780192930',
  paymentIban: '',
  paymentInstructions: 'حوّل المبلغ عبر CliQ أو تحويل بنكي واكتب رقم الفاتورة في ملاحظة التحويل، ثم ارفع صورة أو PDF لإيصال الدفع. تُفعَّل الخدمة بعد تأكيد الإدارة.',
  bookingPolicy: 'مواعيد الزيارة: بعد إرسال الحجز نتواصل معك لتأكيد الموعد، وقد نقترح وقتًا بديلًا إذا تعذّر الموعد المختار.\nرسوم الكشف: تُدفع للفني نقدًا عند الزيارة، وتغطي الزيارة والتشخيص فقط، وتختلف حسب نوع الطلب (عادي، عاجل، طارئ).\nعرض السعر: بعد الكشف تستلم عرض سعر مكتوبًا بالمواد ومدة التنفيذ، ولا يبدأ أي عمل ولا تُطلب أي دفعة قبل موافقتك عليه.\nالتعديل والإلغاء: لتغيير الموعد أو إلغائه أبلغنا في أقرب وقت قبل الموعد عبر واتساب أو الهاتف أو من صفحتك في الموقع.\nالتواجد في الموقع: يلزم وجود شخص بالغ في الموقع وقت الزيارة وتسهيل الوصول، وإذا تعذّر الدخول نتواصل معك لإعادة الجدولة.\nالصور والملفات: تُستخدم لتقييم العمل فقط، ولا ننشرها دون إذنك.\nبياناتك: نستخدم رقمك وموقعك للتواصل معك وتنفيذ الزيارة فقط، ولا نشاركها مع أي جهة خارجية.',
  storePolicy: 'تأكيد الطلب: بعد إرسال الطلب نتواصل معك لتأكيده وتحديد موعد التوصيل.\nالأسعار: الأسعار المعروضة بالدينار الأردني، وأجرة التوصيل تظهر قبل تأكيد الطلب.\nالدفع: عند الاستلام أو بالطرق المعروضة عند إتمام الطلب، ويُسجَّل المبلغ المدفوع على طلبك.\nالاستلام: افحص المنتج عند الاستلام، وأبلغ موظف التوصيل أو تواصل معنا فورًا عند وجود أي ضرر أو نقص.\nالإلغاء: يمكن إلغاء الطلب قبل خروجه للتوصيل بالتواصل معنا.\nالمنتجات المصنوعة حسب الطلب أو القياس لا تُسترجع بعد بدء تصنيعها إلا في حال وجود عيب.',
  aboutTitle: 'مجموعة فرجار للتصميم والمقاولات والصيانة',
  aboutContent:
    'نحن فريق أردني يعمل في البناء والصيانة والدهان والأعمال المعدنية. نزور الموقع، نكشف على المشكلة، ونعطيك سعرًا مكتوبًا قبل أن نبدأ.\n\nنعمل مع البيوت والشقق والفلل، ومع المصانع والشركات بعقود صيانة سنوية تشمل المرافق والكهرباء والأرضيات الإيبوكسي ومتطلبات GMP وISO.\n\nكل عمل نستلمه يكون له مسؤول واحد يتابعه معك من الكشف حتى التسليم، وتقدر تشوف حالة طلبك وعروض الأسعار من صفحتك على الموقع.',
  heroTitle: 'منتجات صناعية وصيانة ماكينات ومقاولات',
  heroSubtitle: 'نورّد المنتجات والتجهيزات الصناعية، ونصون الماكينات وخطوط الإنتاج بعقود سنوية أو عند العطل، ونكمل معك أعمال البناء والصيانة في عمّان وكل المحافظات.',
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
    deliveryFeeDefault: s.deliveryFeeDefault,
    phone: s.phone,
    email: s.email,
    address: s.address,
    inspectionFeeNormal: s.inspectionFeeNormal,
    inspectionFeeUrgent: s.inspectionFeeUrgent,
    inspectionFeeEmergency: s.inspectionFeeEmergency,
    paintingFeeInside: s.paintingFeeInside,
    paintingFeeOutside: s.paintingFeeOutside,
    emergencyNote: s.emergencyNote,
    workingDays: s.workingDays,
    workStart: s.workStart,
    workEnd: s.workEnd,
    bookingGapHours: s.bookingGapHours,
    maxDaysAhead: s.maxDaysAhead,
    bookingPolicy: s.bookingPolicy,
    storePolicy: s.storePolicy,
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
