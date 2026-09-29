import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DetailSkeleton, Panel, StatTile } from '../../components/admin/ui';
import { MessageThread } from '../../components/market/MessageThread';
import { Alert, Button, EmptyState, ErrorState, Icon, Input, Modal, Select, SkeletonRows, Tag, Textarea } from '../../components/ui';
import { api, toFormData } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import {
  AD_STATUS_LABEL,
  AD_TYPE_LABEL,
  FEATURE_LABEL,
  INVOICE_PURPOSE_LABEL,
  PLACEMENT_LABEL,
  QUOTE_STATUS_LABEL,
  RFQ_STATUS_LABEL,
  VENDOR_STATUS_LABEL,
  leadTimeText,
  rfqTone,
  type MarketFile,
  type QuoteStatus,
  type RfqStatus,
  type VendorStatus,
} from '../../lib/market';
import { useDocumentTitle } from '../../lib/useAsync';
import { PayModal, PaymentProofModal, ProofTag, type PayableInvoice, type PaymentAccount, type ProofInput } from '../../components/market/PaymentProof';

// ───────────── ملخص السوق ─────────────

export type MarketOverview = {
  vendor: { id: string; name: string; slug: string; status: VendorStatus; rejectionReason: string | null; verified: boolean; isHouse: boolean; planStartedAt: string | null; planExpiresAt: string | null };
  plan: { id: string; code: string; name: string; price: number; maxProducts: number | null; maxUsers: number; maxRfqPerMonth: number | null; leadsIncluded: boolean; features: Record<string, boolean> } | null;
  planExpired: boolean;
  usage: { products: number; members: number; rfqQuotaLeft: number | null };
  last30: { profileViews: number; productViews: number; rfqs: number; quotes: number };
  rfqs: { total: number; newCount: number; quoted: number };
  deals: { count: number; value: number };
  rating: { average: number; count: number } | null;
  pendingInvoices: number;
};

/** حالة المورد في السوق (قيد المراجعة/مرفوض/معلّق) — تظهر أعلى اللوحة */
export function VendorStatusBanner({ o }: { o: MarketOverview | null }) {
  if (!o || o.vendor.status === 'APPROVED') return null;
  const s = o.vendor.status;
  return (
    <Alert tone={s === 'PENDING' ? 'info' : 'error'} className="mb-6" title={`حساب المورد: ${VENDOR_STATUS_LABEL[s]}`}>
      {s === 'PENDING' && 'تراجع إدارة FARJAR بيانات شركتك. يمكنك إضافة منتجاتك الآن، وتظهر في السوق وتصلك طلبات عروض الأسعار بعد الاعتماد.'}
      {s === 'REJECTED' && <>لم يُعتمد طلبك. {o.vendor.rejectionReason && <>الملاحظة: {o.vendor.rejectionReason}. </>}عدّل بياناتك من <Link to="/vendor/profile" className="underline">ملف الشركة</Link> وتواصل مع الإدارة.</>}
      {s === 'SUSPENDED' && <>حسابك معلّق مؤقتًا ولا تظهر منتجاتك. {o.vendor.rejectionReason && <>السبب: {o.vendor.rejectionReason}</>}</>}
    </Alert>
  );
}

export function MarketSummary({ o, loading }: { o: MarketOverview | null; loading: boolean }) {
  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="طلبات عروض أسعار جديدة" value={o?.rfqs.newCount ?? 0} to="/vendor/rfqs" tone={o?.rfqs.newCount ? 'brand' : 'neutral'} loading={loading} />
        <StatTile label="العروض المقدَّمة" value={o?.rfqs.quoted ?? 0} to="/vendor/rfqs?tab=quoted" loading={loading} />
        <StatTile label="الصفقات" value={formatJOD(o?.deals.value ?? 0)} sub={`${o?.deals.count ?? 0} صفقة`} loading={loading} />
        <StatTile label="مشاهدات 30 يومًا" value={(o?.last30.profileViews ?? 0) + (o?.last30.productViews ?? 0)} sub={`${o?.last30.productViews ?? 0} للمنتجات`} to="/vendor/stats" loading={loading} />
      </div>
      {o?.plan && (
        <Panel
          title={`باقتك: ${o.plan.name}`}
          className="mb-6"
          actions={
            !o.vendor.isHouse && (
              <Link to="/vendor/subscription" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
                {o.plan.code === 'BUSINESS' ? 'التجديد' : 'ترقية الباقة'}
              </Link>
            )
          }
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">المنتجات</dt>
              <dd className="mt-1 font-semibold">
                <span className="num">{o.usage.products}</span> / {o.plan.maxProducts == null ? 'غير محدود' : <span className="num">{o.plan.maxProducts}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted">طلبات عروض الأسعار المتبقية هذا الشهر</dt>
              <dd className="mt-1 font-semibold">{o.usage.rfqQuotaLeft == null ? 'غير محدود' : <span className="num">{o.usage.rfqQuotaLeft}</span>}</dd>
            </div>
            <div>
              <dt className="text-muted">ينتهي الاشتراك</dt>
              <dd className="mt-1 font-semibold">{o.vendor.planExpiresAt && Number(o.plan.price) > 0 ? formatDate(o.vendor.planExpiresAt) : '—'}</dd>
            </div>
          </dl>
          {o.pendingInvoices > 0 && (
            <p className="mt-4 text-sm">
              لديك <span className="num font-semibold">{o.pendingInvoices}</span> فواتير بانتظار الدفع —{' '}
              <Link to="/vendor/subscription" className="underline">
                الفواتير
              </Link>
            </p>
          )}
        </Panel>
      )}
    </>
  );
}

// ───────────── طلبات عروض الأسعار ─────────────

const TABS = [
  { key: 'new', label: 'جديدة' },
  { key: 'negotiating', label: 'قيد التفاوض' },
  { key: 'quoted', label: 'عروض مقدَّمة' },
  { key: 'accepted', label: 'مقبولة' },
  { key: 'closed', label: 'مغلقة' },
] as const;

type RfqRow = { id: string; code: string; title: string; city: string | null; status: RfqStatus; neededBy: string | null; createdAt: string; itemCount: number; category: { name: string } | null; myQuote: { total: number; status: QuoteStatus } | null; unread: boolean; recipientStatus: string; source: string };

export function VendorRfqs() {
  useDocumentTitle('طلبات عروض الأسعار');
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'new') as (typeof TABS)[number]['key'];
  const q = useAdminQuery(() => api.get<{ counts: Record<string, number>; items: RfqRow[] }>('/vendor/market/rfqs', { tab }), [tab]);
  return (
    <AdminPage title="طلبات عروض الأسعار" description="طلبات الشركات التي وصلتك. قدّم عرضك وتابع التفاوض عبر المنصة.">
      <div role="tablist" className="scroll-x mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'new' ? {} : { tab: t.key }, { replace: true })}
            className={cx(
              'relative shrink-0 px-3 py-2.5 text-sm font-medium after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
              tab === t.key ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
            )}
          >
            {t.label}
            {q.data && q.data.counts[t.key] > 0 && <span className="num ms-1.5 rounded-full bg-subtle px-1.5 text-xs">{q.data.counts[t.key]}</span>}
          </button>
        ))}
      </div>
      {q.error ? (
        <ErrorState message={q.error.message} onRetry={q.retry} />
      ) : q.loading ? (
        <SkeletonRows rows={4} />
      ) : !q.data?.items.length ? (
        <EmptyState title="لا توجد طلبات هنا" description={tab === 'new' ? 'تصلك طلبات الشركات هنا حسب التصنيفات التي تخدمها — مع إشعار وبريد.' : undefined} />
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((r) => (
            <li key={r.id}>
              <Link to={`/vendor/rfqs/${r.id}`} className="block rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-lift">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <span className="ltr font-semibold">{r.code}</span>
                      {r.source === 'DIRECT' && <Tag tone="brand">طلب مباشر</Tag>}
                      {r.unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="رسائل جديدة" />}
                    </p>
                    <p className="mt-1 font-semibold">
                      {r.title}
                      {r.itemCount > 1 && <span className="font-normal text-muted"> + {r.itemCount - 1} بنود</span>}
                    </p>
                  </div>
                  {r.myQuote ? <Tag tone={r.myQuote.status === 'ACCEPTED' ? 'success' : r.myQuote.status === 'SUBMITTED' ? 'brand' : 'neutral'}>عرضك {formatJOD(r.myQuote.total)} · {QUOTE_STATUS_LABEL[r.myQuote.status]}</Tag> : <Tag tone={rfqTone(r.status)}>{RFQ_STATUS_LABEL[r.status]}</Tag>}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted">
                  {r.category && <span>{r.category.name}</span>}
                  {r.city && <span>{r.city}</span>}
                  <span>{formatDate(r.createdAt)}</span>
                  {r.neededBy && <span>مطلوب قبل {formatDate(r.neededBy)}</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}

type VendorRfq = {
  id: string;
  code: string;
  title: string;
  status: RfqStatus;
  companyName: string;
  city: string | null;
  location: string | null;
  neededBy: string | null;
  notes: string | null;
  createdAt: string;
  attachments: MarketFile[];
  items: { id: string; name: string; quantity: number; unit: string; specs: string | null; brand: string | null }[];
  category: { name: string } | null;
  product: { name: string; slug: string } | null;
  contact: { phone: string | null; email: string | null; contactName: string; hidden?: boolean };
  myQuote: (Record<string, unknown> & { id: string; unitPrice: number; quantity: number; total: number; status: QuoteStatus; leadTimeDays: number | null; warranty: string | null; originCountry: string | null; brand: string | null; specs: string | null; paymentTerms: string | null; validUntil: string | null; notes: string | null; fileUrl: string | null }) | null;
  competitorCount: number;
  finalValue: number | null;
  recipientStatus: string;
  open: boolean;
  canQuote: boolean;
};

export function VendorRfqDetail({ approved }: { approved: boolean }) {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<VendorRfq>(`/vendor/market/rfqs/${id}`), [id]);
  const m = useMutation();
  const [editing, setEditing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  useDocumentTitle(q.data?.code ?? 'طلب عرض سعر');
  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  const r = q.data;
  const totalQty = r.items.length === 1 ? Number(r.items[0].quantity) : 1;

  return (
    <AdminPage
      back={{ to: '/vendor/rfqs', label: 'طلبات عروض الأسعار' }}
      title={r.title}
      meta={
        <>
          <span className="ltr text-sm font-semibold text-muted">{r.code}</span>
          <Tag tone={rfqTone(r.status)}>{RFQ_STATUS_LABEL[r.status]}</Tag>
          {r.competitorCount > 0 && <Tag>عروض أخرى: {r.competitorCount}</Tag>}
        </>
      }
      actions={
        r.canQuote &&
        r.recipientStatus !== 'DECLINED' &&
        r.myQuote?.status !== 'ACCEPTED' && (
          <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
            اعتذار عن الطلب
          </Button>
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="المطلوب">
            <ol className="divide-y divide-line">
              {r.items.map((it, i) => (
                <li key={it.id} className="py-3">
                  <p className="font-semibold">
                    {i + 1}. {it.name} <span className="font-normal text-muted">× <span className="num">{Number(it.quantity)}</span> {it.unit}</span>
                  </p>
                  {(it.brand || it.specs) && <p className="mt-1 whitespace-pre-line text-sm text-muted">{[it.brand && `الماركة: ${it.brand}`, it.specs].filter(Boolean).join('\n')}</p>}
                </li>
              ))}
            </ol>
            {r.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-subtle p-3 text-sm">{r.notes}</p>}
            {r.attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {r.attachments.map((f, i) => (
                  <li key={i}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-ink">
                      <Icon name={f.kind === 'IMAGE' ? 'image' : 'file'} className="h-4 w-4" /> {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={r.myQuote ? 'عرضك' : 'قدّم عرضك'}>
            {!approved ? (
              <p className="text-sm text-muted">تستطيع تقديم العروض بعد اعتماد حسابك من الإدارة.</p>
            ) : r.myQuote && !editing ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-2xl font-bold tabular-nums">{formatJOD(r.myQuote.total)}</p>
                  <Tag tone={r.myQuote.status === 'ACCEPTED' ? 'success' : r.myQuote.status === 'SUBMITTED' ? 'brand' : 'neutral'}>{QUOTE_STATUS_LABEL[r.myQuote.status]}</Tag>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {(
                    [
                      ['سعر الوحدة', formatJOD(r.myQuote.unitPrice)],
                      ['الكمية', String(Number(r.myQuote.quantity))],
                      ['مدة التوريد', leadTimeText(r.myQuote.leadTimeDays)],
                      ['الضمان', r.myQuote.warranty],
                      ['المنشأ', r.myQuote.originCountry],
                      ['الماركة', r.myQuote.brand],
                      ['شروط الدفع', r.myQuote.paymentTerms],
                      ['صالح حتى', r.myQuote.validUntil ? formatDate(r.myQuote.validUntil) : null],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-muted">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
                {r.myQuote.fileUrl && (
                  <a href={r.myQuote.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm underline">
                    <Icon name="download" className="h-4 w-4" /> ملف العرض
                  </a>
                )}
                {r.myQuote.status === 'SUBMITTED' && r.open && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      تعديل العرض
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger" loading={m.pending === 'withdraw'} onClick={async () => (await m.run('withdraw', () => api.post(`/vendor/market/rfqs/${r.id}/withdraw`), 'تم سحب العرض')) && q.retry()}>
                      سحب العرض
                    </Button>
                  </div>
                )}
              </div>
            ) : r.canQuote ? (
              <QuoteForm rfqId={r.id} initial={r.myQuote} defaultQty={totalQty} onDone={() => (setEditing(false), q.retry())} onCancel={r.myQuote ? () => setEditing(false) : undefined} />
            ) : (
              <p className="text-sm text-muted">هذا الطلب لم يعد يستقبل عروضًا.</p>
            )}
          </Panel>

          <Panel title="الرسائل مع العميل">
            <MessageThread
              path={`/vendor/market/rfqs/${r.id}/messages`}
              me="VENDOR"
              disabled={!approved ? 'المراسلة متاحة بعد اعتماد حسابك' : r.status === 'CANCELLED' ? 'الطلب ملغي' : null}
              hint="التواصل عبر المنصة إلزامي قبل قبول العرض — أرقام الهواتف والبريد تُخفى تلقائيًا."
            />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="العميل">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">الشركة</dt>
                <dd className="font-semibold">{r.companyName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">المسؤول</dt>
                <dd>{r.contact.contactName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">الهاتف</dt>
                <dd className="ltr text-end">{r.contact.hidden ? r.contact.phone : <a href={`tel:${r.contact.phone}`} className="underline">{r.contact.phone}</a>}</dd>
              </div>
              {r.contact.email && (
                <div>
                  <dt className="text-xs text-muted">البريد</dt>
                  <dd className="ltr text-end">{r.contact.email}</dd>
                </div>
              )}
              {(r.city || r.location) && (
                <div>
                  <dt className="text-xs text-muted">الموقع</dt>
                  <dd>{[r.city, r.location].filter(Boolean).join(' — ')}</dd>
                </div>
              )}
              {r.neededBy && (
                <div>
                  <dt className="text-xs text-muted">مطلوب قبل</dt>
                  <dd>{formatDate(r.neededBy)}</dd>
                </div>
              )}
            </dl>
            {r.contact.hidden && <p className="mt-3 rounded-lg bg-subtle p-3 text-xs text-muted">تظهر بيانات التواصل كاملة عند قبول العميل لعرضك.</p>}
          </Panel>
          {r.finalValue != null && (
            <Panel title="الصفقة">
              <p className="font-display text-2xl font-bold">{formatJOD(r.finalValue)}</p>
              <p className="mt-1 text-sm text-muted">تم قبول عرضك. تابع التوريد مع العميل.</p>
            </Panel>
          )}
        </div>
      </div>
      <Modal
        open={declining}
        onClose={() => setDeclining(false)}
        title="الاعتذار عن الطلب"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              تراجع
            </Button>
            <Button variant="danger" loading={m.pending === 'decline'} onClick={async () => (await m.run('decline', () => api.post(`/vendor/market/rfqs/${r.id}/decline`, { reason: reason.trim() || null }), 'تم الاعتذار')) && (setDeclining(false), q.retry())}>
              اعتذار
            </Button>
          </>
        }
      >
        <Textarea label="السبب" optional rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="غير متوفر، خارج تخصصنا…" />
      </Modal>
    </AdminPage>
  );
}

/** نموذج عرض السعر — للمورد، وتستخدمه الإدارة لتقديم عرض باسم متجر FARJAR (endpoint مختلف) */
export function QuoteForm({ rfqId, initial, defaultQty, onDone, onCancel, endpoint }: { rfqId: string; initial: VendorRfq['myQuote']; defaultQty: number; onDone: () => void; onCancel?: () => void; endpoint?: string }) {
  const m = useMutation();
  const [f, setF] = useState({
    unitPrice: initial ? String(initial.unitPrice) : '',
    quantity: initial ? String(Number(initial.quantity)) : String(defaultQty),
    leadTimeDays: initial?.leadTimeDays != null ? String(initial.leadTimeDays) : '',
    warranty: initial?.warranty ?? '',
    originCountry: initial?.originCountry ?? '',
    brand: initial?.brand ?? '',
    specs: initial?.specs ?? '',
    paymentTerms: initial?.paymentTerms ?? '',
    validUntil: initial?.validUntil ? initial.validUntil.slice(0, 10) : '',
    notes: initial?.notes ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const total = Math.round((Number(f.unitPrice) || 0) * (Number(f.quantity) || 0) * 1000) / 1000;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = {
      unitPrice: Number(f.unitPrice) || 0,
      quantity: Number(f.quantity) || 0,
      leadTimeDays: f.leadTimeDays ? Number(f.leadTimeDays) : null,
      warranty: f.warranty.trim() || null,
      originCountry: f.originCountry.trim() || null,
      brand: f.brand.trim() || null,
      specs: f.specs.trim() || null,
      paymentTerms: f.paymentTerms.trim() || null,
      validUntil: f.validUntil || null,
      notes: f.notes.trim() || null,
    };
    const r = await m.run('quote', () => api.post(endpoint ?? `/vendor/market/rfqs/${rfqId}/quote`, toFormData(data, { file })), 'تم إرسال عرضك للعميل');
    if (r) onDone();
  };
  const fe = m.fieldErrors;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="سعر الوحدة (د.أ)" type="number" inputMode="decimal" min={0} step="0.001" className="ltr text-start" value={f.unitPrice} onChange={set('unitPrice')} error={fe.unitPrice} />
        <Input label="الكمية" type="number" inputMode="decimal" min={0} className="ltr text-start" value={f.quantity} onChange={set('quantity')} error={fe.quantity} />
        <div>
          <p className="mb-1.5 text-sm font-medium">الإجمالي</p>
          <p className="flex h-11 items-center rounded-lg bg-subtle px-3 font-bold tabular-nums">{formatJOD(total)}</p>
        </div>
        <Input label="مدة التوريد (يوم)" optional type="number" min={0} className="ltr text-start" value={f.leadTimeDays} onChange={set('leadTimeDays')} error={fe.leadTimeDays} />
        <Input label="الضمان" optional value={f.warranty} onChange={set('warranty')} error={fe.warranty} />
        <Input label="صالح حتى" optional type="date" className="ltr text-start" value={f.validUntil} onChange={set('validUntil')} error={fe.validUntil} />
        <Input label="بلد المنشأ" optional value={f.originCountry} onChange={set('originCountry')} error={fe.originCountry} />
        <Input label="الماركة" optional value={f.brand} onChange={set('brand')} error={fe.brand} />
        <Input label="شروط الدفع" optional placeholder="50% مقدم…" value={f.paymentTerms} onChange={set('paymentTerms')} error={fe.paymentTerms} />
      </div>
      <Textarea label="المواصفات المعروضة" optional rows={2} value={f.specs} onChange={set('specs')} error={fe.specs} />
      <Textarea label="ملاحظات" optional rows={2} value={f.notes} onChange={set('notes')} error={fe.notes} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">ملف عرض السعر (PDF) — اختياري</span>
        <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:me-3 file:rounded-lg file:border file:border-line file:bg-subtle file:px-3 file:py-1.5" />
      </label>
      {m.error && !Object.keys(fe).length && <Alert tone="error">{m.error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" loading={m.pending === 'quote'} disabled={!f.unitPrice || !f.quantity}>
          {initial ? 'حفظ التعديل' : 'إرسال العرض'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        )}
      </div>
    </form>
  );
}

// ───────────── الإحصائيات ─────────────

type Stats = {
  analyticsEnabled: boolean;
  advanced: boolean;
  daily: { day: string; profileViews: number; productViews: number; rfqs: number; quotes: number }[];
  topProducts: { id: string; name: string; slug: string; views: number }[];
  totals: { profileViews: number; productViews: number; rfqs: number; quotes: number; interestedCustomers: number; adImpressions: number; adClicks: number };
  quotes: Record<string, { count: number; value: number }>;
};

export function VendorStats() {
  useDocumentTitle('الإحصائيات');
  const [days, setDays] = useState(30);
  const q = useAdminQuery(() => api.get<Stats>('/vendor/market/stats', { days }), [days]);
  const s = q.data;
  const max = Math.max(1, ...(s?.daily.map((d) => d.productViews + d.profileViews) ?? [1]));
  return (
    <AdminPage
      title="الإحصائيات"
      actions={
        <Select label="" aria-label="الفترة" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="7">آخر 7 أيام</option>
          <option value="30">آخر 30 يومًا</option>
          <option value="90">آخر 90 يومًا</option>
        </Select>
      }
    >
      {q.error && <ErrorState message={q.error.message} onRetry={q.retry} />}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="زيارات صفحة الشركة (الإجمالي)" value={s?.totals.profileViews ?? 0} loading={q.loading} />
        <StatTile label="مشاهدات المنتجات" value={s?.totals.productViews ?? 0} loading={q.loading} />
        <StatTile label="طلبات عروض الأسعار" value={s?.totals.rfqs ?? 0} sub={`${s?.totals.interestedCustomers ?? 0} عميل مهتم`} loading={q.loading} />
        <StatTile label="العروض المقدَّمة" value={s?.totals.quotes ?? 0} sub={s?.quotes.ACCEPTED ? `قيمة الصفقات ${formatJOD(s.quotes.ACCEPTED.value)}` : undefined} loading={q.loading} />
      </div>
      {s && !s.analyticsEnabled ? (
        <Alert tone="info" title="الإحصائيات التفصيلية في باقة PRO">
          رقِّ باقتك لتشاهد المشاهدات اليومية وأكثر منتجاتك مشاهدة. <Link to="/vendor/subscription" className="underline">الباقات</Link>
        </Alert>
      ) : (
        s && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="المشاهدات اليومية" className="lg:col-span-2">
              {s.daily.length === 0 ? (
                <p className="text-sm text-muted">لا توجد بيانات بعد.</p>
              ) : (
                <div className="flex h-44 items-end gap-1" role="img" aria-label="رسم المشاهدات اليومية">
                  {s.daily.map((d) => {
                    const v = d.productViews + d.profileViews;
                    return <span key={d.day} title={`${d.day}: ${v}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />;
                  })}
                </div>
              )}
              {s.advanced && (
                <p className="mt-4 text-sm text-muted">
                  الإعلانات: <span className="num">{s.totals.adImpressions}</span> ظهور · <span className="num">{s.totals.adClicks}</span> نقرة
                </p>
              )}
            </Panel>
            <Panel title="الأكثر مشاهدة">
              <ol className="space-y-2 text-sm">
                {s.topProducts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link to={`/store/${p.slug}`} className="truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="num text-muted">{p.views}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
        )
      )}
    </AdminPage>
  );
}

// ───────────── الاشتراك والفواتير ─────────────

type Plan = { id: string; code: string; name: string; description: string; price: number; durationDays: number; maxProducts: number | null; maxUsers: number; maxRfqPerMonth: number | null; leadsIncluded: boolean; features: Record<string, boolean> };
type Invoice = PayableInvoice & { paidAt: string | null };
type SubData = {
  current: Plan | null;
  planId: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  plans: Plan[];
  history: { id: string; status: string; amount: number; startsAt: string | null; endsAt: string | null; createdAt: string; plan: { name: string }; invoice: { number: string; status: string } | null }[];
  invoices: Invoice[];
  account: PaymentAccount;
};

export function VendorSubscription({ owner }: { owner: boolean }) {
  useDocumentTitle('الاشتراك');
  const q = useAdminQuery(() => api.get<SubData>('/vendor/market/subscription'), []);
  const m = useMutation();
  const [info, setInfo] = useState<string | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [buying, setBuying] = useState<Plan | null>(null);
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  // ?plan=<planId>: الباقة المختارة عند الانضمام تفتح شاشة دفعها مباشرة (مرة واحدة)
  const [params, setParams] = useSearchParams();
  const planParam = params.get('plan');
  useEffect(() => {
    if (!planParam || !q.data) return;
    const plan = q.data.plans.find((p) => p.id === planParam && Number(p.price) > 0);
    if (plan && owner) setBuying(plan);
    setParams((p) => (p.delete('plan'), p), { replace: true });
  }, [planParam, q.data, owner, setParams]);
  if (q.loading && !q.data) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  const d = q.data;
  const open = d.invoices.filter((i) => i.status === 'PENDING');
  const pendingSub = open.find((i) => i.purpose === 'SUBSCRIPTION');
  // الباقة المدفوعة: تفتح شاشة الدفع فقط — الطلب يُنشأ عند إرسال الإيصال
  const request = async (planId: string) => {
    setInfo(null);
    const plan = d.plans.find((p) => p.id === planId);
    if (!plan) return;
    if (Number(plan.price) > 0) return setBuying(plan);
    if (await m.run('plan', () => api.post('/vendor/market/subscription', { planId }), 'تم تفعيل الباقة')) {
      setInfo('تم تفعيل الباقة.');
      q.retry();
    }
  };
  const buy = async ({ file, reference, note }: ProofInput) => {
    if (!buying) return false;
    await api.post('/vendor/market/subscription', toFormData({ planId: buying.id, reference, note }, { file }));
    setBuying(null);
    setInfo('تم إرسال طلب الباقة مع إيصال الدفع. تراجع الإدارة الإيصال وتفعّل الباقة، ويصلك إشعار بالنتيجة.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    q.retry();
    return true;
  };
  const cancel = async () => {
    if (!cancelling) return;
    if (await m.run('cancel', () => api.post(`/vendor/market/invoices/${cancelling.id}/cancel`), 'تم إلغاء الطلب')) {
      setCancelling(null);
      q.retry();
    }
  };
  return (
    <AdminPage title="الاشتراك والفواتير" description="اختر باقتك، ادفع عبر CliQ أو تحويل بنكي، وأرفق الإيصال لتفعّلها الإدارة.">
      {info && (
        <Alert tone="success" className="mb-6">
          {info}
        </Alert>
      )}
      {m.error && !paying && (
        <Alert tone="error" className="mb-6">
          {m.error}
        </Alert>
      )}
      {open.map((i) => (
        <PendingPayment key={i.id} invoice={i} owner={owner} onPay={() => setPaying(i)} onCancel={() => setCancelling(i)} />
      ))}
      <Panel title="باقتك الحالية" className="mb-6">
        <p className="font-display text-2xl font-bold">{d.current?.name ?? '—'}</p>
        <p className="mt-1 text-sm text-muted">
          {d.startedAt && <>منذ {formatDate(d.startedAt)}</>}
          {d.expiresAt && Number(d.current?.price ?? 0) > 0 && <> · تنتهي {formatDate(d.expiresAt)}</>}
        </p>
      </Panel>
      <ul className="mb-8 grid gap-4 md:grid-cols-3">
        {d.plans.map((p) => {
          const current = d.current?.id === p.id;
          return (
            <li key={p.id} className={cx('flex flex-col rounded-2xl border bg-surface p-5', current ? 'border-primary shadow-lift' : 'border-line')}>
              <p className="font-display text-lg font-bold">{p.name}</p>
              <p className="mt-1 font-display text-2xl font-bold">{Number(p.price) > 0 ? formatJOD(p.price) : 'مجانًا'}</p>
              {Number(p.price) > 0 && <p className="text-xs text-muted">لكل {p.durationDays} يومًا</p>}
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                <li>{p.maxProducts == null ? 'منتجات غير محدودة' : `حتى ${p.maxProducts} منتج`}</li>
                <li>{p.maxRfqPerMonth == null ? 'طلبات غير محدودة' : `${p.maxRfqPerMonth} طلبات عروض أسعار شهريًا`}</li>
                <li>{p.maxUsers} مستخدم</li>
                {p.leadsIncluded && <li>الـ Leads مشمولة</li>}
                {Object.entries(p.features)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <li key={k}>{FEATURE_LABEL[k] ?? k}</li>
                  ))}
              </ul>
              {owner && (
                <Button
                  className="mt-4"
                  variant={current ? 'outline' : 'primary'}
                  loading={m.pending === 'plan'}
                  disabled={(current && Number(p.price) === 0) || pendingSub?.proofStatus === 'SUBMITTED'}
                  onClick={() => request(p.id)}
                >
                  {current ? (Number(p.price) > 0 ? 'تجديد' : 'باقتك الحالية') : 'اختيار الباقة'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {pendingSub?.proofStatus === 'SUBMITTED' && owner && <p className="-mt-5 mb-8 text-sm text-muted">طلب اشتراكك قيد مراجعة الدفع — تستطيع اختيار باقة أخرى بعد رد الإدارة.</p>}
      <Panel title="الفواتير" bodyClassName="p-0 sm:p-0">
        {d.invoices.length === 0 ? (
          <p className="p-4 text-sm text-muted sm:p-5">لا توجد فواتير.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <span className="min-w-0">
                  <span className="ltr block text-xs font-semibold text-muted">{i.number}</span>
                  <span className="block text-sm">{i.description}</span>
                  <span className="text-xs text-muted">
                    {INVOICE_PURPOSE_LABEL[i.purpose] ?? i.purpose} · {formatDate(i.createdAt)}
                    {i.paidAt && <> · دُفعت {formatDate(i.paidAt)}</>}
                  </span>
                  {i.proofUrl && (
                    <a href={i.proofUrl} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-primary-ink underline">
                      <Icon name="file" className="h-3.5 w-3.5" /> إيصال الدفع
                    </a>
                  )}
                </span>
                <span className="flex flex-col items-end gap-1 text-end">
                  <span className="block font-semibold tabular-nums">{formatJOD(i.amount)}</span>
                  <ProofTag invoice={i} />
                  {owner && i.status === 'PENDING' && i.proofStatus !== 'SUBMITTED' && (
                    <Button size="sm" variant="outline" onClick={() => setPaying(i)}>
                      ادفع وأرفق الإيصال
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <PayModal
        open={Boolean(buying)}
        summary={buying ? { label: 'اشتراك', description: `باقة ${buying.name} — ${buying.durationDays} يومًا`, amount: Number(buying.price) } : null}
        account={d.account}
        submit={buy}
        onClose={() => setBuying(null)}
      />
      <PaymentProofModal invoice={paying} account={d.account} onClose={() => setPaying(null)} onDone={() => (setPaying(null), setInfo('تم إرسال إثبات الدفع. تراجع الإدارة الإيصال وتفعّل الباقة، ويصلك إشعار بالنتيجة.'), q.retry())} />
      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="إلغاء الطلب؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(null)}>
              رجوع
            </Button>
            <Button variant="danger" loading={m.pending === 'cancel'} onClick={cancel}>
              إلغاء الطلب
            </Button>
          </>
        }
      >
        <p className="text-sm">
          تُلغى الفاتورة <span className="ltr font-semibold">{cancelling?.number}</span> ويمكنك اختيار باقة أخرى.
        </p>
      </Modal>
    </AdminPage>
  );
}

/** تنبيه فاتورة مفتوحة: بانتظار الدفع، قيد المراجعة، أو رُفض الإيصال */
function PendingPayment({ invoice: i, owner, onPay, onCancel }: { invoice: Invoice; owner: boolean; onPay: () => void; onCancel: () => void }) {
  const review = i.proofStatus === 'SUBMITTED';
  const rejected = i.proofStatus === 'REJECTED';
  return (
    <div className={cx('mb-6 rounded-2xl border p-4 sm:p-5', review ? 'border-line bg-subtle' : rejected ? 'border-danger/40 bg-danger/5' : 'border-primary bg-primary/10')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">
            {review ? 'إيصال الدفع قيد المراجعة' : rejected ? 'لم يُقبل إيصال الدفع' : 'أكمل الدفع لتفعيل طلبك'} <ProofTag invoice={i} />
          </p>
          <p className="mt-1 text-sm">
            {i.description} — <b className="tabular-nums">{formatJOD(i.amount)}</b> · <span className="ltr">{i.number}</span>
          </p>
          {review && i.proofSubmittedAt && <p className="mt-1 text-sm text-muted">أُرسل {formatDate(i.proofSubmittedAt)}. تُفعَّل الخدمة بعد تأكيد الإدارة.</p>}
          {rejected && i.reviewNote && <p className="mt-1 text-sm text-danger">السبب: {i.reviewNote}</p>}
          {rejected && owner && <p className="mt-1 text-sm text-muted">ارفع إيصالًا جديدًا لنفس الطلب، أو اختر نفس الباقة أو باقة أخرى من الأسفل وأرسل طلبًا جديدًا (يُلغى هذا الطلب تلقائيًا).</p>}
        </div>
        {owner && !review && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onPay}>
              {rejected ? 'رفع إيصال جديد' : 'ادفع وأرفق الإيصال'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              إلغاء الطلب
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────── الإعلانات ─────────────

type Ad = { id: string; type: string; placement: string; status: string; startsAt: string; endsAt: string; impressions: number; clicks: number; price: number; product: { name: string; slug: string } | null; invoice: PayableInvoice | null };
type Pkg = { id: string; type: string; name: string; placement: string; price: number; durationDays: number };

export function VendorAds({ approved }: { approved: boolean }) {
  useDocumentTitle('الإعلانات');
  const q = useAdminQuery(() => api.get<{ ads: Ad[]; packages: Pkg[]; account: PaymentAccount }>('/vendor/market/ads'), []);
  const [paying, setPaying] = useState<PayableInvoice | null>(null);
  const products = useAdminQuery(() => api.get<{ items: { id: string; name: string; approvalStatus: string }[] }>('/vendor/products', { pageSize: 100, approval: 'APPROVED' }), []);
  const m = useMutation();
  const [open, setOpen] = useState(false);
  const [pkgId, setPkgId] = useState('');
  const [productId, setProductId] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const pkg = q.data?.packages.find((p) => p.id === pkgId);
  const needsProduct = pkg ? ['FEATURED_PRODUCT', 'PRODUCT_OF_WEEK', 'INDUSTRIAL_DEAL'].includes(pkg.type) : false;
  const [buyingAd, setBuyingAd] = useState<Pkg | null>(null);
  // الإعلان المدفوع: شاشة الدفع أولًا، والطلب يُرسل مع الإيصال فقط
  const submit = async () => {
    if (!pkg) return;
    if (Number(pkg.price) > 0) {
      setOpen(false);
      setBuyingAd(pkg);
      return;
    }
    if (await m.run('ad', () => api.post('/vendor/market/ads', { packageId: pkgId, productId: needsProduct ? productId : null }), 'تم طلب الإعلان')) {
      setOpen(false);
      setInfo('بانتظار موافقة الإدارة.');
      q.retry();
    }
  };
  const buyAd = async ({ file, reference, note }: ProofInput) => {
    if (!buyingAd) return false;
    await api.post('/vendor/market/ads', toFormData({ packageId: buyingAd.id, productId: needsProduct ? productId : null, reference, payerNote: note }, { file }));
    setBuyingAd(null);
    setInfo('تم إرسال طلب الإعلان مع إيصال الدفع. يبدأ إعلانك بعد تأكيد الإدارة.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    q.retry();
    return true;
  };
  return (
    <AdminPage
      title="الإعلانات"
      description="اظهر في أماكن مميزة داخل السوق: منتج مميز، مورد مميز، عرض صناعي، منتج الأسبوع، ومورد الشهر."
      actions={
        approved && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> طلب إعلان
          </Button>
        )
      }
    >
      {info && (
        <Alert tone="info" className="mb-6" title="الخطوة التالية">
          {info}
        </Alert>
      )}
      <PayModal
        open={Boolean(buyingAd)}
        summary={buyingAd ? { label: 'إعلان', description: `${buyingAd.name} — ${buyingAd.durationDays} يومًا`, amount: Number(buyingAd.price) } : null}
        account={q.data?.account ?? null}
        submit={buyAd}
        onClose={() => setBuyingAd(null)}
      />
      {q.data && (
        <PaymentProofModal
          invoice={paying}
          account={q.data.account}
          onClose={() => setPaying(null)}
          onDone={() => (setPaying(null), setInfo('تم إرسال إثبات الدفع. يبدأ إعلانك بعد تأكيد الإدارة.'), q.retry())}
        />
      )}
      {q.loading ? (
        <SkeletonRows rows={3} />
      ) : !q.data?.ads.length ? (
        <EmptyState title="لا توجد إعلانات" description="اطلب إعلانًا لمنتجك أو شركتك ليظهر في الصفحة الرئيسية للسوق أو أعلى نتائج البحث." />
      ) : (
        <ul className="space-y-3">
          {q.data.ads.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {AD_TYPE_LABEL[a.type] ?? a.type}
                  {a.product && <span className="font-normal text-muted"> — {a.product.name}</span>}
                </p>
                <Tag tone={a.status === 'ACTIVE' ? 'success' : a.status === 'PENDING_PAYMENT' || a.status === 'REQUESTED' ? 'brand' : 'neutral'}>{AD_STATUS_LABEL[a.status] ?? a.status}</Tag>
              </div>
              <p className="mt-1 text-sm text-muted">
                {PLACEMENT_LABEL[a.placement] ?? a.placement} · {formatDate(a.startsAt)} ← {formatDate(a.endsAt)} · {formatJOD(a.price)}
                {a.invoice && <> · فاتورة <span className="ltr">{a.invoice.number}</span></>}
              </p>
              {a.invoice && a.invoice.status === 'PENDING' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ProofTag invoice={a.invoice} />
                  {a.invoice.proofStatus === 'REJECTED' && a.invoice.reviewNote && <span className="text-sm text-danger">{a.invoice.reviewNote}</span>}
                  {a.invoice.proofStatus !== 'SUBMITTED' && (
                    <Button size="sm" variant="outline" onClick={() => setPaying(a.invoice)}>
                      ادفع وأرفق الإيصال
                    </Button>
                  )}
                </div>
              )}
              <p className="mt-2 text-sm">
                <span className="num font-semibold">{a.impressions}</span> ظهور · <span className="num font-semibold">{a.clicks}</span> نقرة
                {a.impressions > 0 && <span className="text-muted"> · نسبة النقر {((a.clicks / a.impressions) * 100).toFixed(1)}%</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="طلب إعلان"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button loading={m.pending === 'ad'} disabled={!pkgId || (needsProduct && !productId)} onClick={submit}>
              {pkg && Number(pkg.price) > 0 ? `متابعة للدفع — ${formatJOD(pkg.price)}` : 'طلب الإعلان'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="نوع الإعلان" value={pkgId} onChange={(e) => setPkgId(e.target.value)} error={m.fieldErrors.packageId}>
            <option value="">اختر</option>
            {q.data?.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatJOD(p.price)} ({p.durationDays} يوم)
              </option>
            ))}
          </Select>
          {needsProduct && (
            <Select label="المنتج" value={productId} onChange={(e) => setProductId(e.target.value)} error={m.fieldErrors.productId}>
              <option value="">اختر منتجًا معتمدًا</option>
              {products.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
          {m.error && !Object.keys(m.fieldErrors).length && <Alert tone="error">{m.error}</Alert>}
        </div>
      </Modal>
    </AdminPage>
  );
}

// ───────────── الفريق ─────────────

type Member = { id: string; role: 'OWNER' | 'STAFF'; createdAt: string; customer: { id: string; name: string; phone: string; email: string | null } };

export function VendorTeam({ owner }: { owner: boolean }) {
  useDocumentTitle('فريق العمل');
  const q = useAdminQuery(() => api.get<{ members: Member[]; maxUsers: number }>('/vendor/market/team'), []);
  const m = useMutation();
  const [identifier, setIdentifier] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run('add', () => api.post('/vendor/market/team', { identifier: identifier.trim() }), 'تمت إضافة الموظف');
    if (r) {
      setIdentifier('');
      q.retry();
    }
  };
  return (
    <AdminPage title="فريق العمل" description={q.data ? `مستخدمو حساب المورد (${q.data.members.length} من ${q.data.maxUsers} حسب باقتك)` : undefined}>
      {owner && (
        <Panel title="إضافة موظف" className="mb-6">
          <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input label="هاتف أو بريد الموظف" wrapperClassName="flex-1" value={identifier} onChange={(e) => setIdentifier(e.target.value)} error={m.fieldErrors.identifier} hint="يجب أن يكون لديه حساب مسجّل في الموقع" />
            <Button type="submit" loading={m.pending === 'add'} disabled={identifier.trim().length < 5}>
              إضافة
            </Button>
          </form>
          {m.error && !Object.keys(m.fieldErrors).length && (
            <Alert tone="error" className="mt-3">
              {m.error}
            </Alert>
          )}
        </Panel>
      )}
      <Panel title="المستخدمون" bodyClassName="p-0 sm:p-0">
        {q.loading ? (
          <div className="p-4">
            <SkeletonRows rows={2} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {q.data?.members.map((mb) => (
              <li key={mb.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span>
                  <span className="block font-medium">{mb.customer.name}</span>
                  <span className="ltr text-xs text-muted">{mb.customer.phone}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Tag tone={mb.role === 'OWNER' ? 'brand' : 'neutral'}>{mb.role === 'OWNER' ? 'المالك' : 'موظف'}</Tag>
                  {owner && mb.role !== 'OWNER' && (
                    <button type="button" onClick={async () => (await m.run(`rm-${mb.id}`, () => api.del(`/vendor/market/team/${mb.id}`), 'تم الحذف')) && q.retry()} className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger" aria-label={`حذف ${mb.customer.name}`}>
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  );
}

