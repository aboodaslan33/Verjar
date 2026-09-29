import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PlanBadge, VerifiedMark } from '../../components/market/Badges';
import { MessageThread } from '../../components/market/MessageThread';
import { StarInput, Stars } from '../../components/market/Stars';
import { Alert, Breadcrumbs, Button, ButtonLink, EmptyState, ErrorState, Icon, Modal, PageLoader, Tag, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import { QUOTE_STATUS_LABEL, RFQ_STATUS_LABEL, leadTimeText, rfqTone, type MarketFile, type QuoteStatus, type RfqStatus } from '../../lib/market';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type Quote = {
  id: string;
  vendorId: string;
  unitPrice: number;
  quantity: number;
  total: number;
  leadTimeDays: number | null;
  warranty: string | null;
  originCountry: string | null;
  brand: string | null;
  specs: string | null;
  paymentTerms: string | null;
  validUntil: string | null;
  notes: string | null;
  fileUrl: string | null;
  status: QuoteStatus;
  createdAt: string;
  vendor: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    verified: boolean;
    city: string | null;
    isHouse: boolean;
    plan: { code: string; badge: string | null } | null;
    rating: { average: number; count: number } | null;
    contact: { phone: string | null; email: string | null; whatsapp: string | null } | null;
  };
};

type Rfq = {
  id: string;
  code: string;
  title: string;
  status: RfqStatus;
  companyName: string;
  city: string | null;
  createdAt: string;
  neededBy: string | null;
  budget: number | null;
  notes: string | null;
  attachments: MarketFile[];
  items: { id: string; name: string; quantity: number; unit: string; specs: string | null; brand: string | null }[];
  category: { name: string } | null;
  product: { name: string; slug: string } | null;
  quotes: Quote[];
  acceptedQuoteId: string | null;
  supplierCount: number;
  respondedCount: number;
  conversations: { vendorId: string; lastAt: string; messages: number; unread: boolean }[];
  events: { action: string; actorType: string; createdAt: string; note: string | null }[];
  canReview: boolean;
  open: boolean;
};

const EVENT_LABEL: Record<string, string> = {
  created: 'أرسلت الطلب',
  distributed: 'أُرسل الطلب للموردين',
  viewed: 'مورد اطّلع على الطلب',
  quoted: 'وصل عرض سعر',
  quote_updated: 'مورد حدّث عرضه',
  quote_withdrawn: 'مورد سحب عرضه',
  declined: 'مورد اعتذر عن الطلب',
  negotiating: 'بدأ التفاوض',
  accepted: 'اخترت عرضًا',
  closed: 'اكتمل الطلب',
  cancelled: 'أُلغي الطلب',
  reviewed: 'قيّمت المورد',
  admin_updated: 'تحديث من الإدارة',
  delivery_order: 'أُنشئ طلب توصيل',
};

/** طلب عرض السعر للعميل: البنود، مقارنة العروض، اختيار العرض، المراسلة والتقييم */
export default function RfqDetail() {
  const { id = '' } = useParams();
  const q = useAsync(() => api.get<Rfq>(`/market/rfqs/${id}`), [id], `account/rfq/${id}`);
  useDocumentTitle(q.data?.code ?? 'طلب عرض سعر');
  if (q.loading && !q.data) return <PageLoader />;
  if (q.error || !q.data) {
    return (
      <div className="container max-w-xl py-16">
        {q.error?.status === 404 ? (
          <EmptyState title="الطلب غير موجود" action={<ButtonLink to="/account?tab=rfqs">طلباتي</ButtonLink>} />
        ) : (
          <ErrorState message={q.error?.message ?? ''} onRetry={q.reload} />
        )}
      </div>
    );
  }
  return <RfqView rfq={q.data} reload={q.reload} />;
}

function RfqView({ rfq, reload }: { rfq: Rfq; reload: () => void }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [accepting, setAccepting] = useState<Quote | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chatVendor = params.get('vendor') ?? rfq.quotes[0]?.vendorId ?? null;
  const setChat = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('vendor', v);
    setParams(next, { replace: true });
    setTimeout(() => document.getElementById('messages')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  const active = rfq.quotes.filter((x) => x.status !== 'WITHDRAWN');
  const min = active.length ? Math.min(...active.map((x) => x.total)) : null;
  const fastest = active.filter((x) => x.leadTimeDays != null).length ? Math.min(...active.filter((x) => x.leadTimeDays != null).map((x) => x.leadTimeDays!)) : null;
  const accepted = rfq.quotes.find((x) => x.id === rfq.acceptedQuoteId);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(msg);
      reload();
      return true;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'تعذر تنفيذ العملية');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rows: { label: string; render: (x: Quote) => React.ReactNode }[] = [
    { label: 'الإجمالي', render: (x) => <span className={cx('font-display text-lg font-bold tabular-nums', x.total === min && active.length > 1 && 'text-[#1a7f4b]')}>{formatJOD(x.total)}{x.total === min && active.length > 1 && <span className="ms-1 text-xs font-semibold">الأقل</span>}</span> },
    { label: 'سعر الوحدة', render: (x) => <span className="tabular-nums">{formatJOD(x.unitPrice)}</span> },
    { label: 'الكمية', render: (x) => <span className="num">{x.quantity}</span> },
    { label: 'مدة التوريد', render: (x) => <span className={cx(x.leadTimeDays === fastest && active.length > 1 && 'font-semibold text-[#1a7f4b]')}>{leadTimeText(x.leadTimeDays) ?? '—'}</span> },
    { label: 'الضمان', render: (x) => x.warranty ?? '—' },
    { label: 'بلد المنشأ', render: (x) => x.originCountry ?? '—' },
    { label: 'الماركة', render: (x) => x.brand ?? '—' },
    { label: 'المواصفات', render: (x) => (x.specs ? <span className="whitespace-pre-line text-sm">{x.specs}</span> : '—') },
    { label: 'شروط الدفع', render: (x) => x.paymentTerms ?? '—' },
    { label: 'صلاحية العرض', render: (x) => (x.validUntil ? <span className={cx(new Date(x.validUntil) < new Date() && 'text-danger')}>{formatDate(x.validUntil)}</span> : '—') },
    { label: 'ملاحظات', render: (x) => (x.notes ? <span className="whitespace-pre-line text-sm">{x.notes}</span> : '—') },
    { label: 'ملف العرض', render: (x) => (x.fileUrl ? <a href={x.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold underline"><Icon name="download" className="h-4 w-4" /> PDF</a> : '—') },
  ];

  return (
    <div className="container py-6 md:py-10">
      <Breadcrumbs items={[{ to: '/account?tab=rfqs', label: 'عروض الأسعار' }, { label: rfq.code }]} className="mb-5" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ltr text-sm font-semibold text-muted">{rfq.code}</p>
          <h1 className="mt-1 text-[1.6rem] md:text-[2rem]">{rfq.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag tone={rfqTone(rfq.status)}>{RFQ_STATUS_LABEL[rfq.status]}</Tag>
            <span>{formatDate(rfq.createdAt)}</span>
            {rfq.category && <span>· {rfq.category.name}</span>}
            <span>
              · أُرسل إلى <span className="num">{rfq.supplierCount}</span> موردين، ردّ <span className="num">{rfq.respondedCount}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rfq.status === 'AWARDED' && (
            <Button size="sm" loading={busy} onClick={() => act(() => api.post(`/market/rfqs/${rfq.id}/complete`), 'تم تأكيد استلام التوريد')}>
              <Icon name="check" className="h-4 w-4" /> استلمت التوريد
            </Button>
          )}
          {rfq.open && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancelOpen(true)}>
              إلغاء الطلب
            </Button>
          )}
        </div>
      </div>
      {err && (
        <Alert tone="error" className="mt-4">
          {err}
        </Alert>
      )}

      {accepted && (
        <section className="mt-6 rounded-2xl border-2 border-[#1a7f4b]/40 bg-[#1a7f4b]/5 p-4 sm:p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="check" className="h-5 w-5 text-[#1a7f4b]" /> اخترت عرض {accepted.vendor.isHouse ? 'FARJAR' : accepted.vendor.name} بقيمة {formatJOD(accepted.total)}
          </p>
          {accepted.vendor.contact ? (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {accepted.vendor.contact.phone && (
                <a href={`tel:${accepted.vendor.contact.phone}`} className="ltr underline">
                  {accepted.vendor.contact.phone}
                </a>
              )}
              {accepted.vendor.contact.email && (
                <a href={`mailto:${accepted.vendor.contact.email}`} className="ltr underline">
                  {accepted.vendor.contact.email}
                </a>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">تابع مع المورد من خلال الرسائل أدناه.</p>
          )}
        </section>
      )}

      {/* ——— مقارنة العروض ——— */}
      <section className="mt-8" aria-labelledby="cmp-title">
        <h2 id="cmp-title" className="text-xl">
          مقارنة العروض {active.length > 0 && <span className="num text-muted">({active.length})</span>}
        </h2>
        {active.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-8 text-center text-muted">
            <Icon name="clock" className="mx-auto h-7 w-7" />
            <p className="mt-2">بانتظار عروض الموردين. نرسل لك إشعارًا عند وصول كل عرض.</p>
          </div>
        ) : (
          <div className="scroll-x mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[40rem] border-collapse text-[15px]">
              <thead>
                <tr className="border-b border-line align-top">
                  <th scope="col" className="sticky start-0 z-10 w-36 bg-subtle p-3 text-start text-xs font-semibold text-muted">
                    المورد
                  </th>
                  {active.map((x) => (
                    <th key={x.id} scope="col" className={cx('min-w-[12rem] p-3 text-start', x.id === rfq.acceptedQuoteId && 'bg-[#1a7f4b]/10')}>
                      <Link to={`/store/vendor/${x.vendor.slug}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                        <span className="truncate">{x.vendor.isHouse ? 'FARJAR' : x.vendor.name}</span>
                        {(x.vendor.verified || x.vendor.isHouse) && <VerifiedMark />}
                        {!x.vendor.isHouse && <PlanBadge plan={x.vendor.plan} />}
                      </Link>
                      <span className="mt-1 flex items-center gap-2 text-xs font-normal text-muted">
                        {x.vendor.city}
                        {x.vendor.rating && (
                          <span className="inline-flex items-center gap-1">
                            <Stars value={x.vendor.rating.average} className="[&_svg]:h-3 [&_svg]:w-3" /> ({x.vendor.rating.count})
                          </span>
                        )}
                      </span>
                      {x.status !== 'SUBMITTED' && (
                        <span className="mt-1 block">
                          <Tag tone={x.status === 'ACCEPTED' ? 'success' : 'neutral'}>{QUOTE_STATUS_LABEL[x.status]}</Tag>
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="sticky start-0 z-10 bg-subtle p-3 text-start text-xs font-semibold text-muted">
                      {r.label}
                    </th>
                    {active.map((x) => (
                      <td key={x.id} className={cx('p-3', x.id === rfq.acceptedQuoteId && 'bg-[#1a7f4b]/5')}>
                        {r.render(x)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="sticky start-0 z-10 bg-subtle p-3" />
                  {active.map((x) => (
                    <td key={x.id} className="space-y-2 p-3">
                      {rfq.open && x.status === 'SUBMITTED' && (
                        <Button size="sm" block onClick={() => setAccepting(x)}>
                          اختيار العرض
                        </Button>
                      )}
                      <Button size="sm" variant="outline" block onClick={() => setChat(x.vendorId)}>
                        <Icon name="mail" className="h-4 w-4" /> مراسلة
                        {rfq.conversations.find((c) => c.vendorId === x.vendorId)?.unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="رسائل جديدة" />}
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        {/* ——— الرسائل ——— */}
        <section id="messages" className="scroll-mt-28 lg:col-span-7" aria-labelledby="msg-title">
          <h2 id="msg-title" className="text-xl">
            الرسائل
          </h2>
          {rfq.quotes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">تستطيع مراسلة الموردين بعد وصول عروضهم.</p>
          ) : (
            <>
              <div className="scroll-x mt-3 flex gap-2">
                {rfq.quotes.map((x) => (
                  <button
                    key={x.vendorId}
                    type="button"
                    onClick={() => setChat(x.vendorId)}
                    aria-pressed={chatVendor === x.vendorId}
                    className={cx('shrink-0 rounded-full border px-3 py-1.5 text-sm', chatVendor === x.vendorId ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface')}
                  >
                    {x.vendor.isHouse ? 'FARJAR' : x.vendor.name}
                  </button>
                ))}
              </div>
              {chatVendor && (
                <div className="mt-3">
                  <MessageThread
                    key={chatVendor}
                    path={`/market/rfqs/${rfq.id}/messages/${chatVendor}`}
                    me="CUSTOMER"
                    disabled={rfq.status === 'CANCELLED' ? 'الطلب ملغي' : null}
                    hint="التواصل عبر المنصة يحفظ حقوقك. أرقام الهواتف والبريد تُخفى حتى تختار عرضًا."
                  />
                </div>
              )}
            </>
          )}
          {rfq.canReview && accepted && <ReviewForm rfqId={rfq.id} vendorName={accepted.vendor.isHouse ? 'FARJAR' : accepted.vendor.name} onDone={reload} />}
        </section>

        {/* ——— تفاصيل الطلب ——— */}
        <aside className="space-y-6 lg:col-span-5">
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-lg">البنود</h2>
            <ol className="mt-3 divide-y divide-line">
              {rfq.items.map((it, i) => (
                <li key={it.id} className="py-2.5">
                  <p className="font-semibold">
                    {i + 1}. {it.name} <span className="font-normal text-muted">× <span className="num">{Number(it.quantity)}</span> {it.unit}</span>
                  </p>
                  {(it.brand || it.specs) && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{[it.brand, it.specs].filter(Boolean).join(' — ')}</p>}
                </li>
              ))}
            </ol>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              {rfq.neededBy && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">تاريخ الحاجة</dt>
                  <dd>{formatDate(rfq.neededBy)}</dd>
                </div>
              )}
              {rfq.budget != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">الميزانية (لا تظهر للموردين)</dt>
                  <dd className="tabular-nums">{formatJOD(rfq.budget)}</dd>
                </div>
              )}
              {rfq.product && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">من صفحة المنتج</dt>
                  <dd>
                    <Link to={`/store/${rfq.product.slug}`} className="underline">
                      {rfq.product.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {rfq.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-subtle p-3 text-sm">{rfq.notes}</p>}
            {rfq.attachments.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {rfq.attachments.map((f, i) => (
                  <li key={i}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                      <Icon name={f.kind === 'IMAGE' ? 'image' : 'file'} className="h-4 w-4 text-muted" /> <span className="truncate">{f.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-lg">سجل الطلب</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {rfq.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{EVENT_LABEL[e.action] ?? e.action}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDate(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <Modal
        open={Boolean(accepting)}
        onClose={() => setAccepting(null)}
        title="اختيار هذا العرض؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAccepting(null)}>
              تراجع
            </Button>
            <Button loading={busy} onClick={async () => accepting && (await act(() => api.post(`/market/rfqs/${rfq.id}/quotes/${accepting.id}/accept`), 'تم اختيار العرض')) && setAccepting(null)}>
              تأكيد الاختيار
            </Button>
          </>
        }
      >
        {accepting && (
          <p className="leading-relaxed">
            ستختار عرض <b>{accepting.vendor.isHouse ? 'FARJAR' : accepting.vendor.name}</b> بقيمة <b>{formatJOD(accepting.total)}</b>. يُبلَّغ المورد وتظهر لكما بيانات التواصل، وتُغلق العروض الأخرى.
          </p>
        )}
      </Modal>
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء طلب عرض السعر؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              تراجع
            </Button>
            <Button variant="danger" loading={busy} onClick={async () => (await act(() => api.post(`/market/rfqs/${rfq.id}/cancel`, {}), 'تم إلغاء الطلب')) && setCancelOpen(false)}>
              إلغاء الطلب
            </Button>
          </>
        }
      >
        <p>يُبلَّغ الموردون بالإلغاء ولن تستقبل عروضًا جديدة.</p>
      </Modal>
    </div>
  );
}

function ReviewForm({ rfqId, vendorName, onDone }: { rfqId: string; vendorName: string; onDone: () => void }) {
  const { toast } = useToast();
  const [r, setR] = useState({ quality: 0, delivery: 0, commitment: 0, communication: 0, overall: 0 });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = Object.values(r).every((v) => v > 0);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/market/rfqs/${rfqId}/review`, { ...r, comment: comment.trim() || null });
      toast('شكرًا لتقييمك');
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'تعذر الإرسال');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:p-5">
      <h3 className="text-lg">قيّم {vendorName}</h3>
      <p className="mt-1 text-sm text-muted">تقييمك يساعد الشركات الأخرى، ويظهر على صفحة المورد كصفقة موثّقة.</p>
      <div className="mt-4 space-y-2">
        <StarInput label="جودة المنتج" value={r.quality} onChange={(v) => setR((s) => ({ ...s, quality: v }))} />
        <StarInput label="سرعة التوريد" value={r.delivery} onChange={(v) => setR((s) => ({ ...s, delivery: v }))} />
        <StarInput label="الالتزام" value={r.commitment} onChange={(v) => setR((s) => ({ ...s, commitment: v }))} />
        <StarInput label="التواصل" value={r.communication} onChange={(v) => setR((s) => ({ ...s, communication: v }))} />
        <StarInput label="التقييم العام" value={r.overall} onChange={(v) => setR((s) => ({ ...s, overall: v }))} />
      </div>
      <Textarea label="تعليق" optional rows={3} wrapperClassName="mt-4" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <Button className="mt-4" loading={busy} disabled={!ready} onClick={submit}>
        إرسال التقييم
      </Button>
    </section>
  );
}
