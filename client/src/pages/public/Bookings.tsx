import { Link } from 'react-router-dom';
import { Icon, PageHeader } from '../../components/ui';
import { useSite } from '../../context/SiteContext';
import { BOOKING_TYPE_LABEL, BOOKING_TYPE_SLUG, WEEKDAYS, formatJOD, formatSlot } from '../../lib/format';
import type { BookingType } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const TYPES: { type: BookingType; text: string; needs: string }[] = [
  {
    type: 'INSPECTION',
    text: 'تسريب مياه، رطوبة، تشققات، مشاكل كهرباء أو سباكة. نزور الموقع، نحدد سبب المشكلة، ونعطيك تقريرًا وسعر الإصلاح قبل البدء.',
    needs: 'وصف العطل وصور إن وُجدت',
  },
  {
    type: 'PAINTING',
    text: 'دهان شقق وبيوت ومكاتب: دهان جديد أو تجديد، بلاستيك أو زيتي أو شمواه، مع الديكورات إن أردت.',
    needs: 'عدد الغرف والمساحة التقريبية',
  },
  {
    type: 'CONSTRUCTION',
    text: 'بناء منزل أو فيلا أو طابق إضافي أو مبنى تجاري، من العظم حتى التشطيب والبلاط.',
    needs: 'مساحة الأرض والبناء، وموقع الأرض على الخريطة',
  },
  {
    type: 'METALWORK',
    text: 'أبواب وبوابات ودرابزين ومظلات وهناجر، تصنيع وتركيب حسب القياس أو حسب تصميمك.',
    needs: 'نوع العمل والقياسات والعدد',
  },
  {
    type: 'GENERAL',
    text: 'أي عمل صيانة لا يندرج تحت الأقسام السابقة: تركيب، تصليح، أعمال صغيرة في البيت أو المحل.',
    needs: 'وصف مختصر للعمل',
  },
];

export default function Bookings() {
  useDocumentTitle('احجز موعدًا');
  const { settings } = useSite();
  const days = settings.workingDays
    .slice()
    .sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)) // يبدأ الأسبوع من السبت
    .map((d) => WEEKDAYS[d])
    .join('، ');

  return (
    <>
      <PageHeader
        eyebrow="الحجوزات"
        title="اختر نوع العمل واحجز موعد الزيارة"
        description="تعبئة الطلب تأخذ دقيقتين. تختار اليوم والساعة بنفسك، ويصلنا الحجز مباشرة ونتواصل معك لتأكيده."
      />

      <div className="container py-10 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <ul className="grid gap-3 sm:grid-cols-2">
            {TYPES.map(({ type, text, needs }, i) => (
              <li key={type} className={i === 0 ? 'sm:col-span-2' : undefined}>
                <Link
                  to={`/bookings/${BOOKING_TYPE_SLUG[type]}`}
                  className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand-400 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-sm font-semibold text-sand-600 dark:text-sand-300">
                        <span className="ltr">{String(i + 1).padStart(2, '0')}</span>
                      </span>
                      <h2 className="mt-1 text-xl">{BOOKING_TYPE_LABEL[type]}</h2>
                    </div>
                    {type === 'INSPECTION' && (
                      <span className="shrink-0 rounded-lg bg-sand-100 px-2.5 py-1 text-sm font-semibold text-brand-900 dark:bg-sand-700/25 dark:text-sand-100">
                        من {formatJOD(settings.inspectionFeeInside)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex-1 text-muted">{text}</p>
                  <p className="mt-4 text-sm text-muted">
                    <span className="font-medium text-ink">تحتاج:</span> {needs}
                  </p>
                  <span className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 self-start font-semibold text-brand-700 group-hover:gap-2.5 dark:text-brand-200">
                    ابدأ الحجز
                    <Icon name="chevronLeft" className="h-4 w-4 transition-all" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="card p-5">
              <h2 className="text-lg">رسوم الكشف</h2>
              <p className="mt-1 text-sm text-muted">تُدفع عند الزيارة، وتخص حجز كشف الأعطال فقط.</p>
              <dl className="mt-4 divide-y divide-line text-[15px]">
                <FeeRow label="داخل عمّان" value={settings.inspectionFeeInside} />
                <FeeRow label="خارج عمّان" value={settings.inspectionFeeOutside} />
                <FeeRow label="طارئ داخل عمّان" value={settings.emergencyFeeInside} />
                <FeeRow label="طارئ خارج عمّان" value={settings.emergencyFeeOutside} />
              </dl>
              {settings.emergencyNote && <p className="mt-3 text-sm text-muted">{settings.emergencyNote}</p>}
              <p className="mt-3 text-sm text-muted">الدهان والبناء والأعمال المعدنية: نزورك ونعطيك عرض سعر مكتوب.</p>
            </section>

            <section className="card p-5">
              <h2 className="text-lg">كيف تُحدَّد المواعيد</h2>
              <ul className="mt-3 space-y-2.5 text-[15px] text-muted">
                <li>
                  أيام العمل: <span className="text-ink">{days}</span>
                </li>
                <li>
                  من <span className="text-ink">{formatSlot(settings.workStart)}</span> حتى{' '}
                  <span className="text-ink">{formatSlot(settings.workEnd)}</span>
                </li>
                <li>
                  نترك <span className="ltr text-ink">{settings.bookingGapHours}</span> ساعات على الأقل بين كل موعد وآخر، لذلك
                  تظهر الأوقات المحجوزة والقريبة منها معطّلة في الجدول.
                </li>
                <li>
                  يمكنك الحجز حتى <span className="ltr text-ink">{settings.maxDaysAhead}</span> يومًا مقدمًا.
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-line bg-subtle p-5">
              <h2 className="text-lg">شركة أو مصنع؟</h2>
              <p className="mt-1 text-sm text-muted">عقود صيانة سنوية وطلبات صيانة عاجلة للمنشآت.</p>
              <Link to="/corporate" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-200">
                خدمات الشركات <Icon name="chevronLeft" className="h-4 w-4" />
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function FeeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold">
        {formatJOD(value)}
      </dd>
    </div>
  );
}
