import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FilePicker } from '../../components/forms/FilePicker';
import { ReviewSection, StepActions, StepHeading, SubmissionSuccess, YES_NO } from '../../components/forms/FormBits';
import { LocationPicker } from '../../components/forms/LocationPicker';
import {
  checkOptionalText,
  checkText,
  clearDraft,
  focusFirstError,
  loadDraft,
  localKey,
  useDraftSaver,
} from '../../components/forms/formUtils';
import { Alert, ButtonLink, Checkbox, ChoiceGroup, ErrorState, Input, Skeleton, Stepper, Textarea } from '../../components/ui';
import { ApiError, api, toFormData } from '../../lib/api';
import { CORPORATE_TYPE_LABEL, isValidPhone } from '../../lib/format';
import type { CorporateCreated, CorporateService, CorporateType } from '../../lib/types';
import { AccountNote, useAccountPrefill } from '../../components/forms/AccountPrefill';
import { prepareWhatsAppWindow } from '../../lib/whatsapp';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const SLUG_TYPE: Record<string, CorporateType> = { annual: 'ANNUAL', urgent: 'URGENT' };
const STEPS = ['بيانات الشركة', 'الخدمات', 'المراجعة'];

const IMPACT = [
  { value: 'NO_STOP_NEEDED' as const, label: 'نعم، يمكن العمل دون إيقاف الإنتاج' },
  { value: 'PARTIAL_STOP' as const, label: 'يمكن الإيقاف جزئيًا' },
  { value: 'CANNOT_STOP' as const, label: 'لا يمكن إيقاف الإنتاج' },
];
const LEVELS = [
  { value: 'LOW' as const, label: 'منخفضة', description: 'يمكن الانتظار أيامًا' },
  { value: 'MEDIUM' as const, label: 'متوسطة', description: 'خلال يومين' },
  { value: 'HIGH' as const, label: 'عالية', description: 'خلال 24 ساعة' },
  { value: 'CRITICAL' as const, label: 'حرجة — توقف كامل', description: 'العمل متوقف الآن' },
];

type Impact = (typeof IMPACT)[number]['value'];
type Level = (typeof LEVELS)[number]['value'];

type Vals = {
  companyName: string;
  contactName: string;
  managerPhone: string;
  maintenancePhone: string;
  locationText: string;
  lat: number | null;
  lng: number | null;
  services: string[];
  workLocation: string;
  productionImpact: '' | Impact;
  productionLineAffected: boolean | null;
  urgencyLevel: '' | Level;
  notes: string;
};

const EMPTY: Vals = {
  companyName: '', contactName: '', managerPhone: '', maintenancePhone: '', locationText: '',
  lat: null, lng: null, services: [], workLocation: '', productionImpact: '', productionLineAffected: null,
  urgencyLevel: '', notes: '',
};

const STEP_KEYS = [
  ['companyName', 'contactName', 'managerPhone', 'maintenancePhone', 'locationText', 'lat', 'commercialRegister', 'license'],
  ['services', 'workLocation', 'productionImpact', 'productionLineAffected', 'urgencyLevel', 'notes'],
  [],
];
const stepOf = (k: string) => {
  if (k === 'lng') return 0;
  const i = STEP_KEYS.findIndex((ks) => ks.includes(k));
  return i === -1 ? 2 : i;
};

const phoneErr = (label: string, v: string) =>
  !v.trim() ? `${label} مطلوب` : isValidPhone(v) ? undefined : 'رقم الهاتف غير صحيح (مثال: 0791234567)';

function validate(type: CorporateType, v: Vals, cr: File[], lic: File[]) {
  const e: Record<string, string | undefined> = {
    companyName: checkText('اسم الشركة', v.companyName, 150),
    contactName: checkText('اسم المسؤول', v.contactName, 100, 2),
    managerPhone: phoneErr('هاتف المدير', v.managerPhone),
    maintenancePhone: phoneErr('هاتف مسؤول الصيانة', v.maintenancePhone),
    locationText: checkText('موقع الشركة', v.locationText, 300),
    services: v.services.length ? undefined : 'اختر خدمة واحدة على الأقل',
    notes: checkOptionalText('الملاحظات', v.notes, 2000),
  };
  if (type === 'ANNUAL') {
    e.commercialRegister = cr.length ? undefined : 'ارفع السجل التجاري';
    e.license = lic.length ? undefined : 'ارفع رخصة الشركة';
  }
  if (type === 'URGENT') {
    e.workLocation = checkText('موقع العمل داخل المنشأة', v.workLocation, 300);
    e.productionImpact = v.productionImpact ? undefined : 'حدد إمكانية العمل مع الإنتاج';
    e.productionLineAffected = v.productionLineAffected == null ? 'اختر نعم أو لا' : undefined;
    e.urgencyLevel = v.urgencyLevel ? undefined : 'حدد درجة الاستعجال';
  }
  return e;
}

export default function CorporateForm() {
  const { type: slug } = useParams();
  const type = slug ? SLUG_TYPE[slug] : undefined;
  useDocumentTitle(type ? CORPORATE_TYPE_LABEL[type] : 'طلب غير معروف');
  if (!type) {
    return (
      <div className="container max-w-xl py-16 text-center">
        <p className="eyebrow">الشركات</p>
        <h1 className="mt-2 text-2xl">نوع الطلب غير موجود</h1>
        <p className="mt-2 text-muted">اختر عقد صيانة سنوي أو طلب صيانة عاجل من صفحة الشركات.</p>
        <ButtonLink to="/corporate" size="lg" className="mt-6">
          خدمات الشركات
        </ButtonLink>
      </div>
    );
  }
  return <CorporateWizard key={type} type={type} slug={slug!} />;
}

function CorporateWizard({ type, slug }: { type: CorporateType; slug: string }) {
  const draftKey = `vj-corporate-draft-${slug}`;
  const [v, setV] = useState<Vals>(() => loadDraft<Vals>(draftKey, EMPTY));
  useAccountPrefill((c) =>
    setV((s) => ({
      ...s,
      contactName: s.contactName || c.name,
      managerPhone: s.managerPhone || c.localPhone,
      companyName: s.companyName || c.companyName || '',
    })),
  );
  const [cr, setCr] = useState<File[]>([]);
  const [lic, setLic] = useState<File[]>([]);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<CorporateCreated | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const svc = useAsync(() => api.get<CorporateService[]>('/corporate/services'), []);
  const services = useMemo(() => (svc.data ?? []).filter((s) => s.kind === type), [svc.data, type]);

  useDraftSaver(draftKey, v, !done);

  const errors = useMemo(() => validate(type, v, cr, lic), [type, v, cr, lic]);
  const err = (k: string) => serverErrors[k] ?? (touched.has(k) || attempted.has(stepOf(k)) ? errors[k] : undefined);
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  const clearServer = (k: string) => serverErrors[k] && setServerErrors(({ [k]: _x, ...r }) => r);

  function set<K extends keyof Vals>(key: K, value: Vals[K]) {
    setV((p) => ({ ...p, [key]: value }));
    clearServer(key === 'lng' ? 'lat' : key);
  }
  function choose<K extends keyof Vals>(key: K, value: Vals[K]) {
    set(key, value);
    touch(key);
  }

  function goTo(s: number) {
    setStep(s);
    setSubmitError(null);
    window.setTimeout(() => {
      const el = formRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 88;
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' });
    }, 0);
  }

  function next() {
    const keys = STEP_KEYS[step];
    if (keys.some((k) => errors[k] || serverErrors[k])) {
      setAttempted((a) => new Set(a).add(step));
      window.setTimeout(() => focusFirstError(formRef.current, keys, { ...errors, ...serverErrors }), 0);
      return;
    }
    goTo(step + 1);
  }

  async function submit() {
    for (let s = 0; s < 2; s++) {
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
      companyName: v.companyName.trim(),
      contactName: v.contactName.trim(),
      managerPhone: v.managerPhone.trim(),
      maintenancePhone: v.maintenancePhone.trim(),
      locationText: v.locationText.trim(),
      lat: v.lat,
      lng: v.lng,
      // الخدمات التي لم تعد ضمن هذا النوع تُستبعد
      services: v.services.filter((k) => services.some((s) => s.key === k)),
      notes: v.notes.trim() || undefined,
      ...(type === 'URGENT'
        ? {
            workLocation: v.workLocation.trim(),
            productionImpact: v.productionImpact,
            productionLineAffected: v.productionLineAffected,
            urgencyLevel: v.urgencyLevel,
          }
        : {}),
    };
    const wa = prepareWhatsAppWindow();
    try {
      const res = await api.post<CorporateCreated>(
        '/corporate/requests',
        toFormData(payload, { commercialRegister: cr[0], license: lic[0] }),
      );
      clearDraft(draftKey);
      setDone(res);
      wa.open(res.whatsapp.link);
    } catch (e) {
      wa.cancel();
      if (!(e instanceof ApiError)) {
        setSubmitError('حدث خطأ غير متوقع، حاول مرة أخرى.');
      } else {
        const entries = Object.entries(e.fields).filter(([k]) => k !== '_');
        const mapped: Record<string, string> = {};
        for (const [k, m] of entries) mapped[localKey(k)] ??= m;
        if (!entries.length && e.field) mapped[localKey(e.field)] = e.message;
        const keys = Object.keys(mapped);
        const first = keys.length ? Math.min(...keys.map(stepOf)) : 2;
        if (keys.length && first < 2) {
          setServerErrors(mapped);
          goTo(first);
          window.setTimeout(() => focusFirstError(formRef.current, STEP_KEYS[first], mapped), 50);
        } else {
          setSubmitError(e.status === 429 ? 'أرسلتم طلبات كثيرة خلال وقت قصير. انتظروا قليلًا ثم حاولوا مجددًا.' : e.message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SubmissionSuccess
        noun="الطلب"
        title={type === 'URGENT' ? 'وصل طلبكم العاجل' : 'وصل طلب العقد السنوي'}
        number={done.number}
        refCode={done.ref}
        whatsapp={done.whatsapp}
        message={done.message}
        intro={
          <p className="text-[15px]">
            {type === 'URGENT'
              ? 'الطلب الآن عند فريق الشركات. سنتصل بمسؤول الصيانة لتحديد وقت الوصول.'
              : 'الطلب الآن عند فريق الشركات. سنتواصل مع المدير لترتيب زيارة تقييم للمنشأة ثم نرسل عرض العقد.'}
          </p>
        }
      >
        <div className="rounded-xl border border-line p-4">
          <p className="text-sm font-semibold text-muted">الخدمات المطلوبة</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {done.services.map((s) => (
              <li key={s} className="rounded-lg bg-subtle px-3 py-1.5 text-sm">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </SubmissionSuccess>
    );
  }

  const docsRequired = type === 'ANNUAL';
  const serviceName = (k: string) => services.find((s) => s.key === k)?.name ?? k;

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="container max-w-3xl py-7 md:py-10">
          <Link to="/corporate" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-ink">
            <span aria-hidden>→</span> خدمات الشركات
          </Link>
          <h1 className="text-2xl md:text-3xl">{CORPORATE_TYPE_LABEL[type]}</h1>
          <p className="mt-2 text-muted">
            {type === 'ANNUAL'
              ? 'بيانات المنشأة والخدمات المطلوبة. بعدها نزور المنشأة للتقييم ونرسل عرض العقد مكتوبًا.'
              : 'املؤوا ما يلزم فقط — الطلب يصل فورًا لفريق الشركات ويُتصل بكم مباشرة.'}
          </p>
        </div>
      </header>

      <div className="container max-w-3xl py-8 md:py-10">
        <Stepper steps={STEPS} current={step} />
        <p className="-mt-5 mb-6 text-sm text-muted sm:hidden">
          الخطوة <span className="ltr">{step + 1}</span> من <span className="ltr">{STEPS.length}</span>: {STEPS[step]}
        </p>

        <div ref={formRef} className="card p-4 sm:p-6 md:p-8">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) next();
              else submit();
            }}
          >
            {step === 0 && (
              <div className="space-y-5">
                <StepHeading stepKey={step} title="بيانات الشركة" />
                <AccountNote what="الطلب" />
                <div data-field="companyName">
                  <Input label="اسم الشركة / المنشأة" autoComplete="organization" value={v.companyName} maxLength={150} onChange={(e) => set('companyName', e.target.value)} onBlur={() => touch('companyName')} error={err('companyName')} />
                </div>
                <div data-field="contactName">
                  <Input label="اسم المسؤول" autoComplete="name" value={v.contactName} maxLength={100} onChange={(e) => set('contactName', e.target.value)} onBlur={() => touch('contactName')} error={err('contactName')} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div data-field="managerPhone">
                    <Input label="هاتف المدير" type="tel" inputMode="tel" dir="ltr" className="text-end" autoComplete="tel" placeholder="07XXXXXXXX" value={v.managerPhone} onChange={(e) => set('managerPhone', e.target.value)} onBlur={() => touch('managerPhone')} error={err('managerPhone')} hint="يُستخدم للدخول إلى صفحة الشركة" />
                  </div>
                  <div data-field="maintenancePhone">
                    <Input label="هاتف مسؤول الصيانة" type="tel" inputMode="tel" dir="ltr" className="text-end" placeholder="07XXXXXXXX" value={v.maintenancePhone} onChange={(e) => set('maintenancePhone', e.target.value)} onBlur={() => touch('maintenancePhone')} error={err('maintenancePhone')} />
                  </div>
                </div>
                <div data-field="locationText">
                  <Input label="موقع الشركة" placeholder="المدينة الصناعية، المنطقة، الشارع" value={v.locationText} maxLength={300} onChange={(e) => set('locationText', e.target.value)} onBlur={() => touch('locationText')} error={err('locationText')} />
                </div>
                <LocationPicker
                  lat={v.lat}
                  lng={v.lng}
                  onChange={(la, ln) => {
                    setV((p) => ({ ...p, lat: la, lng: ln }));
                    clearServer('lat');
                  }}
                  error={err('lat')}
                />
                <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
                  <FilePicker
                    label="السجل التجاري"
                    field="commercialRegister"
                    optional={!docsRequired}
                    files={cr}
                    onChange={(f) => {
                      setCr(f);
                      touch('commercialRegister');
                      clearServer('commercialRegister');
                    }}
                    max={1}
                    allowPdf
                    error={err('commercialRegister')}
                    hint="صورة حتى 5 ميغابايت أو PDF حتى 10"
                  />
                  <FilePicker
                    label="رخصة الشركة"
                    field="license"
                    optional={!docsRequired}
                    files={lic}
                    onChange={(f) => {
                      setLic(f);
                      touch('license');
                      clearServer('license');
                    }}
                    max={1}
                    allowPdf
                    error={err('license')}
                    hint="صورة حتى 5 ميغابايت أو PDF حتى 10"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <StepHeading stepKey={step} title="الخدمات المطلوبة" description="اختاروا كل ما ينطبق." />
                <fieldset data-field="services">
                  <legend className="label">الخدمات</legend>
                  {svc.loading ? (
                    <div className="grid gap-2 sm:grid-cols-2" role="status" aria-label="جاري تحميل الخدمات">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 rounded-xl" />
                      ))}
                    </div>
                  ) : svc.error ? (
                    <ErrorState message={svc.error.message} onRetry={svc.reload} />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {services.map((s) => (
                        <Checkbox
                          key={s.key}
                          label={s.name}
                          checked={v.services.includes(s.key)}
                          onChange={(c) =>
                            choose('services', c ? [...v.services, s.key] : v.services.filter((k) => k !== s.key))
                          }
                        />
                      ))}
                    </div>
                  )}
                  {err('services') && (
                    <p className="mt-1.5 text-sm text-danger" role="alert">
                      {err('services')}
                    </p>
                  )}
                </fieldset>

                {type === 'URGENT' && (
                  <>
                    <div data-field="workLocation">
                      <Input label="موقع العمل داخل المنشأة" placeholder="مثال: صالة الإنتاج 2، غرفة الضواغط" value={v.workLocation} maxLength={300} onChange={(e) => set('workLocation', e.target.value)} onBlur={() => touch('workLocation')} error={err('workLocation')} />
                    </div>
                    <div data-field="productionImpact">
                      <ChoiceGroup label="هل يمكن العمل أثناء الإنتاج؟" value={v.productionImpact || undefined} onChange={(x) => choose('productionImpact', x)} options={IMPACT} columns={3} error={err('productionImpact')} />
                    </div>
                    <div data-field="productionLineAffected">
                      <ChoiceGroup label="هل العطل يؤثر على خط الإنتاج؟" value={v.productionLineAffected} onChange={(x) => choose('productionLineAffected', x)} options={YES_NO} error={err('productionLineAffected')} />
                    </div>
                    <div data-field="urgencyLevel">
                      <ChoiceGroup label="درجة الاستعجال" value={v.urgencyLevel || undefined} onChange={(x) => choose('urgencyLevel', x)} options={LEVELS} columns={4} error={err('urgencyLevel')} />
                    </div>
                  </>
                )}

                <div data-field="notes">
                  <Textarea
                    label={type === 'URGENT' ? 'وصف العطل وملاحظات' : 'ملاحظات'}
                    optional
                    rows={4}
                    placeholder={type === 'URGENT' ? 'ماذا حدث، ومتى، وما المتأثر.' : 'مساحة المنشأة، عدد المباني، أي متطلبات تدقيق قادمة.'}
                    value={v.notes}
                    maxLength={2000}
                    onChange={(e) => set('notes', e.target.value)}
                    onBlur={() => touch('notes')}
                    error={err('notes')}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <StepHeading stepKey={step} title="راجعوا الطلب قبل الإرسال" />
                <ReviewSection
                  title="بيانات الشركة"
                  onEdit={() => goTo(0)}
                  rows={[
                    ['الشركة', v.companyName],
                    ['المسؤول', v.contactName],
                    ['هاتف المدير', <span className="ltr">{v.managerPhone}</span>],
                    ['هاتف الصيانة', <span className="ltr">{v.maintenancePhone}</span>],
                    ['الموقع', v.locationText],
                    ['الإحداثيات', v.lat != null && v.lng != null ? <span className="ltr">{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</span> : null],
                    ['السجل التجاري', cr[0]?.name ?? (docsRequired ? '' : 'لم يُرفق')],
                    ['رخصة الشركة', lic[0]?.name ?? (docsRequired ? '' : 'لم تُرفق')],
                  ]}
                />
                <ReviewSection
                  title="الخدمات"
                  onEdit={() => goTo(1)}
                  rows={
                    [
                      ['الخدمات', v.services.map(serviceName).join('، ')],
                      ...(type === 'URGENT'
                        ? [
                            ['موقع العمل', v.workLocation],
                            ['العمل مع الإنتاج', IMPACT.find((i) => i.value === v.productionImpact)?.label],
                            ['يؤثر على خط الإنتاج', v.productionLineAffected == null ? '' : v.productionLineAffected ? 'نعم' : 'لا'],
                            ['درجة الاستعجال', LEVELS.find((l) => l.value === v.urgencyLevel)?.label],
                          ]
                        : []),
                      ['ملاحظات', v.notes],
                    ] as [string, ReactNode][]
                  }
                />
                {submitError && (
                  <Alert tone="error" title="لم يُرسل الطلب">
                    {submitError}
                  </Alert>
                )}
                <p className="text-sm text-muted">الطلب يصل فورًا لفريق الشركات، وتحصلون على رقم مرجع لمتابعته.</p>
              </div>
            )}

            <StepActions
              onBack={step > 0 ? () => goTo(step - 1) : undefined}
              onNext={() => (step < 2 ? next() : submit())}
              nextLabel={step < 2 ? 'التالي' : submitting ? 'جاري الإرسال…' : 'إرسال الطلب'}
              loading={submitting}
            />
          </form>
        </div>
      </div>
    </>
  );
}
