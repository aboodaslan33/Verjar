import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, FilterBar, FilterSelect, Panel, SearchInput } from '../../../components/admin/ui';
import { PlanBadge, VerifiedMark } from '../../../components/market/Badges';
import { Alert, Button, Checkbox, ErrorState, Icon, Input, Modal, Select, Tag, Textarea } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatDate, formatJOD } from '../../../lib/format';
import { AD_STATUS_LABEL, AD_TYPE_LABEL, INVOICE_PURPOSE_LABEL, INVOICE_STATUS_LABEL, VENDOR_STATUS_LABEL, vendorStatusTone, type MarketFile, type VendorStatus } from '../../../lib/market';
import type { Paged } from '../../../lib/types';
import { useDocumentTitle } from '../../../lib/useAsync';

type Row = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: VendorStatus;
  verified: boolean;
  isHouse: boolean;
  city: string | null;
  businessField: string | null;
  createdAt: string;
  planExpiresAt: string | null;
  plan: { code: string; name: string } | null;
  customer: { name: string; phone: string } | null;
  _count: { products: number; rfqRecipients: number; quotes: number };
};

/** الموردون في السوق: المراجعة والاعتماد والتوثيق والباقات */
export function MarketSuppliers() {
  useDocumentTitle('الموردون والاعتماد');
  const f = useFilters(['status', 'q', 'plan', 'verified'] as const);
  const list = useAdminQuery(() => api.get<Paged<Row> & { statusCounts: Record<string, number> }>('/admin/market/suppliers', { ...f.values, page: f.page, pageSize: 30 }), [JSON.stringify(f.values), f.page], { keep: true });
  const cols: Column<Row>[] = [
    {
      key: 'name',
      header: 'المورد',
      cell: (v) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold">{v.isHouse ? 'FARJAR' : v.name}</span>
          {v.verified && <VerifiedMark />}
          <PlanBadge plan={v.plan ? { code: v.plan.code, badge: v.plan.code === 'FREE' ? null : v.plan.code } : null} />
        </span>
      ),
    },
    { key: 'city', header: 'المدينة', cell: (v) => v.city ?? '—', hideOnMobile: true },
    { key: 'field', header: 'المجال', cell: (v) => <span className="line-clamp-1 max-w-[14rem]">{v.businessField ?? '—'}</span>, hideOnMobile: true },
    { key: 'counts', header: 'منتجات / طلبات', cell: (v) => <span className="num">{v._count.products} / {v._count.rfqRecipients}</span> },
    { key: 'status', header: 'الحالة', cell: (v) => <Tag tone={vendorStatusTone(v.status)}>{VENDOR_STATUS_LABEL[v.status]}</Tag> },
    { key: 'date', header: 'التسجيل', cell: (v) => formatDate(v.createdAt), hideOnMobile: true },
  ];
  const c = list.data?.statusCounts ?? {};
  return (
    <AdminPage title="الموردون والاعتماد" description="راجع طلبات الانضمام، اعتمد ووثّق الموردين، وغيّر باقاتهم.">
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="الاسم، المدينة، الهاتف…" />
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">الكل</option>
          {(Object.keys(VENDOR_STATUS_LABEL) as VendorStatus[]).map((k) => (
            <option key={k} value={k}>
              {VENDOR_STATUS_LABEL[k]} ({c[k] ?? 0})
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="الباقة" value={f.values.plan} onChange={(e) => f.set({ plan: e.target.value })}>
          <option value="">الكل</option>
          <option value="FREE">Free</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
        </FilterSelect>
        <FilterSelect label="التوثيق" value={f.values.verified} onChange={(e) => f.set({ verified: e.target.value })}>
          <option value="">الكل</option>
          <option value="true">موثّق</option>
          <option value="false">غير موثّق</option>
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={cols}
        rowKey={(v) => v.id}
        rowHref={(v) => `/admin/market/suppliers/${v.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: 'لا يوجد موردون مطابقون' }}
      />
    </AdminPage>
  );
}

type Detail = Row & {
  description: string;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  licenseNumber: string | null;
  productTypes: string | null;
  rejectionReason: string | null;
  catalogFiles: MarketFile[];
  certificates: MarketFile[];
  categories: { id: string; name: string }[];
  planId: string | null;
  planStartedAt: string | null;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  members: { id: string; role: string; customer: { name: string; phone: string } }[];
  subscriptions: { id: string; status: string; amount: number; startsAt: string | null; endsAt: string | null; createdAt: string; note: string | null; plan: { name: string }; invoice: { number: string; status: string } | null }[];
  invoices: { id: string; number: string; purpose: string; amount: number; status: string; createdAt: string }[];
  ads: { id: string; type: string; status: string; startsAt: string; endsAt: string; product: { name: string } | null }[];
  stats: { products: Record<string, number>; rfqs: number; quotes: number; deals: { count: number; value: number }; rating: { average: number; count: number } | null };
};

export function MarketSupplierDetail() {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/market/suppliers/${id}`), [id]);
  const plans = useAdminQuery(() => api.get<{ id: string; name: string; price: number }[]>('/admin/market/plans'), []);
  const m = useMutation();
  const [statusDlg, setStatusDlg] = useState<VendorStatus | null>(null);
  const [reason, setReason] = useState('');
  const [planDlg, setPlanDlg] = useState(false);
  const [planId, setPlanId] = useState('');
  const [charge, setCharge] = useState(false);
  const [days, setDays] = useState('');
  useDocumentTitle(q.data?.name ?? 'المورد');
  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  const v = q.data;
  const setStatus = async () => {
    if (!statusDlg) return;
    const r = await m.run('status', () => api.post(`/admin/market/suppliers/${v.id}/status`, { status: statusDlg, reason: reason.trim() || null }), 'تم تحديث الحالة');
    if (r) {
      setStatusDlg(null);
      setReason('');
      q.retry();
    }
  };
  const files = [...v.catalogFiles.map((f) => ({ ...f, g: 'كتالوج' })), ...v.certificates.map((f) => ({ ...f, g: 'شهادة' }))];

  return (
    <AdminPage
      back={{ to: '/admin/market/suppliers', label: 'الموردون' }}
      title={v.isHouse ? 'FARJAR' : v.name}
      meta={
        <>
          <Tag tone={vendorStatusTone(v.status)}>{VENDOR_STATUS_LABEL[v.status]}</Tag>
          {v.verified && <VerifiedMark label />}
          {v.plan && <Tag tone="dark">{v.plan.name}</Tag>}
        </>
      }
      actions={
        <>
          {v.status !== 'APPROVED' && (
            <Button size="sm" loading={m.pending === 'status' && statusDlg === 'APPROVED'} onClick={() => setStatusDlg('APPROVED')}>
              <Icon name="check" className="h-4 w-4" /> اعتماد
            </Button>
          )}
          {v.status === 'PENDING' && (
            <Button size="sm" variant="outline" onClick={() => setStatusDlg('REJECTED')}>
              رفض
            </Button>
          )}
          {v.status === 'APPROVED' && !v.isHouse && (
            <Button size="sm" variant="outline" onClick={() => setStatusDlg('SUSPENDED')}>
              تعليق
            </Button>
          )}
          <Button size="sm" variant="outline" loading={m.pending === 'verify'} onClick={async () => (await m.run('verify', () => api.post(`/admin/market/suppliers/${v.id}/verify`, { verified: !v.verified }), v.verified ? 'أُزيل التوثيق' : 'تم التوثيق')) && q.retry()}>
            {v.verified ? 'إزالة التوثيق' : 'توثيق ✔'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => (setPlanId(v.planId ?? ''), setPlanDlg(true))}>
            تغيير الباقة
          </Button>
          <a href={`/store/vendor/${v.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <Icon name="external" className="h-4 w-4" /> الصفحة العامة
          </a>
        </>
      }
    >
      {v.rejectionReason && v.status !== 'APPROVED' && (
        <Alert tone="error" className="mb-6">
          الملاحظة للمورد: {v.rejectionReason}
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="بيانات الشركة">
            <DefList
              items={[
                ['المسؤول', v.contactName ?? '—'],
                ['الهاتف', <span key="p" className="ltr">{v.phone ?? v.customer?.phone ?? '—'}</span>],
                ['WhatsApp', <span key="w" className="ltr">{v.whatsapp ?? '—'}</span>],
                ['البريد', <span key="e" className="ltr">{v.email ?? v.customer?.email ?? '—'}</span>],
                ['المدينة', v.city ?? '—'],
                ['العنوان', v.address ?? '—'],
                ['مجال العمل', v.businessField ?? '—'],
                ['رقم التسجيل/الترخيص', v.licenseNumber ?? '—'],
                ['نوع المنتجات', v.productTypes ?? '—'],
                ['التصنيفات', v.categories.map((c) => c.name).join('، ') || '—'],
                ['حساب المالك', v.customer ? `${v.customer.name} · ${v.customer.phone}` : '—'],
                ['تاريخ التسجيل', formatDate(v.createdAt)],
              ]}
            />
            {v.description && <p className="mt-4 whitespace-pre-line text-sm text-muted">{v.description}</p>}
          </Panel>
          {files.length > 0 && (
            <Panel title="الكتالوج والشهادات">
              <ul className="space-y-1.5 text-sm">
                {files.map((f, i) => (
                  <li key={i}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                      <Icon name="file" className="h-4 w-4 text-muted" /> {f.name} <span className="text-xs text-muted">({f.g})</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="الاشتراكات">
            {v.subscriptions.length === 0 ? (
              <p className="text-sm text-muted">لا يوجد سجل اشتراكات.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {v.subscriptions.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {s.plan.name} · {formatJOD(s.amount)} {s.note && <span className="text-muted">({s.note})</span>}
                    </span>
                    <span className="text-muted">
                      {s.status} {s.startsAt && `· ${formatDate(s.startsAt)} ← ${s.endsAt ? formatDate(s.endsAt) : '—'}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="الفواتير والإعلانات">
            <ul className="divide-y divide-line text-sm">
              {v.invoices.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 py-2">
                  <span>
                    <span className="ltr">{i.number}</span> · {INVOICE_PURPOSE_LABEL[i.purpose] ?? i.purpose}
                  </span>
                  <span>
                    {formatJOD(i.amount)} · {INVOICE_STATUS_LABEL[i.status] ?? i.status}
                  </span>
                </li>
              ))}
              {v.ads.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {AD_TYPE_LABEL[a.type]} {a.product && `— ${a.product.name}`}
                  </span>
                  <span>{AD_STATUS_LABEL[a.status]}</span>
                </li>
              ))}
              {!v.invoices.length && !v.ads.length && <li className="py-2 text-muted">لا يوجد.</li>}
            </ul>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="الأداء">
            <DefList
              cols={1}
              items={[
                ['المنتجات', `${v.stats.products.APPROVED ?? 0} معتمد · ${v.stats.products.PENDING ?? 0} بانتظار المراجعة`],
                ['طلبات عروض أسعار', String(v.stats.rfqs)],
                ['العروض المقدمة', String(v.stats.quotes)],
                ['الصفقات', `${v.stats.deals.count} · ${formatJOD(v.stats.deals.value)}`],
                ['التقييم', v.stats.rating ? `${v.stats.rating.average}/5 (${v.stats.rating.count})` : '—'],
                ['الباقة', v.plan ? `${v.plan.name}${v.planExpiresAt ? ` حتى ${formatDate(v.planExpiresAt)}` : ''}` : '—'],
              ]}
            />
            <Link to={`/admin/products?vendorId=${v.id}`} className="mt-3 inline-block text-sm underline">
              منتجات المورد
            </Link>
          </Panel>
          <Panel title="المستخدمون">
            <ul className="space-y-1.5 text-sm">
              {v.members.map((mb) => (
                <li key={mb.id} className="flex justify-between">
                  <span>{mb.customer.name}</span>
                  <span className="text-muted">{mb.role === 'OWNER' ? 'المالك' : 'موظف'}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Modal
        open={Boolean(statusDlg)}
        onClose={() => setStatusDlg(null)}
        title={statusDlg === 'APPROVED' ? 'اعتماد المورد' : statusDlg === 'REJECTED' ? 'رفض طلب الانضمام' : 'تعليق المورد'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusDlg(null)}>
              إلغاء
            </Button>
            <Button variant={statusDlg === 'APPROVED' ? 'primary' : 'danger'} loading={m.pending === 'status'} onClick={setStatus}>
              تأكيد
            </Button>
          </>
        }
      >
        {statusDlg === 'APPROVED' ? (
          <p>يظهر المورد ومنتجاته المعتمدة في السوق، ويبدأ باستقبال طلبات عروض الأسعار. يصله إشعار وبريد.</p>
        ) : (
          <Textarea label="السبب (يظهر للمورد)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={m.fieldErrors.reason} />
        )}
      </Modal>
      <Modal
        open={planDlg}
        onClose={() => setPlanDlg(false)}
        title="تغيير باقة المورد"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanDlg(false)}>
              إلغاء
            </Button>
            <Button
              loading={m.pending === 'plan'}
              disabled={!planId}
              onClick={async () => (await m.run('plan', () => api.post(`/admin/market/suppliers/${v.id}/plan`, { planId, charge, ...(days ? { days: Number(days) } : {}) }), charge ? 'صدرت فاتورة الاشتراك' : 'تم تفعيل الباقة')) && (setPlanDlg(false), q.retry())}
            >
              تأكيد
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="الباقة" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">اختر</option>
            {plans.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatJOD(p.price)}
              </option>
            ))}
          </Select>
          <Checkbox label="إصدار فاتورة (تُفعّل الباقة بعد الدفع)" description="بدونها تُفعّل مباشرة كمنحة من الإدارة" checked={charge} onChange={setCharge} />
          {!charge && <Input label="المدة بالأيام (اختياري)" type="number" min={1} className="ltr text-start" value={days} onChange={(e) => setDays(e.target.value)} hint="فارغ = مدة الباقة الافتراضية" />}
          {m.error && <Alert tone="error">{m.error}</Alert>}
        </div>
      </Modal>
    </AdminPage>
  );
}
