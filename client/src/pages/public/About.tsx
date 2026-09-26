import { ButtonLink, PageHeader } from '../../components/ui';
import { useSite } from '../../context/SiteContext';
import { formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

export default function About() {
  useDocumentTitle('من نحن');
  const { settings } = useSite();
  const paragraphs = settings.aboutContent
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const steps = [
    {
      t: 'تحجز موعدًا',
      d: 'تختار نوع العمل والموعد المناسب من الموقع، وترفق صورًا للمشكلة إن وجدت، ثم ترسل الطلب لنا على واتساب برسالة جاهزة.',
    },
    {
      t: 'نكشف على الموقع',
      d: `فني مختص يعاين المشكلة ويأخذ القياسات. رسوم الكشف الفني ${formatJOD(settings.inspectionFeeNormal)} لكل المحافظات، و${formatJOD(settings.inspectionFeeUrgent)} للعاجل و${formatJOD(settings.inspectionFeeEmergency)} للطارئ.`,
    },
    {
      t: 'تستلم عرض سعر مكتوبًا',
      d: 'يوضح العرض المواد والكميات ومدة التنفيذ والسعر. تراه على صفحتك في الموقع، ولا نبدأ قبل موافقتك.',
    },
    {
      t: 'ننفذ ونسلّم',
      d: 'نلتزم بموعد البدء والتسليم المتفق عليه، ومسؤول واحد يتابع معك حتى استلام العمل.',
    },
  ];

  return (
    <>
      <PageHeader eyebrow="من نحن" title={settings.aboutTitle} />

      <section className="container py-10 md:py-14" data-reveal>
        <div className="max-w-prose space-y-5 text-lg leading-loose">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className={i === 0 ? 'text-ink' : 'text-muted'}>
                {p}
              </p>
            ))
          ) : (
            <p className="text-muted">
              فريق أردني يعمل في البناء والصيانة والدهان والأعمال المعدنية للبيوت والشركات.
            </p>
          )}
        </div>
      </section>

      <section className="border-y border-line bg-surface" data-reveal>
        <div className="container py-12 md:py-16">
          <p className="eyebrow">كيف نعمل</p>
          <h2 className="mt-1 text-2xl md:text-3xl">من الحجز حتى التسليم</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.t} className="border-t-2 border-sand-300 pt-4 dark:border-sand-600">
                <span className="ltr text-sm font-bold text-sand-600 dark:text-sand-300">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-2 text-lg">{s.t}</h3>
                <p className="mt-1 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container py-12 md:py-16" data-reveal>
        <div className="grid gap-8 md:grid-cols-12 md:items-center">
          <div className="md:col-span-8">
            <h2 className="text-2xl">أين نعمل</h2>
            <p className="mt-3 max-w-prose text-muted">
              مقرنا في عمّان، ونخدم كل المحافظات. رسوم الكشف الفني ثابتة لكل المحافظات:{' '}
              <span className="ltr">{formatJOD(settings.inspectionFeeNormal)}</span>. والكشف على أعمال الدهان{' '}
              <span className="ltr">{formatJOD(settings.paintingFeeInside)}</span> داخل عمّان و
              <span className="ltr">{formatJOD(settings.paintingFeeOutside)}</span> خارجها. أما سعر العمل نفسه فيُحدد بعد الكشف
              حسب حجمه والمواد المطلوبة.
            </p>
            <p className="mt-3 text-muted">ساعات العمل: {settings.workingHoursText}</p>
          </div>
          <div className="flex flex-col gap-3 md:col-span-4">
            <ButtonLink to="/bookings/inspection" size="lg" block>
              احجز كشفًا
            </ButtonLink>
            <ButtonLink to="/contact" variant="outline" size="lg" block>
              تواصل معنا
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
