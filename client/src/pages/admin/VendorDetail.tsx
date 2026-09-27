import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { PAYMENT_METHODS } from '../../components/admin/labels';
import type { AdminVendor, DueVendorOrder, PaymentMethod, VendorPayout, VendorTotals } from '../../components/admin/types';
import { AdminPage, DefList, DetailSkeleton, Ltr, Panel, StatTile } from '../../components/admin/ui';
import { Alert, Button, ButtonLink, ErrorState, Input, Modal, Select, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { PAYMENT_METHOD_LABEL, formatDate, formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

type Detail = { vendor: AdminVendor; totals: VendorTotals; payouts: VendorPayout[]; dueOrders: DueVendorOrder[] };

export default function VendorDetail() {
  const { id } = useParams();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/vendors/${id}`), [id], { live: true });
  useDocumentTitle(q.data?.vendor.name ?? 'المورد');
  const m = useMutation();
  const [commission, setCommission] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [paying, setPaying] = useState(false);

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data)
    return (
      <AdminPage title="المورد" back={{ to: '/admin/vendors', label: 'الموردون' }}>
        <ErrorState message={q.error?.message ?? 'غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const { vendor: v, totals: t, payouts, dueOrders } = q.data;
  const commissionValue = commission ?? String(v.commissionPercent);

  const saveCommission = async () => {
    const r = await m.run('commission', () => api.patch(`/admin/vendors/${v.id}`, { commissionPercent: Number(commissionValue) }), 'تم حفظ العمولة — تسري على الطلبات الجديدة');
    if (r) {
      setCommission(null);
      q.reload();
    }
  };

  const setActive = async (active: boolean) => {
    const r = await m.run('active', () => api.patch(`/admin/vendors/${v.id}`, { active }), active ? 'أُعيدت صلاحية المورد' : 'تم سحب صلاحية المورد');
    setConfirmRevoke(false);
    if (r) q.reload();
  };

  return (
    <AdminPage
      back={{ to: '/admin/vendors', label: 'الموردون' }}
      title={v.name}
      meta={
        <>
          {v.isHouse && <Tag>المورد الافتراضي (الشركة)</Tag>}
          {v.active ? <Tag tone="sand">فعّال</Tag> : <Tag tone="danger">الصلاحية مسحوبة</Tag>}
        </>
      }
      actions={
        <>
          {v.active && (
            <a href={`/store/vendor/${v.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-ink">
              صفحة المتجر
            </a>
          )}
          <ButtonLink to={`/admin/products?vendorId=${v.id}`} variant="outline" size="sm">
            المنتجات
          </ButtonLink>
        </>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="المبيعات" value={formatJOD(t.salesTotal)} sub={`${t.ordersCount} طلب`} />
        <StatTile label="عمولتي" value={formatJOD(t.commissionTotal)} tone="brand" />
        <StatTile label="المستحق للمورد" value={formatJOD(t.due)} sub={t.pending > 0 ? `و${formatJOD(t.pending)} قيد التنفيذ` : undefined} tone="warn" />
        <StatTile label="دُفع للمورد" value={formatJOD(t.paid)} tone="sand" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title={`المستحق (${dueOrders.length} طلب مكتمل)`}
            actions={
              t.due > 0 && (
                <Button size="sm" onClick={() => setPaying(true)}>
                  تم الدفع
                </Button>
              )
            }
            bodyClassName="p-0 sm:p-0"
          >
            {dueOrders.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">لا توجد مستحقات. الطلبات تصبح مستحقة عند اكتمالها.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-subtle/60 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">الطلب</th>
                    <th className="px-4 py-2 text-start font-medium">المبيعات</th>
                    <th className="px-4 py-2 text-start font-medium">العمولة</th>
                    <th className="px-4 py-2 text-start font-medium">صافي المورد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dueOrders.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2.5">
                        {d.order ? (
                          <Link to={`/admin/orders/${d.order.id}`} className="hover:underline">
                            #{d.order.number}
                          </Link>
                        ) : (
                          `#${d.number}`
                        )}
                        <span className="block text-xs text-muted">{formatDate(d.createdAt)}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{formatJOD(d.total)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatJOD(d.commissionTotal)}</td>
                      <td className="px-4 py-2.5 font-semibold tabular-nums">{formatJOD(d.vendorNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="سجل التسويات" bodyClassName="p-0 sm:p-0">
            {payouts.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">لم تُسجَّل أي تسوية بعد.</p>
            ) : (
              <ul className="divide-y divide-line">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                    <span>
                      <span className="block font-semibold tabular-nums">{formatJOD(p.amount)}</span>
                      <span className="text-xs text-muted">
                        {formatDate(p.paidAt, true)} · {PAYMENT_METHOD_LABEL[p.method]} · {p.ordersCount} طلب
                        {p.recordedBy ? ` · ${p.recordedBy.name}` : ''}
                      </span>
                    </span>
                    <span className="text-end text-xs text-muted">
                      مبيعات {formatJOD(p.salesTotal)} · عمولة {formatJOD(p.commissionTotal)}
                      {p.reference && (
                        <span className="block">
                          مرجع: <Ltr>{p.reference}</Ltr>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="بيانات المورد">
            <DefList
              cols={1}
              items={[
                v.customer && ['صاحب الحساب', <Link key="c" to={`/admin/customers/${v.customer.id}`} className="hover:underline">{v.customer.name}</Link>],
                v.customer && ['الهاتف', <Ltr key="p">{v.customer.phone}</Ltr>],
                ['رابط المتجر', <Ltr key="s">/store/vendor/{v.slug}</Ltr>],
                ['تاريخ الانضمام', formatDate(v.createdAt)],
              ]}
            />
          </Panel>
          <Panel title="العمولة">
            <div className="flex items-end gap-2">
              <Input
                label="نسبة العمولة %"
                type="number"
                min={0}
                max={100}
                step="0.5"
                className="ltr text-start"
                wrapperClassName="flex-1"
                value={commissionValue}
                onChange={(e) => setCommission(e.target.value)}
                error={m.fieldErrors.commissionPercent}
              />
              <Button size="md" variant="outline" onClick={saveCommission} loading={m.pending === 'commission'} disabled={commission === null}>
                حفظ
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">الطلبات السابقة تحتفظ بالعمولة التي بيعت بها.</p>
          </Panel>
          {!v.isHouse && (
            <Panel title="الصلاحية">
              {v.active ? (
                <>
                  <p className="mb-3 text-sm text-muted">سحب الصلاحية يوقف لوحة المورد فورًا ويخفي منتجاته من المتجر. الطلبات والمستحقات تبقى.</p>
                  <Button variant="outline" className="text-danger" onClick={() => setConfirmRevoke(true)}>
                    سحب صلاحية المورد
                  </Button>
                </>
              ) : (
                <Button onClick={() => setActive(true)} loading={m.pending === 'active'}>
                  إعادة الصلاحية
                </Button>
              )}
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        title="سحب صلاحية المورد"
        confirmLabel="سحب الصلاحية"
        loading={m.pending === 'active'}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() => setActive(false)}
      >
        لن يستطيع «{v.name}» دخول لوحة المورد، وتختفي منتجاته من المتجر. يمكنك إعادة الصلاحية لاحقًا.
      </ConfirmDialog>
      <PayoutDialog open={paying} vendor={v} due={t.due} dueOrders={dueOrders.length} onClose={() => setPaying(false)} onPaid={q.reload} />
    </AdminPage>
  );
}

function PayoutDialog({
  open,
  vendor,
  due,
  dueOrders,
  onClose,
  onPaid,
}: {
  open: boolean;
  vendor: AdminVendor;
  due: number;
  dueOrders: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const m = useMutation();
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const pay = async () => {
    const r = await m.run(
      'pay',
      () => api.post(`/admin/vendors/${vendor.id}/payouts`, { method, reference: reference.trim() || undefined, note: note.trim() || undefined, expectedAmount: due }),
      `سُجّلت تسوية ${formatJOD(due)} لـ ${vendor.name}`,
    );
    if (r) {
      onPaid();
      onClose();
      setReference('');
      setNote('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تسجيل الدفع للمورد"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={pay} loading={m.pending === 'pay'}>
            تم دفع {formatJOD(due)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          تُسجَّل تسوية بمبلغ <strong className="tabular-nums">{formatJOD(due)}</strong> تغطي {dueOrders} طلبًا مكتملًا لـ {vendor.name}. بعدها لا
          تتغير حالة هذه الطلبات.
        </Alert>
        <Select label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((pm) => (
            <option key={pm} value={pm}>
              {PAYMENT_METHOD_LABEL[pm]}
            </option>
          ))}
        </Select>
        <Input label="رقم المرجع" optional value={reference} onChange={(e) => setReference(e.target.value)} className="ltr text-start" />
        <Input label="ملاحظة" optional value={note} onChange={(e) => setNote(e.target.value)} />
        {m.error && <Alert tone="error">{m.error}</Alert>}
      </div>
    </Modal>
  );
}
