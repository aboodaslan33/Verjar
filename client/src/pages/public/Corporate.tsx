import { ButtonLink, ErrorState, Icon, PageHeader, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import type { CorporateService, CorporateType } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

const OPTIONS: {
  type: CorporateType;
  slug: string;
  title: string;
  lead: string;
  points: string[];
  cta: string;
}[] = [
  {
    type: 'ANNUAL',
    slug: 'annual',
    title: 'عقد صيانة سنوي',
    lead: 'للمصانع والمستودعات والمباني التجارية التي تحتاج صيانة دورية مجدولة وجاهزية دائمة لتدقيقات GMP وISO.',
    points: [
      'زيارات دورية بجدول متفق عليه، وتقرير مكتوب بعد كل زيارة',
      'مسؤول واحد من طرفنا يتابع المنشأة طوال مدة العقد',
      'أولوية في الاستجابة للأعطال خلال مدة العقد',
    ],
    cta: 'اطلب عرض عقد سنوي',
  },
  {
    type: 'URGENT',
    slug: 'urgent',
    title: 'طلب صيانة عاجل',
    lead: 'عطل يؤثر على العمل أو خط الإنتاج الآن. نحدد معك إمكانية العمل أثناء التشغيل أو إيقافه جزئيًا.',
    points: [
      'يصل الطلب لفريق الشركات مباشرة ويُتصل بكم لتحديد وقت الوصول',
      'نعمل حول الإنتاج قدر الإمكان لتقليل التوقف',
      'السجل التجاري والرخصة اختياريان في الطلب العاجل',
    ],
    cta: 'أرسل طلبًا عاجلًا',
  },
];

export default function Corporate() {
  useDocumentTitle('خدمات الشركات والمصانع');
  const { data, error, loading, reload } = useAsync(() => api.get<CorporateService[]>('/corporate/services'), [], 'corporate/services');

  return (
    <>
      <PageHeader
        eyebrow="الشركات والمصانع"
        title="صيانة المنشآت بعقد سنوي أو عند الحاجة"
        description="نعمل مع المصانع والمستودعات والمباني التجارية في عمّان والمحافظات: المرافق، الكهرباء، الأرضيات الإيبوكسي، الجدران، وخطوط الإنتاج — مع الالتزام بمتطلبات GMP وISO."
      />

      <div className="container py-10 md:py-14">
        <div className="grid gap-5 lg:grid-cols-2" data-reveal-group>
          {OPTIONS.map((o) => {
            const services = data?.filter((s) => s.kind === o.type) ?? [];
            return (
              <section key={o.type} className="card flex min-w-0 flex-col p-5 md:p-7">
                <p className="eyebrow">{o.type === 'ANNUAL' ? 'تعاقد' : 'استجابة سريعة'}</p>
                <h2 className="mt-1 text-2xl">{o.title}</h2>
                <p className="mt-2 text-muted">{o.lead}</p>

                <ul className="mt-5 space-y-2 text-[15px]">
                  {o.points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-300" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex-1 border-t border-line pt-5">
                  <h3 className="text-sm font-semibold text-muted">الخدمات المشمولة</h3>
                  {loading ? (
                    <div className="mt-3 flex flex-wrap gap-2" role="status" aria-label="جاري تحميل الخدمات">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-28 rounded-lg" />
                      ))}
                    </div>
                  ) : error ? (
                    <p className="mt-3 text-sm text-muted">تعذر تحميل قائمة الخدمات — ستظهر في النموذج.</p>
                  ) : (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {services.map((s) => (
                        <li key={s.id} className="rounded-lg border border-line bg-subtle px-3 py-1.5 text-sm">
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <ButtonLink to={`/corporate/${o.slug}`} size="lg" block className="mt-6 h-auto min-h-12 whitespace-normal py-3 text-center">
                  {o.cta}
                  <Icon name="chevronLeft" className="h-4 w-4" />
                </ButtonLink>
              </section>
            );
          })}
        </div>

        {error && (
          <div className="mt-6">
            <ErrorState message={error.message} onRetry={reload} />
          </div>
        )}

        <section className="mt-10 grid gap-6 rounded-2xl border border-line bg-subtle p-6 md:grid-cols-3 md:p-8" data-reveal-group>
          <div>
            <h2 className="text-lg">ما الذي نحتاجه منكم</h2>
            <p className="mt-1 text-sm text-muted">لطلب العقد السنوي نطلب نسخة من السجل التجاري ورخصة المنشأة (صورة أو PDF).</p>
          </div>
          <div>
            <h2 className="text-lg">بعد الإرسال</h2>
            <p className="mt-1 text-sm text-muted">يصل الطلب فورًا لفريق الشركات، ونتواصل مع مدير المنشأة لترتيب زيارة تقييم.</p>
          </div>
          <div>
            <h2 className="text-lg">المتابعة</h2>
            <p className="mt-1 text-sm text-muted">عروض الأسعار والعقود والدفعات تظهر في حسابك على الموقع.</p>
          </div>
        </section>
      </div>
    </>
  );
}
