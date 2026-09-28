import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, FilterBar, FilterSelect, Ltr, Panel, SearchInput } from '../../components/admin/ui';
import { DeliveryOrderForm } from '../../components/delivery/DeliveryOrderForm';
import { DeliveryStatusTag, FinancialTag } from '../../components/delivery/Tags';
import { DeliveryTimeline } from '../../components/delivery/Timeline';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { Button, ButtonLink, ErrorState, Icon } from '../../components/ui';
import { useSite } from '../../context/SiteContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { ALL_STATUSES, PAY_LABEL, STATUS_LABEL, type DeliveryStatus, type FinancialStatus } from '../../lib/delivery';
import { formatDate, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type SupplierOrder = {
  id: string;
  code: string;
  number: number;
  source: string;
  deliveryStatus: DeliveryStatus;
  financialStatus: FinancialStatus | null;
  customerName: string;
  phone: string;
  address: string;
  area: string | null;
  pickupAddress: string | null;
  total: number;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  customerPaysFee: boolean;
  paymentMethod: string;
  codAmount: number;
  codCollected: boolean;
  notes: string | null;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  driver: { name: string; phone: string | null } | null;
  statusEvents: { toStatus: DeliveryStatus; fromStatus: DeliveryStatus | null; note: string | null; createdAt: string }[];
  proof: { recipientName: string; deliveredAt: string } | null;
};

/** المورد يلغي طلبه فقط قبل استلامه من الموظف */
const CANCELLABLE: DeliveryStatus[] = ['NEW', 'ACCEPTED', 'PICKUP_ASSIGNED', 'RESCHEDULED'];

/** قائمة طلبات التوصيل التي أنشأها المورد */
export function VendorDeliveryList() {
  useDocumentTitle('طلبات التوصيل');
  const f = useFilters(['status', 'q'] as const);
  const list = useAdminQuery(
    () => api.get<Paged<SupplierOrder>>('/vendor/delivery-orders', { ...f.values, page: f.page, pageSize: 20 }),
    [f.values.status, f.values.q, f.page],
    { keep: true },
  );

  const columns: Column<SupplierOrder>[] = [
    {
      key: 'code',
      header: 'الطلب',
      cell: (o) => (
        <span>
          <Ltr className="block font-semibold">{o.code}</Ltr>
          <span className="text-xs text-muted">{formatDate(o.createdAt, true)}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'العميل',
      cell: (o) => (
        <span>
          <span className="block">{o.customerName}</span>
          <span className="text-xs text-muted">{o.area ?? o.address}</span>
        </span>
      ),
    },
    { key: 'collect', header: 'المطلوب تحصيله', cell: (o) => <span className="tabular-nums">{formatJOD(o.codAmount)}</span>, hideOnMobile: true },
    { key: 'fin', header: 'الدفع', cell: (o) => <FinancialTag status={o.financialStatus} />, hideOnMobile: true },
    { key: 'status', header: 'الحالة', cell: (o) => <DeliveryStatusTag status={o.deliveryStatus} /> },
  ];

  return (
    <AdminPage
      title="طلبات التوصيل"
      description="أنشئ طلب توصيل لعملائك وتابع حالته حتى التسليم والتحصيل."
      actions={
        <ButtonLink to="/vendor/delivery/new" size="sm">
          <Icon name="plus" className="h-4 w-4" /> طلب جديد
        </ButtonLink>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="رقم الطلب أو اسم العميل" />
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">كل الحالات</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(o) => o.id}
        rowHref={(o) => `/vendor/delivery/${o.id}`}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: f.active ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات توصيل بعد', description: f.active ? undefined : 'ابدأ بإنشاء أول طلب توصيل.' }}
      />
    </AdminPage>
  );
}

export function VendorDeliveryNew() {
  useDocumentTitle('طلب توصيل جديد');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings } = useSite();
  return (
    <AdminPage title="طلب توصيل جديد" back={{ to: '/vendor/delivery', label: 'طلبات التوصيل' }}>
      <DeliveryOrderForm
        feeEditable={false}
        defaultFee={settings.deliveryFeeDefault ?? 3}
        onSubmit={async (body) => {
          const o = await api.post<{ id: string; code: string }>('/vendor/delivery-orders', body);
          toast(`تم إنشاء الطلب ${o.code}`);
          navigate(`/vendor/delivery/${o.id}`, { replace: true });
        }}
      />
    </AdminPage>
  );
}

export function VendorDeliveryDetail() {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<SupplierOrder>(`/vendor/delivery-orders/${id}`), [id]);
  const m = useMutation();
  const [cancel, setCancel] = useState(false);
  useDocumentTitle(q.data?.code ?? 'طلب توصيل');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  const o = q.data;
  const timeline = o.statusEvents.filter((e) => e.fromStatus !== e.toStatus).map((e) => ({ status: e.toStatus, at: e.createdAt }));

  return (
    <AdminPage
      title={<Ltr>{o.code}</Ltr>}
      back={{ to: '/vendor/delivery', label: 'طلبات التوصيل' }}
      actions={
        CANCELLABLE.includes(o.deliveryStatus) && (
          <Button variant="ghost" size="sm" onClick={() => setCancel(true)} className="text-danger">
            <Icon name="xCircle" className="h-4 w-4" /> إلغاء الطلب
          </Button>
        )
      }
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="الطلب">
            <div className="mb-4 flex flex-wrap gap-2">
              <DeliveryStatusTag status={o.deliveryStatus} />
              <FinancialTag status={o.financialStatus} />
            </div>
            <DefList
              items={[
                ['العميل', o.customerName],
                ['الهاتف', <Ltr key="p">{o.phone}</Ltr>],
                ['منطقة التوصيل', o.area || '—'],
                ['عنوان التسليم', o.address],
                ['عنوان الاستلام', o.pickupAddress || 'عنوان المتجر'],
                ['تاريخ الإنشاء', formatDate(o.createdAt, true)],
                o.driver && ['موظف التوصيل', `${o.driver.name}${o.driver.phone ? ` · ${o.driver.phone}` : ''}`],
                o.proof && ['المستلم', `${o.proof.recipientName} · ${formatDate(o.proof.deliveredAt, true)}`],
                o.notes && ['ملاحظات', o.notes],
              ]}
            />
          </Panel>
          <Panel title="المنتجات">
            <ul className="divide-y divide-line text-sm">
              {o.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    {it.name} <span className="text-muted">× {it.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatJOD(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
              <Row label="قيمة المنتجات" value={formatJOD(o.subtotal)} />
              {o.discountTotal > 0 && <Row label="الخصم" value={`−${formatJOD(o.discountTotal)}`} />}
              <Row label={`أجرة التوصيل${o.customerPaysFee ? '' : ' (على المورد)'}`} value={formatJOD(o.deliveryFee)} />
              <Row label="طريقة الدفع" value={PAY_LABEL[o.paymentMethod] ?? o.paymentMethod} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>المطلوب تحصيله</dt>
                <dd className="tabular-nums">{formatJOD(o.codAmount)}</dd>
              </div>
            </dl>
          </Panel>
        </div>
        <Panel title="حالة التوصيل">
          <DeliveryTimeline status={o.deliveryStatus} timeline={timeline} />
        </Panel>
      </div>
      <ConfirmDialog
        open={cancel}
        title="إلغاء طلب التوصيل؟"
        confirmLabel="إلغاء الطلب"
        tone="danger"
        loading={m.pending === 'cancel'}
        onClose={() => setCancel(false)}
        onConfirm={async () => {
          const r = await m.run('cancel', () => api.post(`/vendor/delivery-orders/${o.id}/cancel`, {}), 'تم إلغاء الطلب');
          setCancel(false);
          if (r) q.retry();
        }}
      >
        <p className="text-sm text-muted">لا يمكن التراجع عن الإلغاء.</p>
      </ConfirmDialog>
    </AdminPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
