import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { FileUploadForm } from '../../components/admin/FileUploadForm';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { PaymentForm } from '../../components/admin/PaymentForm';
import { PaymentsList, WhatsAppLogList } from '../../components/admin/RecordLists';
import { StatusSelect } from '../../components/admin/StatusSelect';
import type { OrderDetail as Order, WaResult } from '../../components/admin/types';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { WhatsAppFallback } from '../../components/admin/WhatsAppFallback';
import { Alert, Button, ButtonA, Checkbox, ErrorState, Icon, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { displayPhone, formatDate, formatJOD } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function OrderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useAdminQuery(() => api.get<Order>(`/admin/orders/${id}`), [id]);
  const m = useMutation();
  const [wa, setWa] = useState<{ result: WaResult; label: string } | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const o = q.data;
  useDocumentTitle(o ? `طلب #${o.number}` : 'طلب');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !o)
    return (
      <AdminPage title="الطلب" back={{ to: '/admin/orders', label: 'طلبات المتجر' }}>
        <ErrorState message={q.error?.message ?? 'الطلب غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const paid = o.payments.reduce((s, p) => s + p.amount, 0);

  const resend = async (to: 'admin' | 'customer') => {
    const r = await m.run(`wa-${to}`, () => api.post<{ link: string; sent: boolean }>(`/admin/orders/${o.id}/whatsapp`, { to }));
    if (r) {
      setWa({ result: r, label: to === 'admin' ? 'فتح رسالة الإدارة في واتساب' : 'إرسال للعميل عبر واتساب' });
      q.reload();
    }
  };

  return (
    <AdminPage
      back={{ to: '/admin/orders', label: 'طلبات المتجر' }}
      title={`طلب #${o.number}`}
      meta={
        <>
          <StatusBadge status={o.status} />
          <span className="text-xs text-muted">
            المرجع <span className="ltr">{o.ref}</span> · {formatDate(o.createdAt, true)}
          </span>
        </>
      }
      actions={
        <>
          <ButtonA href={`tel:+${o.phone}`} variant="outline" size="sm">
            <Icon name="phone" className="h-4 w-4" /> اتصال
          </ButtonA>
          <ButtonA href={`https://wa.me/${o.phone}`} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm">
            <Icon name="whatsapp" className="h-4 w-4" /> واتساب
          </ButtonA>
        </>
      }
    >
      {wa && (
        <div className="mb-4">
          <WhatsAppFallback result={wa.result} label={wa.label} onDismiss={() => setWa(null)} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={`المنتجات (${o.items.length})`} bodyClassName="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {o.items.map((it) => {
                const thumb = it.product?.media.find((x) => x.kind === 'IMAGE')?.url;
                return (
                  <li key={it.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
                      {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/admin/products/${it.productId}`} className="line-clamp-1 font-medium hover:text-brand-700 dark:hover:text-brand-200">
                        {it.name}
                      </Link>
                      <p className="text-xs text-muted">
                        <span className="tabular-nums">{it.quantity}</span> × {formatJOD(it.unitFinalPrice)}
                        {it.discountPercent > 0 && (
                          <>
                            {' '}
                            (<s>{formatJOD(it.unitPrice)}</s> خصم {it.discountPercent}%)
                          </>
                        )}
                      </p>
                    </div>
                    <b className="shrink-0 tabular-nums">{formatJOD(it.lineTotal)}</b>
                  </li>
                );
              })}
            </ul>
            <dl className="space-y-1.5 border-t border-line bg-subtle/40 px-4 py-4 text-sm sm:px-5">
              <div className="flex justify-between">
                <dt className="text-muted">المجموع قبل الخصم</dt>
                <dd className="tabular-nums">{formatJOD(o.subtotal)}</dd>
              </div>
              {o.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">الخصم</dt>
                  <dd className="tabular-nums text-success">− {formatJOD(o.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>الإجمالي</dt>
                <dd className="tabular-nums">{formatJOD(o.total)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="العميل والتوصيل">
            <DefList
              items={[
                ['الاسم', <Link to={`/admin/customers/${o.customerId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200">{o.customerName}</Link>],
                ['الهاتف', <span className="ltr">{displayPhone(o.phone)}</span>],
                ['العنوان', o.address],
                o.notes && ['ملاحظات', <span className="whitespace-pre-line">{o.notes}</span>],
              ]}
            />
          </Panel>

          <Panel
            title="الدفعات"
            actions={
              !showPay && (
                <Button size="sm" variant="outline" onClick={() => setShowPay(true)}>
                  <Icon name="plus" className="h-4 w-4" /> إضافة دفعة
                </Button>
              )
            }
          >
            {showPay && (
              <div className="mb-4 rounded-xl border border-line bg-subtle/40 p-4">
                <PaymentForm
                  customerId={o.customerId}
                  orderId={o.id}
                  onCancel={() => setShowPay(false)}
                  onSaved={() => {
                    setShowPay(false);
                    q.reload();
                  }}
                />
              </div>
            )}
            <PaymentsList payments={o.payments} onDeleted={() => q.reload()} />
            <p className="mt-3 border-t border-line pt-3 text-sm">
              المدفوع <b>{formatJOD(paid)}</b> من {formatJOD(o.total)}
              {o.total - paid > 0.0005 && (
                <>
                  {' '}
                  · المتبقي <b className="text-warn">{formatJOD(o.total - paid)}</b>
                </>
              )}
            </p>
          </Panel>

          <Panel title="رفع فاتورة">
            <FileUploadForm target={{ orderId: o.id }} kinds={['INVOICE', 'OTHER']} defaultKind="INVOICE" defaultTitle={`فاتورة طلب #${o.number}`} showAmount />
            <p className="mt-3 text-xs text-muted">
              الملفات المرفوعة تظهر في صفحة العميل. <Link to={`/admin/customers/${o.customerId}`} className="underline">عرض ملفات العميل</Link>
            </p>
          </Panel>

          <Panel title="سجل واتساب">
            <WhatsAppLogList logs={o.whatsappLogs} />
          </Panel>
        </div>

        <div className="space-y-6">
          <StatusPanel
            key={o.updatedAt}
            order={o}
            onSaved={(r) => {
              if (r) setWa({ result: r, label: 'إرسال للعميل عبر واتساب' });
              q.reload();
            }}
          />
          <Panel title="واتساب">
            <p className="mb-3 text-sm text-muted">إعادة إرسال رسالة الطلب الأصلية.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={m.pending === 'wa-admin'} onClick={() => resend('admin')}>
                إعادة إرسال للإدارة
              </Button>
              <Button size="sm" variant="outline" loading={m.pending === 'wa-customer'} onClick={() => resend('customer')}>
                للعميل
              </Button>
            </div>
          </Panel>
          <Panel title="حذف الطلب">
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" className="h-4 w-4" /> حذف الطلب
            </Button>
          </Panel>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`حذف الطلب #${o.number}`}
        confirmLabel="حذف"
        loading={m.pending === 'delete'}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const r = await m.run('delete', () => api.del(`/admin/orders/${o.id}`), 'تم حذف الطلب');
          if (r) navigate('/admin/orders', { replace: true });
        }}
      >
        الحذف لا يعيد المخزون. لإرجاع الكميات للمخزون غيّر الحالة إلى «ملغي» أولًا.
      </ConfirmDialog>
    </AdminPage>
  );
}

function StatusPanel({ order: o, onSaved }: { order: Order; onSaved: (wa: WaResult) => void }) {
  const m = useMutation();
  const [status, setStatus] = useState<RequestStatus>(o.status);
  const [notify, setNotify] = useState(true);
  const save = async () => {
    const r = await m.run('save', () => api.patch<{ whatsapp: WaResult }>(`/admin/orders/${o.id}`, { status, notify }), 'تم تحديث الحالة');
    if (r) onSaved(r.whatsapp);
  };
  return (
    <Panel title="حالة الطلب">
      <div className="space-y-4">
        <StatusSelect value={status} onChange={setStatus} />
        {status === 'CANCELLED' && o.status !== 'CANCELLED' && (
          <Alert tone="warn">إلغاء الطلب يعيد كميات المنتجات إلى المخزون.</Alert>
        )}
        {o.status === 'CANCELLED' && status !== 'CANCELLED' && (
          <Alert tone="warn">التراجع عن الإلغاء يخصم الكميات من المخزون مرة أخرى.</Alert>
        )}
        <Checkbox label="إشعار العميل عبر واتساب" checked={notify} onChange={setNotify} />
        <Button block loading={m.pending === 'save'} disabled={status === o.status} onClick={save}>
          تحديث الحالة
        </Button>
      </div>
    </Panel>
  );
}
