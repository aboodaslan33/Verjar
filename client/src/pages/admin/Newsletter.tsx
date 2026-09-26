import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, Panel } from '../../components/admin/ui';
import { Alert, Button, EmptyState, Input, Select, Skeleton, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatDate } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type CtaKind = 'none' | 'product' | 'bookings' | 'corporate' | 'store';

type Campaign = {
  id: string;
  subject: string;
  ctaKind: CtaKind;
  status: 'SENDING' | 'DONE' | 'FAILED';
  recipients: number;
  sent: number;
  failed: number;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
  createdBy: { name: string } | null;
};

type Overview = { enabled: boolean; from: string | null; subscribers: number; campaigns: Campaign[] };
type ProductOption = { id: string; name: string; visible: boolean };

const CTA_OPTIONS: { value: CtaKind; label: string }[] = [
  { value: 'none', label: 'بدون زر' },
  { value: 'product', label: 'منتج من المتجر' },
  { value: 'bookings', label: 'صفحة الحجوزات (خدمة جديدة)' },
  { value: 'corporate', label: 'خدمات الشركات' },
  { value: 'store', label: 'المتجر' },
];

const STATUS: Record<Campaign['status'], { label: string; className: string }> = {
  SENDING: { label: 'قيد الإرسال', className: 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200' },
  DONE: { label: 'أُرسلت', className: 'bg-success/10 text-success' },
  FAILED: { label: 'متوقفة', className: 'bg-danger/10 text-danger' },
};

export default function Newsletter() {
  useDocumentTitle('النشرة البريدية');
  const [params] = useSearchParams();
  const { data, loading, reload } = useAdminQuery(() => api.get<Overview>('/admin/newsletter'), []);
  const products = useAdminQuery(() => api.get<Paged<ProductOption>>('/admin/store/products', { pageSize: 100 }), []);
  const m = useMutation();

  const initialProduct = params.get('product');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ctaKind, setCtaKind] = useState<CtaKind>(initialProduct ? 'product' : 'none');
  const [productId, setProductId] = useState(initialProduct ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  // قالب جاهز عند الإعلان عن منتج من صفحة المنتج
  useEffect(() => {
    if (!initialProduct || !products.data || subject) return;
    const p = products.data.items.find((x) => x.id === initialProduct);
    if (p) {
      setSubject(`منتج جديد: ${p.name}`);
      setBody(`يسعدنا نخبرك إنه صار عنا منتج جديد بالمتجر: ${p.name}.\n\nتقدر تشوف التفاصيل والسعر وتطلبه مباشرة من الموقع.`);
    }
  }, [initialProduct, products.data, subject]);

  // متابعة العدادات أثناء الإرسال
  const sending = data?.campaigns.some((c) => c.status === 'SENDING');
  useEffect(() => {
    if (!sending) return;
    const t = window.setInterval(() => void reload(), 2500);
    return () => window.clearInterval(t);
  }, [sending, reload]);

  const payload = () => ({ subject, body, ctaKind, productId: ctaKind === 'product' ? productId || null : null });
  const fe = m.fieldErrors;

  async function doPreview() {
    const r = await m.run('preview', () => api.post<{ html: string }>('/admin/newsletter/preview', payload()));
    if (r) setPreview(r.html);
  }

  async function doTest() {
    await m.run('test', () => api.post<{ sentTo: string }>('/admin/newsletter/test', payload()), 'أُرسلت نسخة تجريبية إلى بريدك');
  }

  async function doSend() {
    const r = await m.run('send', () => api.post<Campaign>('/admin/newsletter', payload()), 'بدأ الإرسال');
    setConfirm(false);
    if (r) {
      setSubject('');
      setBody('');
      setPreview(null);
      void reload();
    }
  }

  return (
    <AdminPage title="النشرة البريدية" description="رسالة موحّدة لكل العملاء المسجّلين: منتج جديد، خدمة جديدة، أو إعلان.">
      {loading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            {!data.enabled && (
              <Alert tone="warn" title="البريد غير مفعّل">
                أضف متغيرات SMTP على خادم الـ API (SMTP_HOST و SMTP_USER و SMTP_PASS) ثم أعد النشر. يمكنك كتابة الرسالة ومعاينتها الآن.
              </Alert>
            )}
            <Panel title="رسالة جديدة" actions={<span className="text-sm text-muted">المشتركون: <b className="text-ink">{data.subscribers}</b></span>}>
              <div className="space-y-4">
                <Input label="العنوان" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} error={fe.subject} placeholder="مثال: خدمة جديدة — عزل الأسطح" />
                <Textarea
                  label="نص الرسالة"
                  rows={7}
                  value={body}
                  maxLength={5000}
                  onChange={(e) => setBody(e.target.value)}
                  error={fe.body}
                  hint="سطر فارغ يفصل الفقرات. تبدأ الرسالة تلقائيًا بـ «مرحبًا» واسم العميل."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="زر في الرسالة" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as CtaKind)}>
                    {CTA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  {ctaKind === 'product' && (
                    <Select label="المنتج" value={productId} onChange={(e) => setProductId(e.target.value)} error={fe.productId}>
                      <option value="">اختر المنتج</option>
                      {products.data?.items
                        .filter((p) => p.visible)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button variant="outline" onClick={doPreview} loading={m.pending === 'preview'}>
                    معاينة
                  </Button>
                  <Button variant="outline" onClick={doTest} loading={m.pending === 'test'} disabled={!data.enabled}>
                    إرسال تجربة لبريدي
                  </Button>
                  <Button onClick={() => setConfirm(true)} disabled={!data.enabled || !data.subscribers || sending || m.busy} className="ms-auto">
                    إرسال لكل المشتركين
                  </Button>
                </div>
                {sending && <p className="text-sm text-muted">هناك حملة قيد الإرسال. الإرسال التالي متاح بعد انتهائها.</p>}
              </div>
            </Panel>

            <Panel title="الحملات السابقة" bodyClassName="p-0">
              {data.campaigns.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="لا توجد حملات بعد" description="أول رسالة ترسلها ستظهر هنا مع عدد من وصلتهم." />
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {data.campaigns.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.subject}</p>
                        <p className="text-sm text-muted">
                          {formatDate(c.createdAt, true)}
                          {c.createdBy && <> · {c.createdBy.name}</>}
                        </p>
                        {c.lastError && c.failed > 0 && <p className="mt-1 text-xs text-danger">{c.lastError}</p>}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted">
                          <span className="ltr">
                            {c.sent}/{c.recipients}
                          </span>
                          {c.failed > 0 && <span className="text-danger"> · فشل {c.failed}</span>}
                        </span>
                        <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS[c.status].className)}>{STATUS[c.status].label}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="lg:col-span-2">
            <Panel title="المعاينة" className="lg:sticky lg:top-20">
              {preview ? (
                <iframe title="معاينة الرسالة" srcDoc={preview} sandbox="" className="h-[560px] w-full rounded-xl border border-line bg-white" />
              ) : (
                <p className="text-sm text-muted">اكتب الرسالة واضغط «معاينة» لرؤيتها كما ستصل للعميل.</p>
              )}
            </Panel>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="إرسال لكل المشتركين؟"
        confirmLabel={`إرسال إلى ${data?.subscribers ?? 0}`}
        tone="primary"
        loading={m.pending === 'send'}
        onConfirm={doSend}
        onClose={() => setConfirm(false)}
      >
        ستصل الرسالة «{subject || 'بدون عنوان'}» إلى كل العملاء المسجّلين الذين لديهم بريد ووافقوا على الاستلام. لا يمكن التراجع بعد البدء.
      </ConfirmDialog>
    </AdminPage>
  );
}
