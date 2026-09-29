import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, FilterBar, FilterInput, FilterSelect, Panel, SearchInput, StatTile } from '../../../components/admin/ui';
import { PlanBadge, VerifiedMark } from '../../../components/market/Badges';
import { MessageThread } from '../../../components/market/MessageThread';
import { Alert, Button, Checkbox, ErrorState, Icon, Input, Modal, Select, Tag, Textarea } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatDate, formatJOD } from '../../../lib/format';
import { QUOTE_STATUS_LABEL, REVENUE_MODE_LABEL, RFQ_EVENT_LABEL, RFQ_STATUS_LABEL, leadTimeText, rfqTone, type MarketFile, type QuoteStatus, type RfqStatus } from '../../../lib/market';
import type { Category, Paged } from '../../../lib/types';
import { useDocumentTitle } from '../../../lib/useAsync';
import { QuoteForm } from '../../vendor/VendorMarket';

type Row = {
  id: string;
  code: string;
  title: string;
  companyName: string;
  contactName: string;
  city: string | null;
  status: RfqStatus;
  createdAt: string;
  expectedValue: number | null;
  finalValue: number | null;
  commissionAmount: number | null;
  revenueModel: string | null;
  category: { name: string } | null;
  acceptedQuote: { vendor: { name: string } } | null;
  _count: { recipients: number; quotes: number; items: number };
};

/** طلبات عروض الأسعار كـ Leads: العميل، المطلوب، الموردون، العروض، القيم والعمولة */
export function MarketRfqs() {
  useDocumentTitle('طلبات الأسعار / Leads');
  const f = useFilters(['status', 'q', 'from', 'to'] as const);
  const list = useAdminQuery(
    () => api.get<Paged<Row> & { statusCounts: Record<string, number>; sums: { expected: number; final: number; commission: number } }>('/admin/market/rfqs', { ...f.values, page: f.page, pageSize: 30 }),
    [JSON.stringify(f.values), f.page],
    { keep: true, live: true },
  );
  const cols: Column<Row>[] = [
    {
      key: 'code',
      header: 'الطلب',
      cell: (r) => (
        <span>
          <span className="ltr block text-xs font-semibold text-muted">{r.code}</span>
          <span className="block font-semibold">{r.title}</span>
          {r._count.items > 1 && <span className="text-xs text-muted">+ {r._count.items - 1} بنود</span>}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'العميل',
      cell: (r) => (
        <span>
          <span className="block">{r.companyName}</span>
          <span className="text-xs text-muted">{[r.contactName, r.city].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { key: 'sup', header: 'موردون / عروض', cell: (r) => <span className="num">{r._count.recipients} / {r._count.quotes}</span> },
    { key: 'value', header: 'المتوقعة / النهائية', cell: (r) => <span className="tabular-nums">{r.expectedValue != null ? formatJOD(r.expectedValue) : '—'} / {r.finalValue != null ? formatJOD(r.finalValue) : '—'}</span>, hideOnMobile: true },
    { key: 'comm', header: 'العمولة', cell: (r) => (r.commissionAmount != null ? <span className="tabular-nums">{formatJOD(r.commissionAmount)}</span> : '—'), hideOnMobile: true },
    { key: 'status', header: 'الحالة', cell: (r) => <Tag tone={rfqTone(r.status)}>{RFQ_STATUS_LABEL[r.status]}</Tag> },
  ];
  const s = list.data?.sums;
  return (
    <AdminPage title="طلبات الأسعار / Leads" description="كل طلبات عروض الأسعار: توزيعها على الموردين، متابعة العروض والصفقات والعمولات.">
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="القيمة المتوقعة" value={formatJOD(s?.expected ?? 0)} loading={list.loading} />
        <StatTile label="قيمة الصفقات النهائية" value={formatJOD(s?.final ?? 0)} loading={list.loading} />
        <StatTile label="العمولات المحسوبة" value={formatJOD(s?.commission ?? 0)} tone="brand" loading={list.loading} />
      </div>
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="RFQ-…، الشركة، الهاتف…" />
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">الكل</option>
          {(Object.keys(RFQ_STATUS_LABEL) as RfqStatus[]).map((k) => (
            <option key={k} value={k}>
              {RFQ_STATUS_LABEL[k]} ({list.data?.statusCounts[k] ?? 0})
            </option>
          ))}
        </FilterSelect>
        <FilterInput label="من" type="date" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label="إلى" type="date" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={cols}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/market/rfqs/${r.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: 'لا توجد طلبات' }}
      />
    </AdminPage>
  );
}

type Detail = {
  id: string;
  code: string;
  title: string;
  status: RfqStatus;
  companyName: string;
  contactName: string;
  phone: string;
  email: string | null;
  city: string | null;
  location: string | null;
  budget: number | null;
  neededBy: string | null;
  notes: string | null;
  adminNote: string | null;
  createdAt: string;
  expectedValue: number | null;
  finalValue: number | null;
  commissionRate: number | null;
  commissionAmount: number | null;
  revenueModel: string | null;
  orderId: string | null;
  attachments: MarketFile[];
  category: { id: string; name: string } | null;
  product: { id: string; name: string; slug: string } | null;
  customer: { id: string; name: string; phone: string; email: string | null; companyName: string | null };
  items: { id: string; name: string; quantity: number; unit: string; specs: string | null; brand: string | null }[];
  recipients: { id: string; status: string; source: string; leadFee: number; sentAt: string; viewedAt: string | null; declineReason: string | null; vendor: { id: string; name: string; slug: string; verified: boolean; city: string | null; plan: { code: string } | null } }[];
  quotes: { id: string; vendorId: string; unitPrice: number; quantity: number; total: number; leadTimeDays: number | null; warranty: string | null; originCountry: string | null; brand: string | null; paymentTerms: string | null; validUntil: string | null; status: QuoteStatus; fileUrl: string | null; vendor: { name: string } }[];
  events: { id: string; action: string; actorType: string; actorName: string | null; note: string | null; createdAt: string }[];
  conversations: { vendorId: string; lastAt: string; vendor: { name: string }; _count: { messages: number } }[];
  commissionRule: { name: string } | null;
  houseVendorId: string | null;
  open: boolean;
};

type Suggestion = { id: string; name: string; city: string | null; verified: boolean; isHouse: boolean; plan: { code: string; name: string } | null; products: number; servesCategory: boolean; rating: number | null; score: number };

const REC_LABEL: Record<string, string> = { SENT: 'أُرسل', VIEWED: 'اطّلع', QUOTED: 'قدّم عرضًا', DECLINED: 'اعتذر' };

export function MarketRfqDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/market/rfqs/${id}`), [id], { live: true });
  const cats = useAdminQuery(() => api.get<Category[]>('/store/categories'), []);
  const m = useMutation();
  const [distOpen, setDistOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const sugg = useAdminQuery(() => (distOpen ? api.get<Suggestion[]>(`/admin/market/rfqs/${id}/suggestions`) : Promise.resolve([])), [distOpen, id]);
  const [values, setValues] = useState<{ expectedValue: string; finalValue: string; adminNote: string; categoryId: string } | null>(null);
  const [closeOpen, setCloseOpen] = useState<'close' | 'cancel' | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{ address: string; area: string } | null>(null);
  const [houseOpen, setHouseOpen] = useState(false);
  useDocumentTitle(q.data?.code ?? 'طلب عرض سعر');
  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  const r = q.data;
  const edit = values ?? { expectedValue: r.expectedValue != null ? String(r.expectedValue) : '', finalValue: r.finalValue != null ? String(r.finalValue) : '', adminNote: r.adminNote ?? '', categoryId: r.category?.id ?? '' };
  const accepted = r.quotes.find((x) => x.status === 'ACCEPTED');
  const houseQuote = r.houseVendorId ? r.quotes.find((x) => x.vendorId === r.houseVendorId && x.status !== 'WITHDRAWN') : undefined;
  const qty = r.items.reduce((s, it) => s + Number(it.quantity), 0) || 1;
  const allCats = (cats.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...(c.children ?? []).map((k) => ({ id: k.id, name: `${c.name} / ${k.name}` }))]);

  const save = async () => {
    const body = {
      expectedValue: edit.expectedValue.trim() === '' ? null : Number(edit.expectedValue),
      finalValue: edit.finalValue.trim() === '' ? null : Number(edit.finalValue),
      adminNote: edit.adminNote.trim() || null,
      categoryId: edit.categoryId || null,
    };
    if (await m.run('save', () => api.patch(`/admin/market/rfqs/${r.id}`, body), 'تم الحفظ')) {
      setValues(null);
      q.retry();
    }
  };

  return (
    <AdminPage
      back={{ to: '/admin/market/rfqs', label: 'طلبات الأسعار' }}
      title={r.title}
      meta={
        <>
          <span className="ltr text-sm font-semibold text-muted">{r.code}</span>
          <Tag tone={rfqTone(r.status)}>{RFQ_STATUS_LABEL[r.status]}</Tag>
          {r.revenueModel && <Tag>{REVENUE_MODE_LABEL[r.revenueModel] ?? r.revenueModel}</Tag>}
        </>
      }
      actions={
        <>
          {r.open && r.houseVendorId && (
            <Button size="sm" variant="outline" onClick={() => setHouseOpen(true)}>
              <Icon name="store" className="h-4 w-4" /> {houseQuote ? 'تعديل عرض FARJAR' : 'عرض سعر من FARJAR'}
            </Button>
          )}
          {r.open && (
            <Button size="sm" onClick={() => (setPicked([]), setDistOpen(true))}>
              <Icon name="users" className="h-4 w-4" /> إرسال لموردين
            </Button>
          )}
          {accepted && !r.orderId && (
            <Button size="sm" variant="outline" onClick={() => setDelivery({ address: r.location ?? '', area: r.city ?? '' })}>
              <Icon name="truck" className="h-4 w-4" /> طلب توصيل
            </Button>
          )}
          {r.orderId && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/delivery/orders/${r.orderId}`)}>
              طلب التوصيل
            </Button>
          )}
          {(r.open || r.status === 'AWARDED') && (
            <Button size="sm" variant="ghost" onClick={() => setCloseOpen('close')}>
              إغلاق
            </Button>
          )}
          {r.open && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCloseOpen('cancel')}>
              إلغاء
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="المطلوب">
            <ol className="divide-y divide-line">
              {r.items.map((it, i) => (
                <li key={it.id} className="py-2.5">
                  <p className="font-semibold">
                    {i + 1}. {it.name} <span className="font-normal text-muted">× <span className="num">{Number(it.quantity)}</span> {it.unit}</span>
                  </p>
                  {(it.brand || it.specs) && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{[it.brand, it.specs].filter(Boolean).join(' — ')}</p>}
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

          <Panel title={`الموردون (${r.recipients.length})`} bodyClassName="p-0 sm:p-0">
            {r.recipients.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">لم يُرسل الطلب لأي مورد بعد.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.recipients.map((x) => {
                  const quote = r.quotes.find((qq) => qq.vendorId === x.vendor.id);
                  const conv = r.conversations.find((c) => c.vendorId === x.vendor.id);
                  return (
                    <li key={x.id} className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Link to={`/admin/market/suppliers/${x.vendor.id}`} className="font-semibold hover:underline">
                            {x.vendor.name}
                          </Link>
                          {x.vendor.verified && <VerifiedMark />}
                          <PlanBadge plan={x.vendor.plan ? { code: x.vendor.plan.code, badge: x.vendor.plan.code === 'FREE' ? null : x.vendor.plan.code } : null} />
                        </span>
                        <span className="flex items-center gap-2 text-xs">
                          <Tag tone={x.status === 'QUOTED' ? 'brand' : x.status === 'DECLINED' ? 'danger' : 'neutral'}>{REC_LABEL[x.status] ?? x.status}</Tag>
                          <span className="text-muted">{x.source === 'AUTO' ? 'تلقائي' : x.source === 'DIRECT' ? 'مباشر' : 'يدوي'}</span>
                          {Number(x.leadFee) > 0 && <span className="text-muted">Lead {formatJOD(x.leadFee)}</span>}
                        </span>
                      </div>
                      {quote && (
                        <p className="mt-1.5 text-sm">
                          عرض: <b className="tabular-nums">{formatJOD(quote.total)}</b> ({formatJOD(quote.unitPrice)} × {Number(quote.quantity)}) · {leadTimeText(quote.leadTimeDays) ?? '—'} · {QUOTE_STATUS_LABEL[quote.status]}
                          {quote.fileUrl && (
                            <a href={quote.fileUrl} target="_blank" rel="noopener noreferrer" className="ms-2 underline">
                              PDF
                            </a>
                          )}
                        </p>
                      )}
                      {x.declineReason && <p className="mt-1 text-sm text-muted">سبب الاعتذار: {x.declineReason}</p>}
                      <button type="button" onClick={() => setChat(chat === x.vendor.id ? null : x.vendor.id)} className="mt-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
                        {chat === x.vendor.id ? 'إخفاء المحادثة' : `المحادثة${conv ? ` (${conv._count.messages})` : ''}`}
                      </button>
                      {chat === x.vendor.id && (
                        <div className="mt-3">
                          <MessageThread path={`/admin/market/rfqs/${r.id}/messages/${x.vendor.id}`} me="ADMIN" hint="تظهر رسالتك للطرفين باسم إدارة FARJAR." />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="سجل الطلب">
            <ol className="space-y-2 text-sm">
              {r.events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {RFQ_EVENT_LABEL[e.action] ?? e.action} {e.actorName && <span className="text-muted">— {e.actorName}</span>} {e.note && <span className="text-muted">({e.note})</span>}
                  </span>
                  <span className="text-xs text-muted">{formatDate(e.createdAt, true)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="العميل">
            <DefList
              cols={1}
              items={[
                ['الشركة', r.companyName],
                ['المسؤول', r.contactName],
                ['الهاتف', <a key="p" href={`tel:${r.phone}`} className="ltr underline">{r.phone}</a>],
                r.email && ['البريد', <span key="e" className="ltr">{r.email}</span>],
                ['الموقع', [r.city, r.location].filter(Boolean).join(' — ') || '—'],
                ['تاريخ الحاجة', r.neededBy ? formatDate(r.neededBy) : '—'],
                ['الميزانية', r.budget != null ? formatJOD(r.budget) : '—'],
                r.product && ['من منتج', <Link key="pr" to={`/store/${r.product.slug}`} className="underline">{r.product.name}</Link>],
                ['حساب العميل', <Link key="c" to={`/admin/customers/${r.customer.id}`} className="underline">{r.customer.name}</Link>],
              ]}
            />
          </Panel>
          <Panel title="الـ Lead والصفقة">
            <div className="space-y-3">
              <Select label="التصنيف" value={edit.categoryId} onChange={(e) => setValues({ ...edit, categoryId: e.target.value })}>
                <option value="">—</option>
                {allCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input label="قيمة الصفقة المتوقعة" type="number" min={0} className="ltr text-start" value={edit.expectedValue} onChange={(e) => setValues({ ...edit, expectedValue: e.target.value })} />
              <Input label="قيمة الصفقة النهائية" type="number" min={0} className="ltr text-start" value={edit.finalValue} onChange={(e) => setValues({ ...edit, finalValue: e.target.value })} hint="تغييرها يعيد حساب العمولة حسب القواعد" />
              <div className="rounded-lg bg-subtle p-3 text-sm">
                العمولة: <b className="tabular-nums">{r.commissionAmount != null ? formatJOD(r.commissionAmount) : '—'}</b>
                {r.commissionRate != null && <span className="text-muted"> ({Number(r.commissionRate)}%{r.commissionRule ? ` — ${r.commissionRule.name}` : ''})</span>}
              </div>
              <Textarea label="ملاحظة داخلية" rows={2} value={edit.adminNote} onChange={(e) => setValues({ ...edit, adminNote: e.target.value })} />
              {values && (
                <Button size="sm" loading={m.pending === 'save'} onClick={save}>
                  حفظ
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Modal open={houseOpen} onClose={() => setHouseOpen(false)} title={houseQuote ? 'تعديل عرض متجر FARJAR' : 'عرض سعر من متجر FARJAR'} size="lg">
        <p className="mb-4 text-sm text-muted">يصل العرض للعميل باسم متجر FARJAR ويظهر في مقارنة العروض بجانب عروض الموردين. لا تُحتسب عليه رسوم Lead أو عمولة.</p>
        {houseOpen && (
          <QuoteForm
            rfqId={r.id}
            endpoint={`/admin/market/rfqs/${r.id}/house-quote`}
            initial={(houseQuote as unknown as Parameters<typeof QuoteForm>[0]['initial']) ?? null}
            defaultQty={qty}
            onDone={() => (setHouseOpen(false), q.retry())}
            onCancel={() => setHouseOpen(false)}
          />
        )}
      </Modal>
      <Modal
        open={distOpen}
        onClose={() => setDistOpen(false)}
        title="إرسال الطلب لموردين"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDistOpen(false)}>
              إلغاء
            </Button>
            <Button loading={m.pending === 'dist'} disabled={!picked.length} onClick={async () => (await m.run('dist', () => api.post(`/admin/market/rfqs/${r.id}/distribute`, { vendorIds: picked }), 'تم إرسال الطلب')) && (setDistOpen(false), q.retry())}>
              إرسال إلى {picked.length}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">الموردون المقترحون حسب التصنيف والمنتجات والباقة والتوثيق والتقييم (من لم يُرسل لهم بعد).</p>
        {sugg.loading ? (
          <p className="text-sm text-muted">جاري التحميل…</p>
        ) : !sugg.data?.length ? (
          <p className="text-sm text-muted">لا يوجد موردون مناسبون إضافيون.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {sugg.data.map((s) => (
              <li key={s.id}>
                <Checkbox
                  label={`${s.isHouse ? 'FARJAR' : s.name}${s.city ? ` — ${s.city}` : ''}`}
                  description={`${s.plan?.name ?? ''} · ${s.products} منتج في التصنيف${s.servesCategory ? ' · يخدم التصنيف' : ''}${s.verified ? ' · موثّق' : ''}${s.rating ? ` · ${s.rating.toFixed(1)}★` : ''}`}
                  checked={picked.includes(s.id)}
                  onChange={(on) => setPicked((l) => (on ? [...l, s.id] : l.filter((x) => x !== s.id)))}
                />
              </li>
            ))}
          </ul>
        )}
        {m.error && <Alert tone="error" className="mt-3">{m.error}</Alert>}
      </Modal>

      <Modal
        open={Boolean(closeOpen)}
        onClose={() => setCloseOpen(null)}
        title={closeOpen === 'cancel' ? 'إلغاء الطلب' : 'إغلاق الطلب (تمت الصفقة)'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(null)}>
              تراجع
            </Button>
            <Button
              variant={closeOpen === 'cancel' ? 'danger' : 'primary'}
              loading={m.pending === 'close'}
              onClick={async () =>
                (await m.run('close', () => api.post(`/admin/market/rfqs/${r.id}/close`, { cancel: closeOpen === 'cancel', finalValue: closeOpen === 'close' && edit.finalValue ? Number(edit.finalValue) : null }), 'تم')) && (setCloseOpen(null), q.retry())
              }
            >
              تأكيد
            </Button>
          </>
        }
      >
        <p className="text-sm">{closeOpen === 'cancel' ? 'يُبلَّغ الموردون ولا تُقبل عروض جديدة.' : `يُغلق الطلب${edit.finalValue ? ` بقيمة نهائية ${formatJOD(Number(edit.finalValue))}` : ''}.`}</p>
      </Modal>

      <Modal
        open={Boolean(delivery)}
        onClose={() => setDelivery(null)}
        title="إنشاء طلب توصيل من العرض المقبول"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDelivery(null)}>
              إلغاء
            </Button>
            <Button
              loading={m.pending === 'deliv'}
              onClick={async () => {
                const o = await m.run('deliv', () => api.post<{ id: string; code: string }>(`/admin/market/rfqs/${r.id}/delivery-order`, delivery), 'تم إنشاء طلب التوصيل');
                if (o) navigate(`/admin/delivery/orders/${o.id}`);
              }}
            >
              إنشاء
            </Button>
          </>
        }
      >
        {delivery && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              من المورد {accepted?.vendor.name} إلى {r.companyName} بقيمة {accepted ? formatJOD(accepted.total) : ''}. يدخل نظام التوصيل لإسناده لموظف وتتبعه.
            </p>
            <Input label="عنوان التسليم" value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} error={m.fieldErrors.address} />
            <Input label="المنطقة" value={delivery.area} onChange={(e) => setDelivery({ ...delivery, area: e.target.value })} />
            {m.error && <Alert tone="error">{m.error}</Alert>}
          </div>
        )}
      </Modal>
    </AdminPage>
  );
}
