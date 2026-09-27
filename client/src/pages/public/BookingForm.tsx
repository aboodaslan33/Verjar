import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FilePicker } from '../../components/forms/FilePicker';
import { ReviewSection, StepActions, StepHeading, SubmissionSuccess, YES_NO } from '../../components/forms/FormBits';
import { LocationPicker } from '../../components/forms/LocationPicker';
import { SlotPicker, longDate } from '../../components/forms/SlotPicker';
import {
  checkInt,
  checkOptionalText,
  checkPositive,
  checkText,
  clearDraft,
  focusFirstError,
  loadDraft,
  localKey,
  toNum,
  useDraftSaver,
} from '../../components/forms/formUtils';
import { Alert, ButtonLink, ChoiceGroup, Input, Stepper, Textarea } from '../../components/ui';
import { AccountNote, useAccountPrefill } from '../../components/forms/AccountPrefill';
import { useSite } from '../../context/SiteContext';
import { ApiError, api, toFormData } from '../../lib/api';
import {
  BOOKING_TYPE_LABEL,
  BOOKING_TYPE_SLUG,
  DETAIL_LABELS,
  cx,
  formatDate,
  formatDetail,
  formatJOD,
  formatSlot,
  isValidPhone,
} from '../../lib/format';
import type { BookingCreated, BookingType, SiteSettings } from '../../lib/types';
import { prepareWhatsAppWindow } from '../../lib/whatsapp';
import { useDocumentTitle } from '../../lib/useAsync';

// ───────────── الثوابت ─────────────

const OTHER = 'أخرى';
const FAULTS = ['تسريب مياه / رطوبة', 'تشققات', 'كهرباء', 'سباكة', 'عزل أسطح', OTHER];
const PAINTS = ['بلاستيك', 'زيتي', 'شمواه', 'جوتن', 'ناشونال', 'لم أحدد — أحتاج نصيحة', OTHER];
const WORKS = ['أبواب', 'بوابات', 'درابزين', 'مظلات', 'هناجر', 'شبابيك وحمايات', OTHER];

const INTRO: Record<BookingType, string> = {
  INSPECTION: 'صف العطل قدر الإمكان وأرفق صورًا إن وُجدت، حتى يصل الفني ومعه ما يلزم.',
  PAINTING: 'المساحة وعدد الغرف تكفي لإعطائك تقديرًا أوليًا، والسعر النهائي بعد الزيارة.',
  CONSTRUCTION: 'نحتاج مساحة الأرض والبناء المطلوب وموقع الأرض على الخريطة. إن كان لديك مخطط أو تصميم ارفعه هنا.',
  METALWORK: 'حدد نوع العمل والقياسات التقريبية والعدد. التصميم أو الصورة المرجعية تساعدنا كثيرًا.',
  GENERAL: 'اكتب ما تحتاجه باختصار وأرفق صورًا إن أمكن.',
};

const STEPS = ['التفاصيل', 'الموقع', 'الموعد', 'المراجعة'];

const STEP_KEYS: string[][] = [
  [
    'faultType', 'description', 'zone', 'urgency',
    'paintType', 'jobKind', 'rooms', 'area', 'colors', 'decorations',
    'buildingType', 'landArea', 'buildArea', 'floors', 'tiles',
    'workType', 'dimensions', 'quantity',
    'hasDesign', 'designFiles', 'photos',
  ],
  ['name', 'phone', 'locationText', 'floor', 'lat'],
  ['time', 'notes'],
  [],
];

function stepOf(key: string): number {
  if (key === 'date' || key === 'time') return 2;
  if (key === 'lng') return 1;
  const i = STEP_KEYS.findIndex((ks) => ks.includes(key));
  return i === -1 ? 3 : i;
}

type Vals = {
  name: string;
  phone: string;
  locationText: string;
  floor: string;
  lat: number | null;
  lng: number | null;
  date: string;
  time: string;
  notes: string;
  zone: '' | 'INSIDE_AMMAN' | 'OUTSIDE_AMMAN';
  urgency: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  faultChoice: string;
  faultOther: string;
  description: string;
  paintChoice: string;
  paintOther: string;
  jobKind: '' | 'NEW' | 'RENEW';
  rooms: string;
  area: string;
  colors: string;
  decorations: boolean | null;
  tiles: boolean | null;
  buildingType: '' | 'HOUSE' | 'APARTMENT' | 'VILLA' | 'COMMERCIAL';
  landArea: string;
  buildArea: string;
  floors: string;
  hasDesign: boolean | null;
  workChoice: string;
  workOther: string;
  dimensions: string;
  quantity: string;
};

const EMPTY: Vals = {
  name: '', phone: '', locationText: '', floor: '', lat: null, lng: null, date: '', time: '', notes: '',
  zone: '', urgency: 'NORMAL', faultChoice: '', faultOther: '', description: '',
  paintChoice: '', paintOther: '', jobKind: '', rooms: '', area: '', colors: '', decorations: null,
  tiles: null, buildingType: '', landArea: '', buildArea: '', floors: '', hasDesign: null,
  workChoice: '', workOther: '', dimensions: '', quantity: '',
};

/** مفتاح الخطأ المرتبط بكل حقل قيمة */
const ERROR_KEY: Partial<Record<keyof Vals, string>> = {
  faultChoice: 'faultType', faultOther: 'faultType',
  paintChoice: 'paintType', paintOther: 'paintType',
  workChoice: 'workType', workOther: 'workType',
  date: 'time', lng: 'lat',
};

const pick = (choice: string, other: string) => (choice === OTHER ? other.trim() : choice);

/** مطابق لحساب السيرفر (bookingFee) */
function computeFee(type: BookingType, v: Vals, s: SiteSettings): number | null {
  if (type === 'INSPECTION') {
    if (v.urgency === 'EMERGENCY') return s.inspectionFeeEmergency;
    if (v.urgency === 'URGENT') return s.inspectionFeeUrgent;
    return s.inspectionFeeNormal;
  }
  if (type === 'PAINTING' && v.zone) return v.zone === 'INSIDE_AMMAN' ? s.paintingFeeInside : s.paintingFeeOutside;
  return null;
}

const URGENCY_AR = { NORMAL: 'عادي', URGENT: 'عاجل', EMERGENCY: 'طارئ' } as const;

// ───────────── التحقق (مطابق لقواعد السيرفر) ─────────────

function validate(type: BookingType, v: Vals, photos: File[], designFiles: File[]) {
  const e: Record<string, string | undefined> = {};
  const choiceText = (label: string, choice: string, other: string) =>
    !choice ? `اختر ${label}` : choice === OTHER ? checkText(label, other, 100) : undefined;

  if (type === 'INSPECTION') {
    e.faultType = choiceText('نوع العطل', v.faultChoice, v.faultOther);
    e.description = checkText('وصف العطل', v.description, 2000);
  }
  if (type === 'PAINTING') {
    e.zone = v.zone ? undefined : 'حدد إن كان الموقع داخل عمّان أو خارجها';
    e.paintType = choiceText('نوعية الدهان', v.paintChoice, v.paintOther);
    e.jobKind = v.jobKind ? undefined : 'اختر دهان جديد أم تجديد';
    e.rooms = checkInt('عدد الغرف', v.rooms, 100);
    e.area = checkPositive('المساحة', v.area);
    e.colors = checkOptionalText('الألوان', v.colors, 300);
    e.decorations = v.decorations == null ? 'اختر نعم أو لا' : undefined;
  }
  if (type === 'CONSTRUCTION') {
    e.buildingType = v.buildingType ? undefined : 'اختر نوع البناء';
    e.landArea = checkPositive('مساحة الأرض', v.landArea);
    e.buildArea = checkPositive('مساحة البناء', v.buildArea);
    e.floors = checkInt('عدد الطوابق', v.floors, 50);
    e.tiles = v.tiles == null ? 'اختر نعم أو لا' : undefined;
    e.lat = v.lat == null || v.lng == null ? 'حدد موقع الأرض من زر "استخدم موقعي الحالي" أو من الخريطة' : undefined;
  }
  if (type === 'METALWORK') {
    e.workType = choiceText('نوع العمل', v.workChoice, v.workOther);
    e.dimensions = checkText('المساحات والقياسات', v.dimensions, 500);
    e.quantity = checkInt('العدد المطلوب', v.quantity, 10000);
  }
  if (type === 'GENERAL') {
    e.description = checkText('وصف الطلب', v.description, 2000);
  }
  if (type === 'CONSTRUCTION' || type === 'METALWORK') {
    e.hasDesign = v.hasDesign == null ? 'اختر نعم أو لا' : undefined;
    e.designFiles = v.hasDesign && designFiles.length === 0 ? 'ارفع ملف التصميم أو اختر "لا"' : undefined;
  }
  if (photos.length > 5) e.photos = 'الحد الأقصى 5 صور';

  e.name = checkText('الاسم', v.name, 100, 2);
  e.phone = !v.phone.trim() ? 'رقم الهاتف مطلوب' : isValidPhone(v.phone) ? undefined : 'رقم الهاتف غير صحيح (مثال: 0791234567)';
  e.locationText = checkText('مكان الموقع', v.locationText, 300);
  e.floor = checkOptionalText('رقم الطابق', v.floor, 30);
  e.time = !v.date ? 'اختر اليوم' : !v.time ? 'اختر وقت الزيارة' : undefined;
  e.notes = checkOptionalText('الملاحظات', v.notes, 2000);
  return e;
}

function buildDetails(type: BookingType, v: Vals) {
  switch (type) {
    case 'INSPECTION':
      return { faultType: pick(v.faultChoice, v.faultOther), description: v.description.trim() };
    case 'PAINTING':
      return {
        paintType: pick(v.paintChoice, v.paintOther),
        jobKind: v.jobKind,
        rooms: toNum(v.rooms),
        area: toNum(v.area),
        colors: v.colors.trim() || undefined,
        decorations: v.decorations,
      };
    case 'CONSTRUCTION':
      return {
        tiles: v.tiles,
        buildingType: v.buildingType,
        landArea: toNum(v.landArea),
        buildArea: toNum(v.buildArea),
        floors: toNum(v.floors),
        hasDesign: v.hasDesign,
      };
    case 'METALWORK':
      return {
        workType: pick(v.workChoice, v.workOther),
        hasDesign: v.hasDesign,
        dimensions: v.dimensions.trim(),
        quantity: toNum(v.quantity),
      };
    default:
      return { description: v.description.trim() };
  }
}

// ───────────── الصفحة ─────────────

export default function BookingForm() {
  const { type: slug } = useParams();
  const type = (Object.keys(BOOKING_TYPE_SLUG) as BookingType[]).find((t) => BOOKING_TYPE_SLUG[t] === slug);
  useDocumentTitle(type ? `حجز ${BOOKING_TYPE_LABEL[type]}` : 'نوع حجز غير معروف');
  if (!type) return <UnknownType />;
  // key يعيد تهيئة النموذج بالكامل عند تغيير النوع
  return <BookingWizard key={type} type={type} />;
}

function UnknownType() {
  return (
    <div className="container max-w-xl py-16 text-center">
      <p className="eyebrow">الحجوزات</p>
      <h1 className="mt-2 text-2xl">نوع الحجز غير موجود</h1>
      <p className="mt-2 text-muted">ربما الرابط قديم أو فيه خطأ. اختر نوع العمل من صفحة الحجوزات.</p>
      <ButtonLink to="/bookings" size="lg" className="mt-6">
        كل أنواع الحجز
      </ButtonLink>
    </div>
  );
}

function BookingWizard({ type }: { type: BookingType }) {
  const { settings } = useSite();
  const draftKey = `vj-booking-draft-${BOOKING_TYPE_SLUG[type]}`;
  const [initial] = useState(() => loadDraft<Vals>(draftKey, EMPTY));
  const restored = useMemo(() => JSON.stringify(initial) !== JSON.stringify(EMPTY), [initial]);
  const [showRestored, setShowRestored] = useState(restored);

  const [v, setV] = useState<Vals>(initial);
  useAccountPrefill((c) => setV((s) => ({ ...s, name: s.name || c.name, phone: s.phone || c.localPhone })));
  const [photos, setPhotos] = useState<File[]>([]);
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slotsReload, setSlotsReload] = useState(0);
  const [done, setDone] = useState<BookingCreated | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useDraftSaver(draftKey, v, !done);

  const errors = useMemo(() => validate(type, v, photos, designFiles), [type, v, photos, designFiles]);
  const err = (k: string) => serverErrors[k] ?? (touched.has(k) || attempted.has(stepOf(k)) ? errors[k] : undefined);
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));

  function set<K extends keyof Vals>(key: K, value: Vals[K]) {
    setV((p) => ({ ...p, [key]: value }));
    const ek = ERROR_KEY[key] ?? key;
    if (serverErrors[ek]) setServerErrors(({ [ek]: _drop, ...rest }) => rest);
  }
  /** للخيارات (تُعتبر ملموسة فور الاختيار) */
  function choose<K extends keyof Vals>(key: K, value: Vals[K]) {
    set(key, value);
    touch(ERROR_KEY[key] ?? key);
  }

  const fee = computeFee(type, v, settings);

  function scrollToForm() {
    const el = formRef.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 88;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
  }

  function goTo(s: number) {
    setStep(s);
    setSubmitError(null);
    window.setTimeout(scrollToForm, 0);
  }

  function next() {
    const keys = STEP_KEYS[step];
    const bad = keys.some((k) => errors[k] || serverErrors[k]);
    if (bad) {
      setAttempted((a) => new Set(a).add(step));
      window.setTimeout(() => focusFirstError(formRef.current, keys, { ...errors, ...serverErrors }), 0);
      return;
    }
    goTo(step + 1);
  }

  async function submit() {
    // تحقق نهائي من كل الخطوات
    for (let s = 0; s < 3; s++) {
      if (STEP_KEYS[s].some((k) => errors[k])) {
        setAttempted((a) => new Set(a).add(s));
        goTo(s);
        window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[s], errors), 50);
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      type,
      name: v.name.trim(),
      phone: v.phone.trim(),
      locationText: v.locationText.trim(),
      lat: v.lat,
      lng: v.lng,
      floor: v.floor.trim() || undefined,
      date: v.date,
      time: v.time,
      notes: v.notes.trim() || undefined,
      ...(type === 'INSPECTION' ? { urgency: v.urgency } : {}),
      ...(type === 'PAINTING' ? { zone: v.zone } : {}),
      details: buildDetails(type, v),
    };
    const files = {
      photos: type === 'CONSTRUCTION' ? [] : photos,
      designFiles: (type === 'CONSTRUCTION' || type === 'METALWORK') && v.hasDesign ? designFiles : [],
    };
    const wa = prepareWhatsAppWindow();
    try {
      const res = await api.post<BookingCreated>('/bookings', toFormData(payload, files));
      clearDraft(draftKey);
      setDone(res);
      wa.open(res.whatsapp.link);
    } catch (e) {
      wa.cancel();
      handleError(e);
    } finally {
      setSubmitting(false);
    }
  }

  function handleError(e: unknown) {
    if (!(e instanceof ApiError)) {
      setSubmitError('حدث خطأ غير متوقع، حاول مرة أخرى.');
      return;
    }
    const fieldEntries = Object.entries(e.fields).filter(([k]) => k !== '_');
    if (fieldEntries.length) {
      const mapped: Record<string, string> = {};
      for (const [k, msg] of fieldEntries) {
        const lk = localKey(k) === 'date' ? 'time' : localKey(k);
        mapped[lk] ??= msg;
      }
      setServerErrors(mapped);
      const first = Math.min(...Object.keys(mapped).map(stepOf));
      if (first < 3) {
        goTo(first);
        window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[first], mapped), 50);
      } else setSubmitError(e.message);
      return;
    }
    if (e.field === 'time' || e.status === 409) {
      setServerErrors({ time: e.message });
      setV((p) => ({ ...p, time: '' }));
      setSlotsReload((n) => n + 1);
      goTo(2);
      return;
    }
    if (e.field) {
      const k = localKey(e.field);
      setServerErrors({ [k]: e.message });
      const s = stepOf(k);
      if (s < 3) {
        goTo(s);
        window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[s], { [k]: e.message }), 50);
        return;
      }
    }
    setSubmitError(e.message);
  }

  if (done) {
    const doneFee = done.inspectionFee != null ? Number(done.inspectionFee) : null;
    return (
      <SubmissionSuccess title="تم استلام حجزك" number={done.number} refCode={done.ref} whatsapp={done.whatsapp} message={done.message}>
        <dl className="divide-y divide-line rounded-xl border border-line">
          <SummaryRow label="نوع الحجز" value={BOOKING_TYPE_LABEL[done.type]} />
          <SummaryRow label="الموعد" value={formatDate(done.scheduledAt, true)} />
          {doneFee != null && <SummaryRow label="رسوم الكشف" value={`${formatJOD(doneFee)} — تُدفع عند الزيارة`} />}
          {done.mediaCount > 0 && (
            <SummaryRow label="المرفقات" value={<><span className="ltr">{done.mediaCount}</span> ملف</>} />
          )}
        </dl>
        <p className="text-sm text-muted">سنتصل بك لتأكيد الموعد. إن احتجت تغيير الوقت أخبرنا على واتساب.</p>
      </SubmissionSuccess>
    );
  }

  const showsDesign = type === 'CONSTRUCTION' || type === 'METALWORK';
  const showsPhotos = type !== 'CONSTRUCTION';

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="container max-w-3xl py-7 md:py-10">
          <Link to="/bookings" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-ink">
            <span aria-hidden>→</span> كل أنواع الحجز
          </Link>
          <h1 className="text-2xl md:text-3xl">حجز {BOOKING_TYPE_LABEL[type]}</h1>
          <p className="mt-2 text-muted">{INTRO[type]}</p>
        </div>
      </header>

      <div className="container max-w-3xl py-8 md:py-10">
        <Stepper steps={STEPS} current={step} />
        <p className="-mt-5 mb-6 text-sm text-muted sm:hidden">
          الخطوة <span className="ltr">{step + 1}</span> من <span className="ltr">{STEPS.length}</span>: {STEPS[step]}
        </p>

        {showRestored && step === 0 && (
          <Alert tone="info" className="mb-6" title="استرجعنا ما كتبته سابقًا">
            <span>الصور والملفات لا تُحفظ، أرفقها من جديد إن لزم. </span>
            <button
              type="button"
              className="font-medium text-brand-700 underline underline-offset-4 dark:text-brand-200"
              onClick={() => {
                clearDraft(draftKey);
                setV(EMPTY);
                setTouched(new Set());
                setAttempted(new Set());
                setShowRestored(false);
              }}
            >
              ابدأ من جديد
            </button>
          </Alert>
        )}

        <div ref={formRef} className="card p-4 sm:p-6 md:p-8">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) next();
              else submit();
            }}
          >
            {/* ── الخطوة 1: التفاصيل ── */}
            {step === 0 && (
              <div className="space-y-6">
                <StepHeading stepKey={step} title="تفاصيل العمل" />

                {type === 'INSPECTION' && (
                  <>
                    <ChoiceField field="faultType">
                      <ChoiceGroup
                        label="نوع العطل"
                        value={v.faultChoice || undefined}
                        onChange={(x) => choose('faultChoice', x)}
                        options={FAULTS.map((f) => ({ value: f, label: f }))}
                        error={v.faultChoice === OTHER ? undefined : err('faultType')}
                      />
                      {v.faultChoice === OTHER && (
                        <Input
                          label="اكتب نوع العطل"
                          wrapperClassName="mt-3"
                          value={v.faultOther}
                          maxLength={100}
                          onChange={(e) => set('faultOther', e.target.value)}
                          onBlur={() => touch('faultType')}
                          error={err('faultType')}
                          autoFocus
                        />
                      )}
                    </ChoiceField>
                    <Field field="description">
                      <Textarea
                        label="وصف العطل"
                        placeholder="مثال: رطوبة في سقف الحمام وتقشر في الدهان، بدأت بعد الشتاء."
                        value={v.description}
                        maxLength={2000}
                        onChange={(e) => set('description', e.target.value)}
                        onBlur={() => touch('description')}
                        error={err('description')}
                      />
                    </Field>
                    <ChoiceField field="urgency">
                      <ChoiceGroup
                        label="تصنيف الطلب"
                        value={v.urgency}
                        onChange={(x) => choose('urgency', x)}
                        columns={3}
                        options={[
                          { value: 'NORMAL' as const, label: 'عادي', description: `${formatJOD(settings.inspectionFeeNormal)} — حسب الجدول` },
                          { value: 'URGENT' as const, label: 'عاجل', description: `${formatJOD(settings.inspectionFeeUrgent)} — أقرب موعد` },
                          { value: 'EMERGENCY' as const, label: 'طارئ', description: `${formatJOD(settings.inspectionFeeEmergency)} — أولوية قصوى` },
                        ]}
                        hint={v.urgency === 'EMERGENCY' && settings.emergencyNote ? settings.emergencyNote : undefined}
                      />
                    </ChoiceField>
                    <FeeBox fee={fee} label={`رسوم الكشف الفني (${URGENCY_AR[v.urgency]})`} note="ثابتة لكل المحافظات. تُدفع عند الزيارة، وتشمل تشخيص العطل وتقدير سعر الإصلاح." />
                  </>
                )}

                {type === 'PAINTING' && (
                  <>
                    <ChoiceField field="paintType">
                      <ChoiceGroup
                        label="نوعية الدهان"
                        value={v.paintChoice || undefined}
                        onChange={(x) => choose('paintChoice', x)}
                        options={PAINTS.map((p) => ({ value: p, label: p }))}
                        error={v.paintChoice === OTHER ? undefined : err('paintType')}
                      />
                      {v.paintChoice === OTHER && (
                        <Input
                          label="اكتب نوعية الدهان"
                          wrapperClassName="mt-3"
                          value={v.paintOther}
                          maxLength={100}
                          onChange={(e) => set('paintOther', e.target.value)}
                          onBlur={() => touch('paintType')}
                          error={err('paintType')}
                          autoFocus
                        />
                      )}
                    </ChoiceField>
                    <ChoiceField field="jobKind">
                      <ChoiceGroup
                        label="نوع العمل"
                        value={v.jobKind || undefined}
                        onChange={(x) => choose('jobKind', x)}
                        options={[
                          { value: 'NEW' as const, label: 'دهان جديد', description: 'جدران لم تُدهن من قبل' },
                          { value: 'RENEW' as const, label: 'تجديد', description: 'إعادة دهان على دهان قديم' },
                        ]}
                        error={err('jobKind')}
                      />
                    </ChoiceField>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumberField label="عدد الغرف" field="rooms" value={v.rooms} integer onChange={(x) => set('rooms', x)} onBlur={() => touch('rooms')} error={err('rooms')} />
                      <NumberField label="المساحة التقريبية (م²)" field="area" value={v.area} onChange={(x) => set('area', x)} onBlur={() => touch('area')} error={err('area')} hint="مساحة الأرضية تكفي" />
                    </div>
                    <Field field="colors">
                      <Input label="الألوان" optional placeholder="مثال: أبيض كريمي للصالة، رمادي فاتح للغرف" value={v.colors} maxLength={300} onChange={(e) => set('colors', e.target.value)} onBlur={() => touch('colors')} error={err('colors')} />
                    </Field>
                    <ChoiceField field="decorations">
                      <ChoiceGroup label="هل تريد ديكورات؟" value={v.decorations} onChange={(x) => choose('decorations', x)} options={YES_NO} error={err('decorations')} />
                    </ChoiceField>
                    <ChoiceField field="zone">
                      <ChoiceGroup
                        label="مكان الموقع"
                        value={v.zone || undefined}
                        onChange={(x) => choose('zone', x)}
                        options={[
                          { value: 'INSIDE_AMMAN' as const, label: 'داخل عمّان', description: `كشف ${formatJOD(settings.paintingFeeInside)}` },
                          { value: 'OUTSIDE_AMMAN' as const, label: 'خارج عمّان', description: `كشف ${formatJOD(settings.paintingFeeOutside)}` },
                        ]}
                        error={err('zone')}
                      />
                    </ChoiceField>
                    <FeeBox
                      fee={fee}
                      label="رسوم الكشف على أعمال الدهان"
                      note="تُدفع عند الزيارة، ونعطيك بعدها سعر العمل كاملًا."
                      pending={`رسوم الكشف: ${formatJOD(settings.paintingFeeInside)} داخل عمّان، ${formatJOD(settings.paintingFeeOutside)} خارجها. حدد مكان الموقع لرؤية المبلغ.`}
                    />
                  </>
                )}

                {type === 'CONSTRUCTION' && (
                  <>
                    <ChoiceField field="buildingType">
                      <ChoiceGroup
                        label="نوع البناء"
                        value={v.buildingType || undefined}
                        onChange={(x) => choose('buildingType', x)}
                        columns={4}
                        options={[
                          { value: 'HOUSE' as const, label: 'منزل مستقل' },
                          { value: 'APARTMENT' as const, label: 'شقة' },
                          { value: 'VILLA' as const, label: 'فيلا' },
                          { value: 'COMMERCIAL' as const, label: 'تجاري' },
                        ]}
                        error={err('buildingType')}
                      />
                    </ChoiceField>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumberField label="مساحة الأرض (م²)" field="landArea" value={v.landArea} onChange={(x) => set('landArea', x)} onBlur={() => touch('landArea')} error={err('landArea')} />
                      <NumberField label="مساحة البناء المطلوبة (م²)" field="buildArea" value={v.buildArea} onChange={(x) => set('buildArea', x)} onBlur={() => touch('buildArea')} error={err('buildArea')} />
                      <NumberField label="عدد الطوابق" field="floors" integer value={v.floors} onChange={(x) => set('floors', x)} onBlur={() => touch('floors')} error={err('floors')} />
                    </div>
                    <ChoiceField field="tiles">
                      <ChoiceGroup label="هل يشمل العمل التشطيب الداخلي والخارجي؟" value={v.tiles} onChange={(x) => choose('tiles', x)} options={YES_NO} error={err('tiles')} />
                    </ChoiceField>
                  </>
                )}

                {type === 'METALWORK' && (
                  <>
                    <ChoiceField field="workType">
                      <ChoiceGroup
                        label="نوع العمل"
                        value={v.workChoice || undefined}
                        onChange={(x) => choose('workChoice', x)}
                        columns={3}
                        options={WORKS.map((w) => ({ value: w, label: w }))}
                        error={v.workChoice === OTHER ? undefined : err('workType')}
                      />
                      {v.workChoice === OTHER && (
                        <Input
                          label="اكتب نوع العمل"
                          wrapperClassName="mt-3"
                          value={v.workOther}
                          maxLength={100}
                          onChange={(e) => set('workOther', e.target.value)}
                          onBlur={() => touch('workType')}
                          error={err('workType')}
                          autoFocus
                        />
                      )}
                    </ChoiceField>
                    <Field field="dimensions">
                      <Textarea
                        label="المساحات والقياسات"
                        rows={3}
                        placeholder="مثال: بوابة عرض 4 م وارتفاع 2.2 م، ودرابزين درج بطول 6 م"
                        value={v.dimensions}
                        maxLength={500}
                        onChange={(e) => set('dimensions', e.target.value)}
                        onBlur={() => touch('dimensions')}
                        error={err('dimensions')}
                      />
                    </Field>
                    <NumberField label="العدد المطلوب" field="quantity" integer value={v.quantity} onChange={(x) => set('quantity', x)} onBlur={() => touch('quantity')} error={err('quantity')} wrapperClassName="sm:max-w-[14rem]" />
                  </>
                )}

                {type === 'GENERAL' && (
                  <Field field="description">
                    <Textarea
                      label="ما العمل المطلوب؟"
                      rows={5}
                      placeholder="مثال: تركيب 3 وحدات إنارة وتصليح باب خشب لا يُغلق جيدًا."
                      value={v.description}
                      maxLength={2000}
                      onChange={(e) => set('description', e.target.value)}
                      onBlur={() => touch('description')}
                      error={err('description')}
                    />
                  </Field>
                )}

                {showsDesign && (
                  <>
                    <ChoiceField field="hasDesign">
                      <ChoiceGroup
                        label={type === 'CONSTRUCTION' ? 'هل يوجد مخطط أو تصميم جاهز؟' : 'هل لديك تصميم أو صورة مرجعية؟'}
                        value={v.hasDesign}
                        onChange={(x) => choose('hasDesign', x)}
                        options={YES_NO}
                        error={err('hasDesign')}
                      />
                    </ChoiceField>
                    {v.hasDesign && (
                      <FilePicker
                        label="ملفات التصميم"
                        field="designFiles"
                        files={designFiles}
                        onChange={(f) => {
                          setDesignFiles(f);
                          touch('designFiles');
                          if (serverErrors.designFiles) setServerErrors(({ designFiles: _d, ...r }) => r);
                        }}
                        max={5}
                        allowPdf
                        error={err('designFiles')}
                      />
                    )}
                  </>
                )}

                {showsPhotos && (
                  <FilePicker
                    label="صور الموقع"
                    field="photos"
                    optional
                    files={photos}
                    onChange={setPhotos}
                    max={5}
                    error={err('photos')}
                  />
                )}
              </div>
            )}

            {/* ── الخطوة 2: الموقع ── */}
            {step === 1 && (
              <div className="space-y-5">
                <StepHeading stepKey={step} title="بياناتك وموقع العمل" description="نستخدم الرقم للتواصل وتأكيد الموعد فقط." />
                <AccountNote />
                <Field field="name">
                  <Input label="الاسم" autoComplete="name" value={v.name} maxLength={100} onChange={(e) => set('name', e.target.value)} onBlur={() => touch('name')} error={err('name')} />
                </Field>
                <Field field="phone">
                  <Input
                    label="رقم الهاتف"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    className="text-end"
                    placeholder="07XXXXXXXX"
                    value={v.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    onBlur={() => touch('phone')}
                    error={err('phone')}
                    hint="رقم عليه واتساب إن أمكن"
                  />
                </Field>
                <Field field="locationText">
                  <Input
                    label="مكان الموقع"
                    autoComplete="street-address"
                    placeholder="المدينة، المنطقة، الشارع، رقم البناية"
                    value={v.locationText}
                    maxLength={300}
                    onChange={(e) => set('locationText', e.target.value)}
                    onBlur={() => touch('locationText')}
                    error={err('locationText')}
                    hint="أضف أقرب معلم إن وُجد"
                  />
                </Field>
                <Field field="floor">
                  <Input label="رقم الطابق" optional value={v.floor} maxLength={30} onChange={(e) => set('floor', e.target.value)} onBlur={() => touch('floor')} error={err('floor')} wrapperClassName="sm:max-w-[14rem]" />
                </Field>
                <LocationPicker
                  lat={v.lat}
                  lng={v.lng}
                  required={type === 'CONSTRUCTION'}
                  onChange={(la, ln) => {
                    setV((p) => ({ ...p, lat: la, lng: ln }));
                    touch('lat');
                    if (serverErrors.lat) setServerErrors(({ lat: _l, ...r }) => r);
                  }}
                  hint={
                    type === 'CONSTRUCTION'
                      ? 'مطلوب لأعمال البناء: حدد موقع الأرض بدقة. إن لم تكن في الأرض الآن اخترها من الخريطة.'
                      : 'يساعد الفريق على الوصول دون اتصالات إضافية.'
                  }
                  error={err('lat')}
                />
              </div>
            )}

            {/* ── الخطوة 3: الموعد ── */}
            {step === 2 && (
              <div className="space-y-6">
                <StepHeading stepKey={step} title="اختر موعد الزيارة" description="اختر اليوم ثم الساعة المناسبة من الأوقات المتاحة." />
                {serverErrors.time && (
                  <Alert tone="warn" title="اختر وقتًا آخر">
                    {serverErrors.time}
                  </Alert>
                )}
                <SlotPicker
                  date={v.date}
                  time={v.time}
                  reloadKey={slotsReload}
                  onChange={(d, t) => {
                    setV((p) => ({ ...p, date: d, time: t }));
                    if (t) {
                      touch('time');
                      if (serverErrors.time) setServerErrors(({ time: _t, ...r }) => r);
                    }
                  }}
                  error={serverErrors.time ? undefined : err('time')}
                />
                <Field field="notes">
                  <Textarea
                    label="ملاحظات"
                    optional
                    rows={3}
                    placeholder="مثال: الاتصال قبل الوصول بنصف ساعة، البناية بدون مصعد."
                    value={v.notes}
                    maxLength={2000}
                    onChange={(e) => set('notes', e.target.value)}
                    onBlur={() => touch('notes')}
                    error={err('notes')}
                  />
                </Field>
              </div>
            )}

            {/* ── الخطوة 4: المراجعة ── */}
            {step === 3 && (
              <div className="space-y-4">
                <StepHeading stepKey={step} title="راجع الحجز قبل التأكيد" />
                <ReviewSection
                  title="تفاصيل العمل"
                  onEdit={() => goTo(0)}
                  rows={[
                    ...Object.entries(buildDetails(type, v))
                      .filter(([, val]) => val !== undefined && val !== '')
                      .map(([k, val]) => [DETAIL_LABELS[k] ?? k, formatDetail(k, val)] as [string, ReactNode]),
                    ...(type === 'INSPECTION' ? ([['تصنيف الطلب', URGENCY_AR[v.urgency]]] as [string, ReactNode][]) : []),
                    ...(type === 'PAINTING' ? ([['مكان الموقع', v.zone === 'INSIDE_AMMAN' ? 'داخل عمّان' : 'خارج عمّان']] as [string, ReactNode][]) : []),
                    ['الصور', showsPhotos ? (photos.length ? <><span className="ltr">{photos.length}</span> صور</> : 'بدون صور') : null],
                    ['ملفات التصميم', showsDesign && v.hasDesign ? designFiles.map((f) => f.name).join('، ') : null],
                  ]}
                />
                <ReviewSection
                  title="بياناتك والموقع"
                  onEdit={() => goTo(1)}
                  rows={[
                    ['الاسم', v.name],
                    ['الهاتف', <span className="ltr">{v.phone}</span>],
                    ['العنوان', v.locationText],
                    ['الطابق', v.floor],
                    [
                      'الإحداثيات',
                      v.lat != null && v.lng != null ? (
                        <a className="text-brand-700 underline underline-offset-4 dark:text-brand-200" href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noopener noreferrer">
                          <span className="ltr">{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</span>
                        </a>
                      ) : (
                        'غير محددة'
                      ),
                    ],
                  ]}
                />
                <ReviewSection
                  title="الموعد"
                  onEdit={() => goTo(2)}
                  rows={[
                    ['اليوم', v.date ? longDate(v.date) : ''],
                    ['الساعة', v.time ? formatSlot(v.time) : ''],
                    ['ملاحظات', v.notes],
                  ]}
                />
                {fee != null && (
                  <div className="flex items-center justify-between rounded-xl border border-brand-300 bg-brand-50 px-4 py-4 text-ink dark:border-brand-600 dark:bg-brand-500/10">
                    <div>
                      <p className="font-semibold">رسوم الكشف</p>
                      <p className="text-sm text-muted">تُدفع للفني عند الزيارة</p>
                    </div>
                    <p className="text-2xl font-bold">{formatJOD(fee)}</p>
                  </div>
                )}
                {submitError && (
                  <Alert tone="error" title="لم يُرسل الحجز">
                    {submitError}
                  </Alert>
                )}
                <p className="text-sm text-muted">
                  بعد التأكيد يصلنا الحجز فورًا، وتحصل على رقم مرجع لمتابعته من صفحتك.
                </p>
              </div>
            )}

            <StepActions
              onBack={step > 0 ? () => goTo(step - 1) : undefined}
              onNext={() => (step < 3 ? next() : submit())}
              nextLabel={step < 3 ? 'التالي' : submitting ? 'جاري إرسال الحجز…' : 'تأكيد الحجز'}
              loading={submitting}
            />
          </form>
        </div>
      </div>
    </>
  );
}

// ───────────── مكونات مساعدة ─────────────

function Field({ field, children }: { field: string; children: ReactNode }) {
  return <div data-field={field}>{children}</div>;
}

function ChoiceField({ field, children }: { field: string; children: ReactNode }) {
  return <div data-field={field}>{children}</div>;
}

function NumberField({
  label,
  field,
  value,
  onChange,
  onBlur,
  error,
  hint,
  integer,
  wrapperClassName,
}: {
  label: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error?: string;
  hint?: string;
  integer?: boolean;
  wrapperClassName?: string;
}) {
  return (
    <div data-field={field} className={wrapperClassName}>
      <Input
        label={label}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        dir="ltr"
        className="text-end"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d٠-٩.,٫]/g, ''))}
        onBlur={onBlur}
        error={error}
        hint={hint}
      />
    </div>
  );
}

function FeeBox({ fee, label, note, pending }: { fee: number | null; label: string; note: string; pending?: string }) {
  return (
    <div className={cx('rounded-xl border px-4 py-3.5', fee != null ? 'border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30' : 'border-line bg-subtle')} aria-live="polite">
      {fee != null ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{label}</p>
            <p className="text-sm text-muted">{note}</p>
          </div>
          <p className="shrink-0 text-2xl font-bold text-brand-800 dark:text-brand-100">{formatJOD(fee)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{pending}</p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3 text-[15px]">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
