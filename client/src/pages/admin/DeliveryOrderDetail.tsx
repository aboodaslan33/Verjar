import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { DeliveryStatusTag, FinancialTag } from '../../components/delivery/Tags';
import { Alert, Button, ButtonA, Checkbox, ErrorState, Icon, Input, Modal, Select, Textarea } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { hasPerm } from '../../context/Auth';
import { api } from '../../lib/api';
import { ALL_STATUSES, DELIVERED_SET, PAY_LABEL, SOURCE_LABEL, STATUS_LABEL, navigateUrl, type DeliveryStatus, type FinancialStatus } from '../../lib/delivery';
import { displayPhone, formatDate, formatJOD, formatTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

type Event = { id: string; fromStatus: DeliveryStatus | null; toStatus: DeliveryStatus; actorType: string; actorName: string | null; note: string | null; lat: number | null; lng: number | null; createdAt: string };
type Detail = {
  id: string;
  number: number;
  code: string | null;
  source: 'STORE' | 'SUPPLIER' | 'ADMIN';
  status: string;
  deliveryStatus: DeliveryStatus;
  financialStatus: FinancialStatus | null;
  customerName: string;
  phone: string;
  address: string;
  area: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  pickupAddress: string | null;
  pickupPhone: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  notes: string | null;
  deliveryNote: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  deliveryFee: number;
  customerPaysFee: boolean;
  paymentMethod: string | null;
  codAmount: number | null;
  codCollected: number | null;
  codCollectedAt: string | null;
  codStatus: 'PENDING' | 'COLLECTED' | 'SETTLED' | null;
  collectedMethod: string | null;
  createdAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  items: { id: string; name: string; quantity: number; unitFinalPrice: number; lineTotal: number }[];
  supplier: { id: string; name: string; phone: string | null; pickupAddress: string | null } | null;
  vendorOrders: { id: string; number: number; status: string; vendor: { id: string; name: string } }[];
  driver: { id: string; name: string; phone: string } | null;
  deliveryCompany: { id: string; name: string } | null;
  settlement: { id: string; ref: string; status: string } | null;
  collectedBy: { id: string; name: string } | null;
  statusEvents: Event[];
  assignments: { id: string; status: string; assignedAt: string; acceptedAt: string | null; endedAt: string | null; note: string | null; driver: { name: string }; assignedBy: { name: string } | null }[];
  proof: {
    recipientName: string;
    deliveredAt: string;
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    signatureUrl: string | null;
    photoUrl: string | null;
    otpVerified: boolean;
    amountCollected: number | null;
    note: string | null;
    editedAt: string | null;
    createdBy: { name: string } | null;
  } | null;
};
type Driver = { id: string; name: string; status: string; activeOrders: number; areas: string | null };

const t = (iso: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : '—');
const mapLink = (lat: number | null, lng: number | null) => (lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null);

export default function DeliveryOrderDetail() {
  const { id } = useParams();
  const { admin } = useAdmin();
  const q = useAdminQuery(() => api.get<Detail>(`/admin/delivery/orders/${id}`), [id], { live: true });
  const [dialog, setDialog] = useState<null | 'status' | 'assign' | 'collect' | 'edit' | 'proof'>(null);
  const o = q.data;
  useDocumentTitle(o?.code ?? 'طلب توصيل');
  if (q.loading && !o) return <DetailSkeleton />;
  if (q.error || !o)
    return (
      <AdminPage title="طلب توصيل">
        <ErrorState message={q.error?.message ?? 'تعذر التحميل'} onRetry={q.retry} />
      </AdminPage>
    );

  const can = (p: string) => hasPerm(admin, p);
  const closed = o.deliveryStatus === 'COMPLETED' || o.deliveryStatus === 'CANCELLED';
  const delivered = DELIVERED_SET.includes(o.deliveryStatus);
  const supplierName = o.supplier?.name ?? o.vendorOrders.map((v) => v.vendor.name).join('، ');

  return (
    <AdminPage
      title={o.code ?? `#${o.number}`}
      description={`${SOURCE_LABEL[o.source]} · ${formatDate(o.createdAt)} ${formatTime(o.createdAt)}`}
      back={{ to: '/admin/delivery?tab=orders', label: 'الطلبات' }}
      actions={
        <div className="flex flex-wrap gap-2">
          {can('orders.assign') && !closed && !delivered && (
            <Button size="sm" onClick={() => setDialog('assign')}>
              <Icon name="truck" className="h-4 w-4" /> {o.driver ? 'إعادة الإسناد' : 'إسناد لموظف'}
            </Button>
          )}
          {can('orders.manage') && !closed && (
            <Button size="sm" variant="outline" onClick={() => setDialog('status')}>
              تغيير الحالة
            </Button>
          )}
          {can('orders.manage') && delivered && (o.codAmount ?? 0) > 0 && o.codStatus !== 'SETTLED' && (
            <Button size="sm" variant="outline" onClick={() => setDialog('collect')}>
              <Icon name="cash" className="h-4 w-4" /> التحصيل
            </Button>
          )}
          {can('orders.manage') && !closed && (
            <Button size="sm" variant="ghost" onClick={() => setDialog('edit')}>
              تعديل
            </Button>
          )}
          {o.source === 'STORE' && can('orders.view') && (
            <Link to={`/admin/orders/${o.id}`} className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted hover:bg-subtle">
              طلب المتجر
            </Link>
          )}
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <DeliveryStatusTag status={o.deliveryStatus} />
        <FinancialTag status={o.financialStatus} />
        {o.settlement && <span className="text-sm text-muted">تسوية {o.settlement.ref}</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="الاستلام من المورد">
              <DefList
                cols={1}
                items={[
                  ['المورد', supplierName || '—'],
                  ['عنوان الاستلام', o.pickupAddress ?? o.supplier?.pickupAddress ?? '—'],
                  ['هاتف', o.pickupPhone ?? o.supplier?.phone ? <span key="p" className="ltr">{displayPhone(o.pickupPhone ?? o.supplier?.phone ?? '')}</span> : '—'],
                  ['وقت الاستلام', t(o.pickedUpAt)],
                ]}
              />
              <MapButton href={navigateUrl({ lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress })} />
            </Panel>
            <Panel title="التسليم للعميل">
              <DefList
                cols={1}
                items={[
                  ['العميل', o.customerName],
                  ['الهاتف', <a key="ph" href={`tel:+${o.phone}`} className="ltr hover:underline">{displayPhone(o.phone)}</a>],
                  ['العنوان', `${o.area ? `${o.area} — ` : ''}${o.address}`],
                  ['وقت التسليم', t(o.deliveredAt)],
                ]}
              />
              <MapButton href={navigateUrl({ lat: o.deliveryLat, lng: o.deliveryLng, address: o.address })} />
            </Panel>
          </div>

          <Panel title={`المنتجات (${o.items.reduce((n, i) => n + i.quantity, 0)} قطعة)`} bodyClassName="p-0 sm:p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {o.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-2.5">{it.name}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-muted">
                      {it.quantity} × {formatJOD(it.unitFinalPrice)}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">{formatJOD(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="سجل الطلب">
            <ol className="relative space-y-4 border-s border-line ps-5">
              {o.statusEvents.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -start-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    {e.fromStatus !== e.toStatus ? (
                      <>
                        {e.fromStatus && <span className="text-sm text-muted">{STATUS_LABEL[e.fromStatus]} ←</span>}
                        <DeliveryStatusTag status={e.toStatus} />
                      </>
                    ) : (
                      <span className="text-sm font-medium">{e.note}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {t(e.createdAt)} · {e.actorName ?? (e.actorType === 'system' ? 'النظام' : e.actorType === 'vendor' ? 'المورد' : '—')}
                    {e.lat != null && e.lng != null && (
                      <>
                        {' · '}
                        <a href={mapLink(e.lat, e.lng)!} target="_blank" rel="noopener noreferrer" className="underline">
                          الموقع
                        </a>
                      </>
                    )}
                  </p>
                  {e.fromStatus !== e.toStatus && e.note && <p className="mt-0.5 text-sm">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="المبالغ">
            <DefList
              cols={1}
              items={[
                ['قيمة المنتجات', formatJOD(o.subtotal)],
                o.discountTotal > 0 && ['الخصم', formatJOD(o.discountTotal)],
                ['الإجمالي', formatJOD(o.total)],
                ['أجرة التوصيل', `${formatJOD(o.deliveryFee)} · ${o.customerPaysFee ? 'يدفعها العميل' : 'يدفعها المورد'}`],
                ['طريقة الدفع', o.paymentMethod ? PAY_LABEL[o.paymentMethod] ?? o.paymentMethod : '—'],
                ['المطلوب تحصيله', <b key="d" className="tabular-nums">{formatJOD(o.codAmount ?? 0)}</b>],
                o.codCollected != null && ['المحصّل', `${formatJOD(o.codCollected)}${o.collectedMethod ? ` · ${PAY_LABEL[o.collectedMethod] ?? o.collectedMethod}` : ''}`],
                o.collectedBy && ['حصّله', `${o.collectedBy.name} · ${t(o.codCollectedAt)}`],
              ]}
            />
          </Panel>

          <Panel title="موظف التوصيل">
            {o.driver ? (
              <DefList cols={1} items={[['الاسم', o.driver.name], ['الهاتف', <span key="d" className="ltr">{displayPhone(o.driver.phone)}</span>]]} />
            ) : o.deliveryCompany ? (
              <p className="text-sm">شركة: {o.deliveryCompany.name}</p>
            ) : (
              <p className="text-sm text-muted">لم يُسند بعد.</p>
            )}
            {o.assignments.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
                {o.assignments.map((a) => (
                  <li key={a.id}>
                    {a.driver.name} — {a.status === 'UNASSIGNED' ? 'سُحب' : a.status === 'ACCEPTED' ? 'قبل' : 'بانتظار القبول'} · {t(a.assignedAt)}
                    {a.assignedBy ? ` · ${a.assignedBy.name}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {o.proof && (
            <Panel
              title="إثبات التسليم"
              actions={
                can('proofs.edit') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDialog('proof')}>
                    تعديل
                  </Button>
                ) : undefined
              }
            >
              <DefList
                cols={1}
                items={[
                  ['المستلم', o.proof.recipientName],
                  ['الوقت', t(o.proof.deliveredAt)],
                  ['رمز التحقق', o.proof.otpVerified ? 'تم التحقق' : 'لم يُستخدم'],
                  o.proof.amountCollected != null && ['المبلغ المسجّل', formatJOD(o.proof.amountCollected)],
                  o.proof.lat != null && ['الموقع', <a key="g" href={mapLink(o.proof.lat, o.proof.lng)!} target="_blank" rel="noopener noreferrer" className="underline">عرض على الخريطة{o.proof.accuracy ? ` (±${Math.round(o.proof.accuracy)} م)` : ''}</a>],
                  o.proof.createdBy && ['سجّله', o.proof.createdBy.name],
                  o.proof.note && ['ملاحظة', o.proof.note],
                  o.proof.editedAt && ['عُدّل', t(o.proof.editedAt)],
                ]}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {o.proof.signatureUrl && (
                  <a href={o.proof.signatureUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-line bg-white p-1">
                    <img src={o.proof.signatureUrl} alt="توقيع العميل" className="h-24 w-full object-contain" />
                  </a>
                )}
                {o.proof.photoUrl && (
                  <a href={o.proof.photoUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line">
                    <img src={o.proof.photoUrl} alt="صورة التسليم" className="h-24 w-full object-cover" />
                  </a>
                )}
              </div>
            </Panel>
          )}

          {(o.notes || o.deliveryNote) && (
            <Panel title="ملاحظات">
              {o.notes && <p className="whitespace-pre-line text-sm">{o.notes}</p>}
              {o.deliveryNote && <p className="mt-2 whitespace-pre-line text-sm text-muted">ملاحظة التوصيل: {o.deliveryNote}</p>}
            </Panel>
          )}
        </div>
      </div>

      {dialog === 'assign' && <AssignDialog order={o} onClose={() => setDialog(null)} onSaved={q.reload} />}
      {dialog === 'status' && <StatusDialog order={o} onClose={() => setDialog(null)} onSaved={q.reload} />}
      {dialog === 'collect' && <CollectDialog order={o} onClose={() => setDialog(null)} onSaved={q.reload} />}
      {dialog === 'edit' && <EditDialog order={o} canAmounts={can('orders.editAmounts')} onClose={() => setDialog(null)} onSaved={q.reload} />}
      {dialog === 'proof' && o.proof && <ProofDialog order={o} onClose={() => setDialog(null)} onSaved={q.reload} />}
    </AdminPage>
  );
}

function MapButton({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <ButtonA href={href} target="_blank" rel="noopener noreferrer" variant="outline" size="sm" className="mt-3">
      <Icon name="map" className="h-4 w-4" /> فتح في الخريطة
    </ButtonA>
  );
}

type DialogProps = { order: Detail; onClose: () => void; onSaved: () => void };

function Dialog({ title, onClose, onSubmit, pending, children, submitLabel = 'حفظ', disabled }: { title: string; onClose: () => void; onSubmit: () => void; pending: boolean; children: ReactNode; submitLabel?: string; disabled?: boolean }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={onSubmit} loading={pending} disabled={disabled}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">{children}</div>
    </Modal>
  );
}

function AssignDialog({ order, onClose, onSaved }: DialogProps) {
  const m = useMutation();
  const drivers = useAdminQuery(() => api.get<Driver[]>('/admin/delivery/drivers'), []);
  const [driverId, setDriverId] = useState(order.driver?.id ?? '');
  const [note, setNote] = useState('');
  const active = (drivers.data ?? []).filter((d) => d.status === 'ACTIVE');
  const submit = async () => {
    if (await m.run('a', () => api.post(`/admin/delivery/orders/${order.id}/assign`, { driverId: driverId || null, note: note || null }), driverId ? 'تم الإسناد' : 'أُلغي الإسناد')) {
      onSaved();
      onClose();
    }
  };
  return (
    <Dialog title={`إسناد ${order.code ?? ''}`} onClose={onClose} onSubmit={submit} pending={m.pending === 'a'}>
      {m.error && <Alert tone="error">{m.error}</Alert>}
      <Select label="موظف التوصيل" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
        <option value="">— بدون إسناد —</option>
        {active.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {d.activeOrders} طلب جارٍ{d.areas ? ` · ${d.areas}` : ''}
          </option>
        ))}
      </Select>
      {order.area && <p className="text-sm text-muted">منطقة التسليم: {order.area}</p>}
      <Input label="ملاحظة للموظف (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}

function StatusDialog({ order, onClose, onSaved }: DialogProps) {
  const m = useMutation();
  const [status, setStatus] = useState<DeliveryStatus | ''>('');
  const [note, setNote] = useState('');
  const options = ALL_STATUSES.filter((s) => s !== order.deliveryStatus && s !== 'PICKUP_ASSIGNED');
  const submit = async () => {
    if (!status) return;
    if (await m.run('s', () => api.post(`/admin/delivery/orders/${order.id}/status`, { status, note: note || null }), 'تم تحديث الحالة')) {
      onSaved();
      onClose();
    }
  };
  return (
    <Dialog title="تغيير حالة الطلب" onClose={onClose} onSubmit={submit} pending={m.pending === 's'} disabled={!status}>
      {m.error && <Alert tone="error">{m.error}</Alert>}
      <p className="text-sm">
        الحالة الحالية: <DeliveryStatusTag status={order.deliveryStatus} />
      </p>
      <Select label="الحالة الجديدة" value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus)}>
        <option value="">اختر</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      {status === 'CANCELLED' && <Alert tone="warn">إلغاء الطلب يعيد كميات منتجات المتجر إلى المخزون ويُبلغ الموظف والمورد.</Alert>}
      <Textarea label="ملاحظة (مطلوبة لحالات التعثر)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}

function CollectDialog({ order, onClose, onSaved }: DialogProps) {
  const m = useMutation();
  const [amount, setAmount] = useState(String(order.codCollected ?? order.codAmount ?? 0));
  const [method, setMethod] = useState(order.collectedMethod ?? 'CASH');
  const submit = async () => {
    if (await m.run('c', () => api.post(`/admin/delivery/orders/${order.id}/collect`, { amount: Number(amount), method }), 'تم تسجيل التحصيل')) {
      onSaved();
      onClose();
    }
  };
  return (
    <Dialog title="تسجيل / تصحيح التحصيل" onClose={onClose} onSubmit={submit} pending={m.pending === 'c'}>
      {m.error && <Alert tone="error">{m.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Input label={`المبلغ (المطلوب ${formatJOD(order.codAmount ?? 0)})`} type="number" step="0.001" className="ltr text-start" value={amount} onChange={(e) => setAmount(e.target.value)} error={m.fieldErrors.amount} />
        <Select label="الطريقة" value={method} onChange={(e) => setMethod(e.target.value)}>
          {['CASH', 'CLIQ', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((k) => (
            <option key={k} value={k}>
              {PAY_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-sm text-muted">يُسجَّل التعديل في سجل العمليات بالقيمة القديمة والجديدة.</p>
    </Dialog>
  );
}

function EditDialog({ order, canAmounts, onClose, onSaved }: DialogProps & { canAmounts: boolean }) {
  const m = useMutation();
  const [f, setF] = useState({
    address: order.address,
    area: order.area ?? '',
    deliveryLat: order.deliveryLat?.toString() ?? '',
    deliveryLng: order.deliveryLng?.toString() ?? '',
    pickupAddress: order.pickupAddress ?? '',
    pickupPhone: order.pickupPhone ?? '',
    deliveryNote: order.deliveryNote ?? '',
    deliveryFee: String(order.deliveryFee),
    customerPaysFee: order.customerPaysFee,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const collected = order.codStatus === 'COLLECTED' || order.codStatus === 'SETTLED';
  const submit = async () => {
    const body: Record<string, unknown> = {
      address: f.address,
      area: f.area || null,
      deliveryLat: num(f.deliveryLat),
      deliveryLng: num(f.deliveryLng),
      pickupAddress: f.pickupAddress || null,
      pickupPhone: f.pickupPhone || null,
      deliveryNote: f.deliveryNote || null,
      ...(canAmounts && !collected ? { deliveryFee: Number(f.deliveryFee) || 0, customerPaysFee: f.customerPaysFee } : {}),
    };
    if (await m.run('e', () => api.patch(`/admin/delivery/orders/${order.id}`, body), 'تم حفظ التعديلات')) {
      onSaved();
      onClose();
    }
  };
  return (
    <Dialog title="تعديل بيانات التوصيل" onClose={onClose} onSubmit={submit} pending={m.pending === 'e'}>
      {m.error && <Alert tone="error">{m.error}</Alert>}
      <Input label="عنوان التسليم" value={f.address} onChange={set('address')} error={m.fieldErrors.address} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="المنطقة" value={f.area} onChange={set('area')} />
        <Input label="خط العرض" className="ltr text-start" value={f.deliveryLat} onChange={set('deliveryLat')} placeholder="31.95" />
        <Input label="خط الطول" className="ltr text-start" value={f.deliveryLng} onChange={set('deliveryLng')} placeholder="35.91" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="عنوان الاستلام" value={f.pickupAddress} onChange={set('pickupAddress')} />
        <Input label="هاتف الاستلام" className="ltr text-start" value={f.pickupPhone} onChange={set('pickupPhone')} />
      </div>
      <Textarea label="ملاحظة التوصيل" rows={2} value={f.deliveryNote} onChange={set('deliveryNote')} />
      {canAmounts ? (
        collected ? (
          <p className="text-sm text-muted">تم التحصيل — لا يمكن تعديل أجرة التوصيل.</p>
        ) : (
          <div className="grid grid-cols-2 items-end gap-3">
            <Input label="أجرة التوصيل" type="number" step="0.001" min={0} className="ltr text-start" value={f.deliveryFee} onChange={set('deliveryFee')} />
            <Checkbox label="العميل يدفع الأجرة" checked={f.customerPaysFee} onChange={(v) => setF((s) => ({ ...s, customerPaysFee: v }))} />
          </div>
        )
      ) : (
        <p className="text-sm text-muted">تعديل المبالغ يتطلب صلاحية "تعديل المبالغ".</p>
      )}
    </Dialog>
  );
}

function ProofDialog({ order, onClose, onSaved }: DialogProps) {
  const m = useMutation();
  const [name, setName] = useState(order.proof!.recipientName);
  const [note, setNote] = useState(order.proof!.note ?? '');
  const submit = async () => {
    if (await m.run('p', () => api.patch(`/admin/delivery/orders/${order.id}/proof`, { recipientName: name, note: note || null }), 'تم تعديل الإثبات')) {
      onSaved();
      onClose();
    }
  };
  return (
    <Dialog title="تعديل إثبات التسليم" onClose={onClose} onSubmit={submit} pending={m.pending === 'p'}>
      {m.error && <Alert tone="error">{m.error}</Alert>}
      <Alert tone="warn">يُسجَّل التعديل في سجل العمليات بالقيم السابقة.</Alert>
      <Input label="اسم المستلم" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea label="ملاحظة" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}
