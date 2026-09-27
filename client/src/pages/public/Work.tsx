import { ButtonA, ButtonLink, Icon, PageHeader } from '../../components/ui';
import { WorkFigure } from '../../components/work/WorkFigure';
import { useSite } from '../../context/SiteContext';
import { waLink } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';
import { SPECIALTIES, WORKS } from '../../lib/works';

export default function Work() {
  useDocumentTitle('أعمالنا');
  const { settings } = useSite();
  const [first, second, third, ...rest] = WORKS;

  return (
    <>
      <PageHeader
        eyebrow="أعمالنا"
        title="مشاريع نفّذناها"
        description="مطابخ، تصميم داخلي، وبناء وتشطيب من الهيكل حتى التسليم. كل مشروع يبدأ بكشف على الموقع وعرض سعر مكتوب."
      />

      <section className="container py-12 md:py-16">
        <div className="grid gap-x-8 gap-y-12 md:grid-cols-12">
          <WorkFigure work={first} eager ratio="aspect-[4/3]" className="md:col-span-7" />
          <WorkFigure work={second} eager ratio="aspect-[4/5]" className="md:col-span-5" />
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-12 md:mt-16 md:grid-cols-12" data-reveal-group>
          <WorkFigure work={third} ratio="aspect-[4/5]" className="md:col-span-6" />
          <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 md:col-span-6">
            {rest.map((w) => (
              <WorkFigure key={w.src} work={w} ratio="aspect-[3/4]" />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-subtle" data-reveal>
        <div className="container py-12 md:py-14">
          <p className="eyebrow">تخصصاتنا</p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {SPECIALTIES.map((t) => (
              <li key={t} className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container py-12 md:py-16" data-reveal>
        <div className="grid gap-8 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <h2 className="text-2xl md:text-3xl">عندك مشروع مشابه؟</h2>
            <p className="mt-3 max-w-prose text-muted">احجز كشفًا على الموقع، أو أرسل لنا صورًا للمكان على واتساب ونقترح عليك الحل المناسب.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:col-span-5 md:justify-end">
            <ButtonLink to="/bookings/inspection" size="lg">
              احجز كشفًا
            </ButtonLink>
            <ButtonA
              href={waLink(settings.whatsappNumber, 'مرحبًا، أريد الاستفسار عن مشروع')}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="lg"
            >
              <Icon name="whatsapp" /> واتساب
            </ButtonA>
          </div>
        </div>
      </section>
    </>
  );
}
