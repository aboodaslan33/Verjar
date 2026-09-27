import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { Alert, Button, ButtonA, ErrorState, Icon, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { STATUS_LABEL, displayPhone, formatDate, formatJOD } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import type { VendorOrder } from './types';

/** الخطوة التالية المقترحة لكل حالة */
const NEXT: Partial<Record<RequestStatus, RequestStatus>> = {
  NEW: 'CONFIRMED',
  UNDER_REVIEW: 'CONFIRMED',
  PRICED: 'CONFIRMED',
  CONFIRMED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};
const NEXT_LABEL: Partial<Record<RequestStatus, string>> = {
  CONFIRMED: 'تأكيد الطلب',
  IN_PROGRESS: 'بدء التجهيز',
  COMPLETED: 'تم التسليم',
};

export default function VendorOrderDetail() {
  const { id } = useParams();
  const q = useAdminQuery(() => api.get<VendorOrder>(`/vendor/orders/${id}`), [id]);
  const m = useMutation();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const o = q.data;
  useDocumentTitle(o ? `طلب #${o.number}` : 'طلب');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !o)
    return (
      <AdminPage title="الطلب" back={{ to: '/vendor/orders', label: 'الطلبات' }}>
        <ErrorState message={q.error?.message ?? 'الطلب غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const setStatus = async (status: RequestStatus) => {
    const r = await m.run('status', () => api.patch<VendorOrder>(`/vendor/orders/${o.id}`, { status }), `الحالة الآن: ${STATUS_LABEL[status]}`);
    setConfirmCancel(false);
    if (r) q.setData(r);
  };

  const next = NEXT[o.status];
  const locked = o.status === 'CANCELLED' || o.status === 'COMPLETED' || !!o.payoutId;

  return (
    <AdminPage
      back={{ to: '/vendor/orders', label: 'الطلبات' }}
      title={`طلب #${o.number}`}
      meta={
        <>
          <StatusBadge status={o.status} />
          <span className="text-xs text-muted">{formatDate(o.createdAt, true)}</span>
        </>
      }
      actions={
        <ButtonA href={`tel:+${o.order.phone}`} variant="outline" size="sm">
          <Icon name="phone" className="h-4 w-4" /> اتصال بالعميل
        </ButtonA>
      }
    >
      {o.payoutId && (
        <Alert tone="success" className="mb-4">
          تمت تسوية هذا الطلب ودُفع صافيه لك.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={`المنتجات (${o.items.length})`} bodyClassName="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {o.items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-muted">
                      {it.quantity} × {formatJOD(it.unitFinalPrice)}
                      {it.discountPercent > 0 && ` (خصم ${it.discountPercent}%)`} · عمولة {it.commissionPercent}%
                    </p>
                  </div>
                  <b className="tabular-nums">{formatJOD(it.lineTotal)}</b>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line bg-subtle/40 px-4 py-4 text-sm sm:px-5">
              <div className="flex justify-between">
                <dt className="text-muted">المبلغ</dt>
                <dd className="tabular-nums">{formatJOD(o.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">عمولة المنصة</dt>
                <dd className="tabular-nums">− {formatJOD(o.commissionTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>صافيك</dt>
                <dd className="tabular-nums">{formatJOD(o.vendorNet)}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="التوصيل">
            <DefList
              items={[
                ['العميل', o.order.customerName],
                ['الهاتف', <span className="ltr">{displayPhone(o.order.phone)}</span>],
                ['العنوان', o.order.address],
                o.order.notes && ['ملاحظات', <span className="whitespace-pre-line">{o.order.notes}</span>],
              ]}
            />
          </Panel>
        </div>
        <Panel title="حالة الطلب">
          {locked ? (
            <p className="text-sm text-muted">
              {o.status === 'CANCELLED' ? 'الطلب ملغي ورجعت الكميات للمخزون. لإعادة تفعيله تواصل مع الإدارة.' : 'الطلب مكتمل.'}
            </p>
          ) : (
            <div className="space-y-3">
              {next && (
                <Button block loading={m.pending === 'status'} onClick={() => setStatus(next)}>
                  {NEXT_LABEL[next]}
                </Button>
              )}
              {o.status !== 'COMPLETED' && next !== 'COMPLETED' && (
                <Button block variant="outline" disabled={m.busy} onClick={() => setStatus('COMPLETED')}>
                  تم التسليم
                </Button>
              )}
              <Button block variant="ghost" className="text-danger" disabled={m.busy} onClick={() => setConfirmCancel(true)}>
                إلغاء الطلب
              </Button>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">صافيك يصبح مستحقًا عند اكتمال الطلب، وتدفعه الإدارة في التسوية التالية.</p>
        </Panel>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        title="إلغاء الطلب"
        confirmLabel="إلغاء الطلب"
        loading={m.pending === 'status'}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => setStatus('CANCELLED')}
      >
        ستعود الكميات للمخزون ويُبلَّغ العميل. لا يمكنك التراجع عن الإلغاء بنفسك.
      </ConfirmDialog>
    </AdminPage>
  );
}
