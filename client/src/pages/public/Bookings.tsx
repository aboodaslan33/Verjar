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
        <div className="grid gap-10 lg:grid-cols-[1fr_21rem] lg:gap-14">
          <ul className="border-t border-line" data-reveal-group>
            {TYPES.map(({ type, text, needs }, i) => (
              <li key={type} className="border-b border-line">
                <Link
                  to={`/bookings/${BOOKING_TYPE_SLUG[type]}`}
                  className="group grid grid-cols-[2.5rem_1fr_auto] items-start gap-4 py-7 md:grid-cols-[3.5rem_1fr_auto]"
                >
                  <span className="num pt-1.5 text-sm font-semibold text-muted transition-colors group-hover:text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-display text-xl font-semibold md:text-2xl">{BOOKING_TYPE_LABEL[type]}</span>
                      {(type === 'INSPECTION' || type === 'PAINTING') && (
                        <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-semibold text-ink">
                          كشف من {formatJOD(type === 'INSPECTION' ? settings.inspectionFeeNormal : settings.paintingFeeInside)}
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block max-w-xl text-[15px] leading-relaxed text-muted">{text}</span>
                    <span className="mt-3 block text-sm text-muted">
                      <span className="font-medium text-ink">تحتاج:</span> {needs}
                    </span>
                  </span>
                  <span className="mt-1 grid h-11 w-11 place-items-center rounded-full border border-line-strong transition-all duration-300 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-fg">
                    <Icon name="arrowLeft" className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start" data-reveal>
            <section className="rounded-xl bg-subtle p-5">
              <h2 className="text-lg">رسوم الكشف</h2>
              <p className="mt-1 text-sm text-muted">تُدفع عند الزيارة.</p>
              <h3 className="mt-4 text-sm font-semibold">الكشف الفني — ثابت لكل المحافظات</h3>
              <dl className="mt-1 divide-y divide-line text-[15px]">
                <FeeRow label="عادي" value={settings.inspectionFeeNormal} />
                <FeeRow label="عاجل" value={settings.inspectionFeeUrgent} />
                <FeeRow label="طارئ" value={settings.inspectionFeeEmergency} />
              </dl>
              {settings.emergencyNote && <p className="mt-2 text-sm text-muted">{settings.emergencyNote}</p>}
              <h3 className="mt-4 text-sm font-semibold">الكشف على أعمال الدهان</h3>
              <dl className="mt-1 divide-y divide-line text-[15px]">
                <FeeRow label="داخل عمّان" value={settings.paintingFeeInside} />
                <FeeRow label="خارج عمّان" value={settings.paintingFeeOutside} />
              </dl>
              <p className="mt-3 text-sm text-muted">البناء والأعمال المعدنية: نزورك ونعطيك عرض سعر مكتوب.</p>
            </section>

            <section className="rounded-xl border border-line p-5">
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

            <section className="rounded-xl bg-inverse p-5 text-inverse-fg">
              <h2 className="text-lg text-inverse-fg">شركة أو مصنع؟</h2>
              <p className="mt-1 text-sm text-inverse-fg/65">عقود صيانة سنوية وطلبات صيانة عاجلة للمنشآت.</p>
              <Link to="/corporate" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary">
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
      <dd className="font-display font-semibold">
        {formatJOD(value)}
      </dd>
    </div>
  );
}
