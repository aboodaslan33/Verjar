import { env } from '../config/env';
import { ammanParts } from '../lib/time';
import { getSettings } from './settings.service';

/**
 * قوالب البريد الخدمي بهوية فرجار: ترويسة فحمية بالشعار، خط كهرماني، بطاقة بيضاء، وتذييل بطرق التواصل.
 * مكتوبة بجداول وأنماط مضمّنة لتظهر بشكل صحيح في Gmail وOutlook وApple Mail وتطبيقات الجوال.
 */

const C = {
  charcoal: '#262627',
  amber: '#F1A428',
  amberSoft: '#FEF7EA',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  page: '#F4F4F5',
};

const FONT = "Tahoma,'Segoe UI',Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** رابط الشعار (PNG لأن أغلب برامج البريد لا تعرض SVG). يمكن تغييره بـ EMAIL_LOGO_URL */
export const logoUrl = () => process.env.EMAIL_LOGO_URL || `${env.siteUrl}/email/logo-light.png`;

type LayoutInput = {
  /** عنوان الصفحة (يظهر في بعض البرامج) */
  title: string;
  /** سطر المعاينة في صندوق الوارد */
  preheader: string;
  /** محتوى البطاقة (HTML آمن — المدخلات تُهرَّب قبل تمريرها) */
  body: string;
  /** سطر صغير فوق التذييل (سبب وصول الرسالة) */
  reason?: string;
};

/** الإطار العام لكل رسائل البريد الخدمية */
export async function emailLayout({ title, preheader, body, reason }: LayoutInput) {
  const s = await getSettings();
  const brand = env.MAIL_FROM_NAME;
  const site = env.siteUrl;
  const contact = [
    s.phone && `<a href="tel:${esc(s.phone)}" style="color:${C.muted};text-decoration:none" dir="ltr">${esc(s.phone)}</a>`,
    s.whatsappNumber && `<a href="https://wa.me/${esc(s.whatsappNumber)}" style="color:${C.muted};text-decoration:none">واتساب</a>`,
    s.email && `<a href="mailto:${esc(s.email)}" style="color:${C.muted};text-decoration:none" dir="ltr">${esc(s.email)}</a>`,
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <!-- الترويسة -->
      <tr><td align="center" style="background:${C.charcoal};border-radius:18px 18px 0 0;padding:26px 24px 22px">
        <a href="${esc(site)}" style="text-decoration:none"><img src="${esc(logoUrl())}" width="176" height="54" alt="${esc(brand)}" style="display:block;border:0;width:176px;height:auto;color:#FFFFFF;font-size:20px;font-weight:700"></a>
      </td></tr>
      <tr><td style="background:${C.amber};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
      <!-- المحتوى -->
      <tr><td dir="rtl" style="background:#FFFFFF;padding:32px 28px 28px;text-align:right;border-left:1px solid ${C.line};border-right:1px solid ${C.line}">
        ${body}
      </td></tr>
      <!-- التذييل -->
      <tr><td dir="rtl" style="background:#FAFAFA;border:1px solid ${C.line};border-top:0;border-radius:0 0 18px 18px;padding:20px 28px;text-align:center;font-size:12px;line-height:1.9;color:${C.muted}">
        <div style="font-weight:700;color:${C.ink};font-size:13px">${esc(brand)} · Farjar Group</div>
        ${contact ? `<div>${contact}</div>` : ''}
        <div><a href="${esc(site)}" style="color:${C.muted}" dir="ltr">${esc(site.replace(/^https?:\/\//, ''))}</a></div>
        ${reason ? `<div style="margin-top:8px;color:#9CA3AF">${esc(reason)}</div>` : ''}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ───────────── رمز التحقق (OTP) ─────────────

export type OtpPurposeKey = 'LOGIN_2FA' | 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'SENSITIVE_ACTION';

const OTP_COPY: Record<OtpPurposeKey, { subject: string; title: string; intro: string }> = {
  LOGIN_2FA: {
    subject: 'رمز تسجيل الدخول',
    title: 'رمز تسجيل الدخول',
    intro: 'استخدم الرمز التالي لإكمال تسجيل الدخول إلى حسابك.',
  },
  VERIFY_EMAIL: {
    subject: 'تأكيد بريدك الإلكتروني',
    title: 'تأكيد بريدك الإلكتروني',
    intro: 'أدخل الرمز التالي في الموقع لتأكيد أن هذا البريد يخصّك.',
  },
  PASSWORD_RESET: {
    subject: 'رمز إعادة تعيين كلمة المرور',
    title: 'إعادة تعيين كلمة المرور',
    intro: 'وصلنا طلب لتغيير كلمة مرور حسابك. استخدم الرمز التالي للمتابعة.',
  },
  SENSITIVE_ACTION: {
    subject: 'تأكيد عملية على حسابك',
    title: 'تأكيد العملية',
    intro: 'استخدم الرمز التالي لتأكيد العملية التي طلبتها على حسابك.',
  },
};

export type OtpEmailInput = {
  name: string;
  code: string;
  purpose: OtpPurposeKey;
  minutes: number;
  /** تفاصيل الطلب لتنبيه صاحب الحساب إن لم يكن هو من طلب الرمز */
  requestedAt?: Date;
  ip?: string | null;
};

export async function renderOtpEmail(i: OtpEmailInput) {
  const copy = OTP_COPY[i.purpose];
  const brand = env.MAIL_FROM_NAME;
  const when = i.requestedAt ? ammanParts(i.requestedAt) : null;
  const firstName = i.name.trim().split(/\s+/)[0] || i.name;

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${C.amber};letter-spacing:.3px">${esc(copy.title)}</p>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.5;color:${C.ink}">مرحبًا ${esc(firstName)}،</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.9;color:#374151">${esc(copy.intro)}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px">
      <tr><td align="center" style="background:${C.amberSoft};border:1px dashed ${C.amber};border-radius:14px;padding:20px 12px">
        <div style="font-size:12px;color:${C.muted};margin-bottom:6px">رمز التحقق</div>
        <div dir="ltr" style="font-family:'Courier New',Consolas,monospace;font-size:36px;line-height:1.2;font-weight:700;letter-spacing:10px;color:${C.charcoal};padding-left:10px">${esc(i.code)}</div>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:13px;color:${C.muted};text-align:center">الرمز صالح لمدة <b style="color:${C.ink}">${i.minutes} دقائق</b> ولمرة واحدة فقط.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line}">
      <tr><td style="padding-top:18px;font-size:13px;line-height:1.9;color:#4B5563">
        <b style="color:${C.ink}">🔒 للحفاظ على أمان حسابك</b><br>
        لا تشارك هذا الرمز مع أي شخص. فريق ${esc(brand)} لن يطلب منك الرمز أبدًا عبر الهاتف أو واتساب.<br>
        إذا لم تطلب هذا الرمز، تجاهل الرسالة — لن يتمكن أحد من استخدام حسابك دونه.
        ${
          when
            ? `<div style="margin-top:12px;padding:10px 12px;background:#F9FAFB;border-radius:10px;font-size:12px;color:${C.muted}">
                 وقت الطلب: <span dir="ltr">${esc(when.date)} ${esc(when.time)}</span> (توقيت عمّان)${i.ip ? `<br>من الجهاز صاحب العنوان <span dir="ltr">${esc(i.ip)}</span>` : ''}
               </div>`
            : ''
        }
      </td></tr>
    </table>`;

  const html = await emailLayout({
    title: copy.subject,
    preheader: `رمزك: ${i.code} — صالح ${i.minutes} دقائق. لا تشاركه مع أحد.`,
    body,
    reason: 'رسالة أمان تلقائية مرتبطة بحسابك، ولا تتأثر بإلغاء الاشتراك في النشرة.',
  });
  const text = [
    `مرحبًا ${firstName}،`,
    '',
    copy.intro,
    '',
    `رمز التحقق: ${i.code}`,
    `صالح لمدة ${i.minutes} دقائق ولمرة واحدة فقط.`,
    '',
    `لا تشارك هذا الرمز مع أي شخص. فريق ${brand} لن يطلبه منك أبدًا.`,
    'إذا لم تطلب هذا الرمز، تجاهل الرسالة.',
    when ? `\nوقت الطلب: ${when.date} ${when.time} (توقيت عمّان)${i.ip ? ` · IP: ${i.ip}` : ''}` : '',
    '',
    `— ${brand}`,
    env.siteUrl,
  ].join('\n');
  return { subject: `${copy.subject} — ${brand}`, html, text };
}

// ───────────── إعادة تعيين كلمة المرور (رابط) ─────────────

export async function renderPasswordResetEmail(name: string, url: string) {
  const brand = env.MAIL_FROM_NAME;
  const firstName = name.trim().split(/\s+/)[0] || name;
  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${C.amber}">إعادة تعيين كلمة المرور</p>
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.5;color:${C.ink}">مرحبًا ${esc(firstName)}،</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.9;color:#374151">وصلنا طلب لتغيير كلمة مرور حسابك في ${esc(brand)}. اضغط الزر لتعيين كلمة مرور جديدة. الرابط صالح لمدة ساعة واحدة ولمرة واحدة.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
      <td style="background:${C.amber};border-radius:12px"><a href="${esc(url)}" style="display:inline-block;padding:14px 26px;color:${C.charcoal};font-weight:700;font-size:15px;text-decoration:none">تعيين كلمة مرور جديدة</a></td>
    </tr></table>
    <p style="margin:0;font-size:13px;line-height:1.9;color:${C.muted};border-top:1px solid ${C.line};padding-top:16px">إذا لم تطلب ذلك تجاهل هذه الرسالة، وكلمة مرورك الحالية تبقى كما هي.</p>`;
  const html = await emailLayout({ title: 'إعادة تعيين كلمة المرور', preheader: 'رابط تعيين كلمة مرور جديدة — صالح لساعة واحدة.', body, reason: 'رسالة أمان تلقائية مرتبطة بحسابك.' });
  const text = `مرحبًا ${firstName}،\nلتعيين كلمة مرور جديدة لحسابك في ${brand} افتح الرابط (صالح لساعة واحدة):\n${url}\n\nإذا لم تطلب ذلك تجاهل هذه الرسالة.`;
  return { subject: `إعادة تعيين كلمة المرور — ${brand}`, html, text };
}
