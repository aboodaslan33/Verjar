import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import type { SettingsResponse } from '../../components/admin/types';
import { AdminPage, DetailSkeleton, FieldError, Panel } from '../../components/admin/ui';
import { Alert, Button, ErrorState, Input, Tag, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { WEEKDAYS, cx } from '../../lib/format';
import type { AdminSettings } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type Key = keyof AdminSettings;
/** حدود الحقول الرقمية (نفس قيود الخادم) لعرض رسائل عربية قبل الإرسال */
const RANGES: Partial<Record<Key, [number, number, boolean?]>> = {
  inspectionFeeNormal: [0, 1_000_000],
  inspectionFeeUrgent: [0, 1_000_000],
  inspectionFeeEmergency: [0, 1_000_000],
  paintingFeeInside: [0, 1_000_000],
  paintingFeeOutside: [0, 1_000_000],
  slotMinutes: [15, 240, true],
  bookingGapHours: [0, 24],
  maxDaysAhead: [1, 365, true],
  contractReminderDays: [1, 180, true],
};

const NUMERIC: Key[] = [
  'inspectionFeeNormal',
  'inspectionFeeUrgent',
  'inspectionFeeEmergency',
  'paintingFeeInside',
  'paintingFeeOutside',
  'slotMinutes',
  'bookingGapHours',
  'maxDaysAhead',
  'contractReminderDays',
];

export default function Settings() {
  useDocumentTitle('الإعدادات');
  const q = useAdminQuery(() => api.get<SettingsResponse>('/admin/settings'), []);

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data)
    return (
      <AdminPage title="الإعدادات">
        <ErrorState message={q.error?.message ?? 'تعذر التحميل'} onRetry={q.retry} />
      </AdminPage>
    );
  return (
    <AdminPage title="الإعدادات" description="بيانات التواصل والرسوم والمواعيد ومحتوى الموقع">
      <SystemStatus system={q.data.system} />
      <SettingsForm initial={q.data.settings} onSaved={(s) => q.setData((d) => (d ? { ...d, settings: s } : d))} />
      <div className="mt-6">
        <PasswordForm />
      </div>
    </AdminPage>
  );
}

function SystemStatus({ system }: { system: SettingsResponse['system'] }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">رسائل واتساب</p>
          <Tag tone={system.whatsappMode === 'CLOUD_API' ? 'brand' : 'sand'}>
            {system.whatsappMode === 'CLOUD_API' ? 'Cloud API' : 'روابط wa.me'}
          </Tag>
        </div>
        <p className="mt-1 text-sm text-muted">
          {system.whatsappMode === 'CLOUD_API'
            ? 'تُرسل الرسائل تلقائيًا عبر WhatsApp Cloud API.'
            : 'بعد كل حجز أو طلب يفتح الموقع واتساب عند العميل برسالة جاهزة لرقمكم. للإرسال التلقائي اضبط WA_MODE=cloud مع مفاتيح Cloud API صالحة.'}
        </p>
      </div>
      <div className={cx('card p-4', !system.cloudinary && 'border-warn/50')}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">تخزين الملفات</p>
          <Tag tone={system.cloudinary ? 'brand' : 'danger'}>{system.cloudinary ? 'Cloudinary' : 'تخزين محلي'}</Tag>
        </div>
        <p className="mt-1 text-sm text-muted">
          {system.cloudinary
            ? 'الصور والملفات تُحفظ على Cloudinary.'
            : 'تنبيه: الملفات تُحفظ على خادم التطبيق وقد تُفقد عند إعادة النشر. اضبط CLOUDINARY_URL في بيئة الإنتاج.'}
        </p>
      </div>
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">البريد الإلكتروني</p>
          <Tag tone={system.email ? 'brand' : 'sand'}>{system.email ? 'مفعّل' : 'غير مفعّل'}</Tag>
        </div>
        <p className="mt-1 text-sm text-muted">
          {system.email
            ? 'النشرة البريدية ورسائل استعادة كلمة المرور تعمل.'
            : 'لتفعيل النشرة البريدية واستعادة كلمة المرور اضبط SMTP_USER و SMTP_PASS (Gmail App Password) على الخادم.'}
        </p>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      {description && <p className="-mt-1 mb-4 text-sm text-muted">{description}</p>}
      {children}
    </Panel>
  );
}

function SettingsForm({ initial, onSaved }: { initial: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const m = useMutation();
  const [local, setLocal] = useState<Record<string, string>>({});
  const [base, setBase] = useState(initial);
  const [form, setForm] = useState<Record<Key, string | number[]>>(() => toForm(initial));

  function toForm(s: AdminSettings) {
    const out = {} as Record<Key, string | number[]>;
    for (const [k, v] of Object.entries(s) as [Key, unknown][]) out[k] = Array.isArray(v) ? [...v] : String(v ?? '');
    return out;
  }

  const set = (k: Key) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const str = (k: Key) => form[k] as string;

  const changes = useMemo(() => {
    const out: Partial<Record<Key, unknown>> = {};
    for (const k of Object.keys(base) as Key[]) {
      const cur = form[k];
      if (k === 'workingDays') {
        const a = [...(cur as number[])].sort().join(',');
        const b = [...base.workingDays].sort().join(',');
        if (a !== b) out[k] = [...(cur as number[])].sort();
      } else if (NUMERIC.includes(k)) {
        if (Number(cur) !== base[k]) out[k] = (cur as string).trim() === '' ? NaN : Number(cur);
      } else if (cur !== String(base[k] ?? '')) out[k] = cur;
    }
    return out;
  }, [form, base]);
  const dirty = Object.keys(changes).length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const [k, v] of Object.entries(changes) as [Key, unknown][]) {
      const range = RANGES[k];
      if (!range || typeof v !== 'number') continue;
      const [min, max, int] = range;
      if (Number.isNaN(v)) errs[k] = 'هذا الحقل مطلوب';
      else if (v < min || v > max) errs[k] = `القيمة بين ${min} و ${max}`;
      else if (int && !Number.isInteger(v)) errs[k] = 'أدخل رقمًا صحيحًا';
    }
    if (changes.whatsappNumber !== undefined && !/^\d{8,15}$/.test(String(changes.whatsappNumber))) {
      errs.whatsappNumber = 'رقم واتساب بالصيغة الدولية بدون + (أرقام فقط)';
    }
    if (changes.workingDays !== undefined && (changes.workingDays as number[]).length === 0) errs.workingDays = 'اختر يوم عمل واحدًا على الأقل';
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const body = changes;
    const r = await m.run('save', () => api.put<AdminSettings>('/admin/settings', body), 'تم حفظ الإعدادات');
    if (r) {
      setBase(r);
      setForm(toForm(r));
      onSaved(r);
    }
  };

  const days = form.workingDays as number[];
  const toggleDay = (d: number) =>
    setForm((f) => {
      const cur = f.workingDays as number[];
      return { ...f, workingDays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] };
    });

  const fe = { ...m.fieldErrors, ...local } as Record<string, string>;
  const num = (k: Key, label: string, extra: { hint?: string; step?: string; min?: number; max?: number } = {}) => (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      className="ltr text-start"
      value={str(k)}
      onChange={set(k)}
      error={fe[k]}
      hint={extra.hint}
      step={extra.step ?? 'any'}
      min={extra.min}
      max={extra.max}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Section title="التواصل" description="تظهر في الموقع وفي رسائل واتساب">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="رقم واتساب الإدارة" dir="ltr" className="text-start" inputMode="numeric" value={str('whatsappNumber')} onChange={set('whatsappNumber')} error={fe.whatsappNumber} hint="بالصيغة الدولية بدون + — مثال 962780192930" />
          <Input label="رقم الهاتف" dir="ltr" className="text-start" value={str('phone')} onChange={set('phone')} error={fe.phone} />
          <Input label="البريد الإلكتروني" type="email" dir="ltr" className="text-start" value={str('email')} onChange={set('email')} error={fe.email} />
          <Input label="العنوان" value={str('address')} onChange={set('address')} error={fe.address} />
          <Input label="نص ساعات العمل" value={str('workingHoursText')} onChange={set('workingHoursText')} error={fe.workingHoursText} hint="كما يظهر للزوار" />
          <Input label="رابط الخريطة" dir="ltr" className="text-start" value={str('mapUrl')} onChange={set('mapUrl')} error={fe.mapUrl} placeholder="https://maps.google.com/…" />
          <Input label="إنستغرام" dir="ltr" className="text-start" value={str('instagram')} onChange={set('instagram')} error={fe.instagram} placeholder="https://instagram.com/…" />
          <Input label="فيسبوك" dir="ltr" className="text-start" value={str('facebook')} onChange={set('facebook')} error={fe.facebook} placeholder="https://facebook.com/…" />
        </div>
      </Section>

      <Section title="الرسوم" description="رسوم الكشف بالدينار الأردني">
        <p className="mb-2 text-sm font-semibold">الكشف الفني (ثابت لكل المحافظات)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {num('inspectionFeeNormal', 'عادي', { min: 0 })}
          {num('inspectionFeeUrgent', 'عاجل', { min: 0 })}
          {num('inspectionFeeEmergency', 'طارئ', { min: 0 })}
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold">الكشف على أعمال الدهان</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {num('paintingFeeInside', 'داخل عمّان', { min: 0 })}
          {num('paintingFeeOutside', 'خارج عمّان', { min: 0 })}
        </div>
        <Textarea label="ملاحظة الطلب الطارئ" rows={2} wrapperClassName="mt-4" value={str('emergencyNote')} onChange={set('emergencyNote')} error={fe.emergencyNote} />
      </Section>

      <Section title="المواعيد" description="تتحكم بالأوقات المتاحة في نموذج الحجز">
        <fieldset>
          <legend className="label">أيام العمل</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(i)}
                  className={cx(
                    'h-10 min-w-[5.5rem] rounded-xl border px-3 text-sm transition-colors',
                    on ? 'border-primary bg-primary font-semibold text-primary-fg' : 'border-line bg-surface text-muted hover:border-brand-300',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <FieldError message={fe.workingDays} />
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="بداية الدوام" type="time" className="ltr text-start" value={str('workStart')} onChange={set('workStart')} error={fe.workStart} />
          <Input label="نهاية الدوام" type="time" className="ltr text-start" value={str('workEnd')} onChange={set('workEnd')} error={fe.workEnd} />
          {num('slotMinutes', 'مدة الفترة (دقيقة)', { min: 15, max: 240, step: '1', hint: 'بين 15 و 240' })}
          {num('bookingGapHours', 'الفارق بين المواعيد (ساعة)', { min: 0, max: 24, hint: 'الافتراضي 3 ساعات' })}
          {num('maxDaysAhead', 'أقصى مدة للحجز المسبق (يوم)', { min: 1, max: 365, step: '1' })}
          {num('contractReminderDays', 'التذكير قبل انتهاء العقد (يوم)', { min: 1, max: 180, step: '1' })}
        </div>
      </Section>

      <Section title="المحتوى" description="نصوص الصفحة الرئيسية وصفحة نبذة عنا">
        <div className="space-y-4">
          <Input label="عنوان الواجهة" value={str('heroTitle')} onChange={set('heroTitle')} error={fe.heroTitle} />
          <Textarea label="النص التعريفي للواجهة" rows={2} value={str('heroSubtitle')} onChange={set('heroSubtitle')} error={fe.heroSubtitle} />
          <Input label="عنوان نبذة عنا" value={str('aboutTitle')} onChange={set('aboutTitle')} error={fe.aboutTitle} />
          <Textarea label="محتوى نبذة عنا" rows={8} value={str('aboutContent')} onChange={set('aboutContent')} error={fe.aboutContent} hint="افصل الفقرات بسطر فارغ" />
        </div>
      </Section>

      {/* شريط الحفظ */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">{dirty ? `${Object.keys(changes).length} تعديل غير محفوظ` : 'لا توجد تعديلات'}</p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => { setForm(toForm(base)); setLocal({}); m.reset(); }}>
                تراجع
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!dirty} loading={m.pending === 'save'}>
              حفظ الإعدادات
            </Button>
          </div>
        </div>
        {m.error && !Object.keys(m.fieldErrors).length && <Alert tone="error" className="mt-2">{m.error}</Alert>}
      </div>
    </form>
  );
}

function PasswordForm() {
  const m = useMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [local, setLocal] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLocal(undefined);
    if (next.length < 8) return setLocal('كلمة المرور 8 أحرف على الأقل');
    if (next !== confirm) return setLocal('كلمتا المرور غير متطابقتين');
    const r = await m.run('pw', () => api.post('/auth/admin/password', { current, next }), 'تم تغيير كلمة المرور');
    if (r) {
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  };
  return (
    <Panel title="تغيير كلمة مرور الإدارة">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-3">
        <Input label="كلمة المرور الحالية" type="password" autoComplete="current-password" dir="ltr" className="text-start" value={current} onChange={(e) => setCurrent(e.target.value)} error={m.fieldErrors.current ?? (m.error && !m.fieldErrors.next ? m.error : undefined)} />
        <Input label="كلمة المرور الجديدة" type="password" autoComplete="new-password" dir="ltr" className="text-start" value={next} onChange={(e) => setNext(e.target.value)} error={m.fieldErrors.next ?? local} hint="8 أحرف على الأقل" />
        <Input label="تأكيد كلمة المرور" type="password" autoComplete="new-password" dir="ltr" className="text-start" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div className="sm:col-span-3">
          <Button type="submit" size="sm" variant="secondary" loading={m.pending === 'pw'} disabled={!current || !next}>
            تغيير كلمة المرور
          </Button>
        </div>
      </form>
    </Panel>
  );
}
