import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, FilterBar, FilterSelect, Panel, SearchInput } from '../../components/admin/ui';
import { Button, Checkbox, Icon, Input, Modal, Select, Tag, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatDate, formatJOD } from '../../lib/format';
import { useI18n, type MessageKey } from '../../lib/i18n';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
type CodStatus = 'PENDING' | 'COLLECTED' | 'SETTLED';
const DELIVERY_STATUSES: DeliveryStatus[] = ['PENDING', 'ASSIGNED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'];

export type DeliveryOrder = {
  id: string;
  number: number;
  customerName: string;
  phone: string;
  address: string;
  total: number;
  paymentMethod: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryFee: number;
  deliveryNote: string | null;
  codAmount: number | null;
  codStatus: CodStatus | null;
  codCollected: number | null;
  createdAt: string;
  driver: { id: string; name: string } | null;
  deliveryCompany: { id: string; name: string } | null;
  settlement: { id: string; ref: string } | null;
};
type Cash = { collected: number; settled: number; pending: number; pendingOrders: number };
type Driver = { id: string; name: string; phone: string; status: 'ACTIVE' | 'INACTIVE'; notes: string | null; activeOrders: number; cash: Cash };
type Company = { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; defaultFee: number; active: boolean; notes: string | null; cash: Cash };
type Settlement = {
  id: string;
  ref: string;
  amount: number;
  ordersCount: number;
  status: 'CONFIRMED' | 'VOIDED';
  notes: string | null;
  voidReason: string | null;
  receivedAt: string;
  driver: { id: string; name: string } | null;
  deliveryCompany: { id: string; name: string } | null;
  receivedBy: { name: string } | null;
  orders: { id: string; number: number; codCollected: number | null }[];
};

export function DeliveryStatusTag({ status }: { status: DeliveryStatus }) {
  const { t } = useI18n();
  const tone = status === 'DELIVERED' ? 'success' : status === 'FAILED' || status === 'CANCELLED' ? 'danger' : status === 'OUT_FOR_DELIVERY' ? 'dark' : status === 'PENDING' ? 'neutral' : 'brand';
  return <Tag tone={tone}>{t(`delivery.status.${status}`)}</Tag>;
}

export function CodTag({ status }: { status: CodStatus | null }) {
  const { t } = useI18n();
  if (!status) return <span className="text-muted">—</span>;
  return <Tag tone={status === 'SETTLED' ? 'success' : status === 'COLLECTED' ? 'brand' : 'neutral'}>{t(`cod.status.${status}`)}</Tag>;
}

const TABS = ['orders', 'drivers', 'companies', 'settlements'] as const;

export default function Delivery() {
  const { t } = useI18n();
  useDocumentTitle(t('delivery.title'));
  const f = useFilters(['tab', 'deliveryStatus', 'driverId', 'deliveryCompanyId', 'cod', 'codStatus', 'q'] as const);
  const tab = (TABS as readonly string[]).includes(f.values.tab) ? (f.values.tab as (typeof TABS)[number]) : 'orders';
  return (
    <AdminPage title={t('delivery.title')} description={t('delivery.subtitle')}>
      <div role="tablist" className="scroll-x mb-5 flex gap-1 border-b border-line">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => f.set({ tab: k === 'orders' ? '' : k } as never)}
            className={cx(
              'relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
              tab === k ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
            )}
          >
            {t(`delivery.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'orders' && <OrdersTab f={f} />}
      {tab === 'drivers' && <CarriersTab kind="driver" />}
      {tab === 'companies' && <CarriersTab kind="company" />}
      {tab === 'settlements' && <SettlementsTab />}
    </AdminPage>
  );
}

function useCarriers() {
  const drivers = useAdminQuery(() => api.get<Driver[]>('/admin/delivery/drivers'), []);
  const companies = useAdminQuery(() => api.get<Company[]>('/admin/delivery/companies'), []);
  return { drivers: drivers.data ?? [], companies: companies.data ?? [], reload: () => (drivers.reload(), companies.reload()) };
}

function OrdersTab({ f }: { f: ReturnType<typeof useFilters<'tab' | 'deliveryStatus' | 'driverId' | 'deliveryCompanyId' | 'cod' | 'codStatus' | 'q'>> }) {
  const { t } = useI18n();
  const { tab: _tab, ...filters } = f.values;
  const list = useAdminQuery(() => api.get<Paged<DeliveryOrder>>('/admin/delivery/orders', { ...filters, page: f.page, pageSize: 20 }), [JSON.stringify(filters), f.page], { keep: true, live: true });
  const carriers = useCarriers();
  const [edit, setEdit] = useState<DeliveryOrder | null>(null);

  const columns: Column<DeliveryOrder>[] = [
    {
      key: 'order',
      header: t('common.order'),
      cell: (o) => (
        <span className="flex flex-col">
          <Link to={`/admin/orders/${o.id}`} className="font-semibold hover:underline">
            #{o.number}
          </Link>
          <span className="text-xs text-muted">{formatDate(o.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: t('common.customer'),
      cell: (o) => (
        <span className="flex max-w-[16rem] flex-col">
          <span>{o.customerName}</span>
          <span className="truncate text-xs text-muted">{o.address}</span>
        </span>
      ),
    },
    {
      key: 'pay',
      header: t('delivery.payment'),
      cell: (o) => (
        <span className="flex flex-col">
          <b className="tabular-nums">{formatJOD(o.total)}</b>
          <span className="text-xs text-muted">{o.paymentMethod ? t(`pay.${o.paymentMethod}` as MessageKey) : '—'}</span>
        </span>
      ),
    },
    { key: 'carrier', header: t('delivery.carrier'), cell: (o) => o.driver?.name ?? o.deliveryCompany?.name ?? <span className="text-muted">—</span> },
    { key: 'status', header: t('delivery.status'), cell: (o) => <DeliveryStatusTag status={o.deliveryStatus} /> },
    {
      key: 'cod',
      header: t('cod.status'),
      cell: (o) => (
        <span className="flex flex-col items-start gap-0.5">
          <CodTag status={o.codStatus} />
          {o.codCollected != null && <span className="text-xs tabular-nums text-muted">{formatJOD(o.codCollected)}</span>}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'end',
      cell: (o) => (
        <Button size="sm" variant="outline" onClick={() => setEdit(o)}>
          {t('delivery.update')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <FilterBar onClear={f.clear} active={Object.values(filters).some(Boolean)}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="#1042 / 07…" />
        <FilterSelect label={t('delivery.status')} value={f.values.deliveryStatus} onChange={(e) => f.set({ deliveryStatus: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`delivery.status.${s}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={t('delivery.driver')} value={f.values.driverId} onChange={(e) => f.set({ driverId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {carriers.drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={t('delivery.company')} value={f.values.deliveryCompanyId} onChange={(e) => f.set({ deliveryCompanyId: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {carriers.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={t('cod.status')} value={f.values.codStatus} onChange={(e) => f.set({ codStatus: e.target.value })}>
          <option value="">{t('common.all')}</option>
          {(['PENDING', 'COLLECTED', 'SETTLED'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`cod.status.${s}`)}
            </option>
          ))}
        </FilterSelect>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm">
          <input type="checkbox" checked={f.values.cod === 'true'} onChange={(e) => f.set({ cod: e.target.checked ? 'true' : '' })} />
          {t('delivery.codOnly')}
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(o) => o.id}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: t('common.none') }}
      />
      {edit && <DeliveryUpdateModal order={edit} drivers={carriers.drivers} companies={carriers.companies} onClose={() => setEdit(null)} onSaved={list.reload} />}
    </>
  );
}

/** نافذة تحديث التوصيل لطلب — تُستخدم أيضًا من صفحة الطلب */
export function DeliveryUpdateModal({
  order,
  drivers,
  companies,
  onClose,
  onSaved,
}: {
  order: Pick<DeliveryOrder, 'id' | 'number' | 'deliveryStatus' | 'deliveryFee' | 'deliveryNote' | 'paymentMethod' | 'codAmount' | 'codCollected' | 'codStatus' | 'total'> & {
    driver: { id: string } | null;
    deliveryCompany: { id: string } | null;
  };
  drivers: Driver[];
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const m = useMutation();
  const [driverId, setDriverId] = useState(order.driver?.id ?? '');
  const [companyId, setCompanyId] = useState(order.deliveryCompany?.id ?? '');
  const [status, setStatus] = useState<DeliveryStatus>(order.deliveryStatus);
  const [fee, setFee] = useState(String(order.deliveryFee ?? 0));
  const [note, setNote] = useState(order.deliveryNote ?? '');
  const isCod = order.paymentMethod === 'COD';
  const [collected, setCollected] = useState(String(order.codCollected ?? order.codAmount ?? order.total));
  const settled = order.codStatus === 'SETTLED';

  const save = async () => {
    const body: Record<string, unknown> = {
      driverId: driverId || null,
      deliveryCompanyId: companyId || null,
      deliveryStatus: status,
      deliveryFee: Number(fee) || 0,
      deliveryNote: note.trim() || null,
    };
    if (isCod && status === 'DELIVERED' && !settled) body.codCollected = Number(collected);
    if (settled) {
      delete body.deliveryStatus;
    }
    const r = await m.run('save', () => api.patch(`/admin/delivery/orders/${order.id}`, body), t('delivery.updated'));
    if (r) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('delivery.update')} — #${order.number}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={m.pending === 'save'}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={t('delivery.driver')} value={driverId} onChange={(e) => setDriverId(e.target.value)} error={m.fieldErrors.driverId}>
          <option value="">—</option>
          {drivers.filter((d) => d.status === 'ACTIVE' || d.id === driverId).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select label={t('delivery.company')} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">—</option>
          {companies.filter((c) => c.active || c.id === companyId).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label={t('delivery.status')} value={status} disabled={settled} onChange={(e) => setStatus(e.target.value as DeliveryStatus)}>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`delivery.status.${s}`)}
            </option>
          ))}
        </Select>
        <Input label={t('delivery.fee')} type="number" min={0} step="0.001" className="ltr text-start" value={fee} onChange={(e) => setFee(e.target.value)} />
        {isCod && status === 'DELIVERED' && (
          <Input
            label={t('cod.collected')}
            type="number"
            min={0}
            step="0.001"
            className="ltr text-start"
            value={collected}
            disabled={settled}
            onChange={(e) => setCollected(e.target.value)}
            hint={`${t('cod.amount')}: ${formatJOD(order.codAmount ?? order.total)}`}
            wrapperClassName="sm:col-span-2"
          />
        )}
        <Textarea label={t('delivery.note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="sm:col-span-2" />
      </div>
    </Modal>
  );
}

function CarriersTab({ kind }: { kind: 'driver' | 'company' }) {
  const { t } = useI18n();
  const path = kind === 'driver' ? '/admin/delivery/drivers' : '/admin/delivery/companies';
  const q = useAdminQuery(() => api.get<(Driver | Company)[]>(path), [path], { live: true });
  const m = useMutation();
  const [edit, setEdit] = useState<Driver | Company | 'new' | null>(null);
  const [settle, setSettle] = useState<Driver | Company | null>(null);

  const columns: Column<Driver | Company>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.name}</span>
          <span className="ltr text-xs text-muted">{r.phone ?? ''}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (r) => {
        const active = 'status' in r ? r.status === 'ACTIVE' : r.active;
        return <Tag tone={active ? 'success' : 'neutral'}>{active ? t('common.active') : t('common.inactive')}</Tag>;
      },
    },
    ...(kind === 'driver'
      ? [{ key: 'active', header: t('delivery.activeOrders'), cell: (r: Driver | Company) => <span className="tabular-nums">{(r as Driver).activeOrders}</span> }]
      : [{ key: 'fee', header: t('delivery.defaultFee'), cell: (r: Driver | Company) => formatJOD((r as Company).defaultFee) }]),
    { key: 'collected', header: t('cod.collected'), cell: (r) => <span className="tabular-nums">{formatJOD(r.cash.collected)}</span> },
    { key: 'settled', header: t('cod.settled'), cell: (r) => <span className="tabular-nums text-muted">{formatJOD(r.cash.settled)}</span> },
    {
      key: 'pending',
      header: t('cod.pending'),
      cell: (r) => <span className={cx('tabular-nums', r.cash.pending > 0 ? 'font-bold text-warn' : 'text-muted')}>{formatJOD(r.cash.pending)}</span>,
    },
    {
      key: 'act',
      header: '',
      align: 'end',
      cell: (r) => (
        <span className="flex justify-end gap-1">
          {r.cash.pending > 0 && (
            <Button size="sm" onClick={() => setSettle(r)}>
              {t('settle.new')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>
            {t('common.edit')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setEdit('new')}>
          <Icon name="plus" className="h-4 w-4" /> {kind === 'driver' ? t('delivery.newDriver') : t('delivery.newCompany')}
        </Button>
      </div>
      <DataTable rows={q.data} columns={columns} rowKey={(r) => r.id} loading={q.loading} error={q.error} onRetry={q.retry} empty={{ title: t('common.none') }} />
      {edit && <CarrierForm kind={kind} value={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={q.reload} />}
      <ConfirmDialog
        open={!!settle}
        tone="primary"
        title={t('settle.new')}
        confirmLabel={t('settle.new')}
        loading={m.pending === 'settle'}
        onClose={() => setSettle(null)}
        onConfirm={async () => {
          if (!settle) return;
          const body = { [kind === 'driver' ? 'driverId' : 'deliveryCompanyId']: settle.id, expectedAmount: settle.cash.pending };
          const r = await m.run('settle', () => api.post('/admin/delivery/settlements', body), t('settle.done'));
          setSettle(null);
          if (r) q.reload();
        }}
      >
        {settle && (
          <>
            <b>{settle.name}</b> — {t('settle.confirm', { amount: formatJOD(settle.cash.pending), count: settle.cash.pendingOrders })}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function CarrierForm({ kind, value, onClose, onSaved }: { kind: 'driver' | 'company'; value: Driver | Company | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const m = useMutation();
  const c = value as Company | null;
  const d = value as Driver | null;
  const [name, setName] = useState(value?.name ?? '');
  const [phone, setPhone] = useState(value?.phone ?? '');
  const [contactName, setContactName] = useState(c?.contactName ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [fee, setFee] = useState(String(c?.defaultFee ?? 0));
  const [active, setActive] = useState(kind === 'driver' ? (d?.status ?? 'ACTIVE') === 'ACTIVE' : c?.active ?? true);
  const [notes, setNotes] = useState(value?.notes ?? '');
  const path = kind === 'driver' ? '/admin/delivery/drivers' : '/admin/delivery/companies';

  const save = async () => {
    const body =
      kind === 'driver'
        ? { name: name.trim(), phone: phone.trim(), status: active ? 'ACTIVE' : 'INACTIVE', notes: notes.trim() || null }
        : { name: name.trim(), phone: phone.trim() || null, contactName: contactName.trim() || null, email: email.trim(), defaultFee: Number(fee) || 0, active, notes: notes.trim() || null };
    const r = await m.run('save', () => (value ? api.patch(`${path}/${value.id}`, body) : api.post(path, body)), t('common.saved'));
    if (r) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={value ? value.name : kind === 'driver' ? t('delivery.newDriver') : t('delivery.newCompany')}
      footer={
        <Button onClick={save} loading={m.pending === 'save'}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} error={m.fieldErrors.name} />
        <Input label={t('common.phone')} type="tel" className="ltr text-start" value={phone} onChange={(e) => setPhone(e.target.value)} error={m.fieldErrors.phone} />
        {kind === 'company' && (
          <>
            <Input label={t('delivery.contactName')} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            <Input label={t('common.email')} type="email" className="ltr text-start" value={email} onChange={(e) => setEmail(e.target.value)} error={m.fieldErrors.email} />
            <Input label={t('delivery.defaultFee')} type="number" min={0} step="0.001" className="ltr text-start" value={fee} onChange={(e) => setFee(e.target.value)} />
          </>
        )}
        <div className="flex items-end">
          <Checkbox label={t('common.active')} checked={active} onChange={setActive} />
        </div>
        <Textarea label={t('common.notes')} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} wrapperClassName="sm:col-span-2" />
      </div>
    </Modal>
  );
}

function SettlementsTab() {
  const { t } = useI18n();
  const f = useFilters(['status', 'from', 'to'] as const);
  const list = useAdminQuery(() => api.get<Paged<Settlement>>('/admin/delivery/settlements', { ...f.values, page: f.page, pageSize: 20 }), [JSON.stringify(f.values), f.page], { keep: true });
  const m = useMutation();
  const [voiding, setVoiding] = useState<Settlement | null>(null);
  const [reason, setReason] = useState('');

  const columns: Column<Settlement>[] = [
    {
      key: 'ref',
      header: t('common.reference'),
      cell: (s) => (
        <span className="flex flex-col">
          <span className="ltr font-semibold">{s.ref}</span>
          <span className="text-xs text-muted">{formatDate(s.receivedAt, true)}</span>
        </span>
      ),
    },
    { key: 'carrier', header: t('delivery.carrier'), cell: (s) => s.driver?.name ?? s.deliveryCompany?.name },
    { key: 'orders', header: t('common.orders'), cell: (s) => <span className="text-sm">{s.orders.map((o) => `#${o.number}`).join('، ') || s.ordersCount}</span>, hideOnMobile: true },
    { key: 'amount', header: t('common.amount'), cell: (s) => <b className={cx('tabular-nums', s.status === 'VOIDED' && 'text-muted line-through')}>{formatJOD(s.amount)}</b> },
    { key: 'by', header: t('settle.receivedBy'), cell: (s) => s.receivedBy?.name ?? '—', hideOnMobile: true },
    {
      key: 'status',
      header: t('common.status'),
      cell: (s) => (
        <span className="flex flex-col items-start gap-0.5">
          <Tag tone={s.status === 'CONFIRMED' ? 'success' : 'danger'}>{t(`settle.status.${s.status}`)}</Tag>
          {s.voidReason && <span className="text-xs text-muted">{s.voidReason}</span>}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'end',
      cell: (s) =>
        s.status === 'CONFIRMED' && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setVoiding(s)}>
            {t('settle.void')}
          </Button>
        ),
    },
  ];

  return (
    <>
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label={t('common.status')} value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">{t('common.all')}</option>
          <option value="CONFIRMED">{t('settle.status.CONFIRMED')}</option>
          <option value="VOIDED">{t('settle.status.VOIDED')}</option>
        </FilterSelect>
        <label className="flex min-w-[9rem] flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t('common.from')}</span>
          <input type="date" className="input h-10 py-0 text-sm" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t('common.to')}</span>
          <input type="date" className="input h-10 py-0 text-sm" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
        </label>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(s) => s.id}
        loading={list.loading}
        refreshing={list.refreshing}
        error={list.error}
        onRetry={list.retry}
        total={list.data?.total}
        page={list.data?.page}
        pages={list.data?.pages}
        onPage={f.setPage}
        empty={{ title: t('common.none') }}
      />
      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={`${t('settle.void')} ${voiding?.ref ?? ''}`}
        footer={
          <Button
            variant="danger"
            loading={m.pending === 'void'}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              if (!voiding) return;
              const r = await m.run('void', () => api.post(`/admin/delivery/settlements/${voiding.id}/void`, { reason: reason.trim() }), t('common.saved'));
              if (r) {
                setVoiding(null);
                setReason('');
                list.reload();
              }
            }}
          >
            {t('settle.void')}
          </Button>
        }
      >
        <Textarea label={t('settle.voidReason')} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={m.fieldErrors.reason} />
      </Modal>
    </>
  );
}

/** لوحة التوصيل والتحصيل في صفحة الطلب */
export function OrderDeliveryPanel({ order, onSaved }: { order: DeliveryOrder; onSaved: () => void }) {
  const { t } = useI18n();
  const carriers = useCarriers();
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={t('delivery.title')}
      actions={
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t('delivery.update')}
        </Button>
      }
    >
      <DefList
        cols={1}
        items={[
          [t('delivery.status'), <DeliveryStatusTag key="s" status={order.deliveryStatus} />],
          [t('delivery.carrier'), order.driver?.name ?? order.deliveryCompany?.name ?? '—'],
          [t('delivery.payment'), order.paymentMethod ? t(`pay.${order.paymentMethod}` as MessageKey) : '—'],
          Number(order.deliveryFee) > 0 && [t('delivery.fee'), formatJOD(order.deliveryFee)],
          order.paymentMethod === 'COD' && [t('cod.amount'), formatJOD(order.codAmount)],
          order.paymentMethod === 'COD' && [t('cod.status'), <CodTag key="c" status={order.codStatus} />],
          order.codCollected != null && [t('cod.collected'), formatJOD(order.codCollected)],
          order.settlement && [t('delivery.tab.settlements'), <Link key="st" to="/admin/delivery?tab=settlements" className="font-medium hover:underline">{order.settlement.ref}</Link>],
          order.deliveryNote && [t('delivery.note'), order.deliveryNote],
        ]}
      />
      {open && (
        <DeliveryUpdateModal
          order={order}
          drivers={carriers.drivers}
          companies={carriers.companies}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </Panel>
  );
}
