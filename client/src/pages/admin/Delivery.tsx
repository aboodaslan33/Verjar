import { useState } from 'react';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, DefList, FilterBar, FilterInput, FilterSelect, Panel, SearchInput, StatTile } from '../../components/admin/ui';
import { DeliveryStatusTag, FinancialTag } from '../../components/delivery/Tags';
import { Button, ButtonLink, Checkbox, Icon, Input, Modal, Select, Tag, Textarea } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { hasPerm } from '../../context/Auth';
import { api } from '../../lib/api';
import { ALL_STATUSES, BUCKETS, FINANCIAL_LABEL, PAY_LABEL, SOURCE_LABEL, STATUS_LABEL, type DeliveryStatus, type FinancialStatus } from '../../lib/delivery';
import { cx, formatDate, formatJOD } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type CodStatus = 'PENDING' | 'COLLECTED' | 'SETTLED';

export type DeliveryListOrder = {
  id: string;
  number: number;
  code: string | null;
  source: 'STORE' | 'SUPPLIER' | 'ADMIN';
  customerName: string;
  phone: string;
  address: string;
  area: string | null;
  total: number;
  paymentMethod: string | null;
  deliveryStatus: DeliveryStatus;
  financialStatus: FinancialStatus | null;
  deliveryFee: number;
  codAmount: number | null;
  codStatus: CodStatus | null;
  codCollected: number | null;
  createdAt: string;
  supplier: { id: string; name: string } | null;
  vendorOrders: { vendor: { id: string; name: string } }[];
  driver: { id: string; name: string } | null;
  deliveryCompany: { id: string; name: string } | null;
  settlement: { id: string; ref: string } | null;
};
type Cash = { collected: number; settled: number; pending: number; pendingOrders: number };
type Driver = { id: string; name: string; phone: string; status: 'ACTIVE' | 'INACTIVE'; notes: string | null; areas: string | null; activeOrders: number; cash: Cash; user: { id: string; username: string | null } | null };
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
type Supplier = { id: string; name: string; isHouse: boolean };
type DriverPerf = {
  driverId: string;
  name: string;
  status: string;
  hasAccount: boolean;
  assigned: number;
  delivered: number;
  failed: number;
  active: number;
  cancelled: number;
  successRate: number | null;
  avgMinutes: number | null;
  collected: number;
  fees: number;
};
type Stats = { total: number; buckets: Record<string, number>; collected: number; uncollected: number; drivers: DriverPerf[] };

export function CodTag({ status }: { status: CodStatus | null }) {
  const { t } = useI18n();
  if (!status) return <span className="text-muted">—</span>;
  return <Tag tone={status === 'SETTLED' ? 'success' : status === 'COLLECTED' ? 'brand' : 'neutral'}>{t(`cod.status.${status}`)}</Tag>;
}

const TABS = [
  { key: 'dashboard', label: 'اللوحة' },
  { key: 'orders', label: 'الطلبات' },
  { key: 'drivers', label: 'موظفو التوصيل' },
  { key: 'companies', label: 'شركات التوصيل' },
  { key: 'settlements', label: 'التسويات' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const FILTER_KEYS = ['tab', 'bucket', 'deliveryStatus', 'driverId', 'supplierId', 'area', 'paymentMethod', 'financialStatus', 'codStatus', 'q', 'from', 'to'] as const;
type Filters = ReturnType<typeof useFilters<(typeof FILTER_KEYS)[number]>>;

export default function Delivery() {
  const { t } = useI18n();
  const { admin } = useAdmin();
  useDocumentTitle(t('delivery.title'));
  const f = useFilters(FILTER_KEYS);
  const canDash = hasPerm(admin, 'dashboard.view');
  const allowed = TABS.filter((x) => x.key !== 'dashboard' || canDash);
  const tab: TabKey = (allowed.find((x) => x.key === f.values.tab)?.key ?? allowed[0].key) as TabKey;
  return (
    <AdminPage
      title={t('delivery.title')}
      description="الطلبات وتوزيعها على موظفي التوصيل، حالة كل طلب، التحصيل والتسويات، وأداء الموظفين."
      actions={
        hasPerm(admin, 'orders.manage') ? (
          <ButtonLink to="/admin/delivery/new" size="sm">
            <Icon name="plus" className="h-4 w-4" /> طلب توصيل جديد
          </ButtonLink>
        ) : undefined
      }
    >
      <div role="tablist" className="scroll-x mb-5 flex gap-1 border-b border-line">
        {allowed.map((k) => (
          <button
            key={k.key}
            role="tab"
            aria-selected={tab === k.key}
            onClick={() => f.set({ tab: k.key === allowed[0].key ? '' : k.key } as never)}
            className={cx(
              'relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
              tab === k.key ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <DashboardTab f={f} />}
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

function useSuppliers() {
  return useAdminQuery(() => api.get<Supplier[]>('/admin/delivery/suppliers'), []).data ?? [];
}

/** فلاتر مشتركة بين اللوحة والطلبات: التاريخ، المورد، موظف التوصيل، المنطقة، طريقة الدفع */
function CommonFilters({ f, drivers, suppliers }: { f: Filters; drivers: Driver[]; suppliers: Supplier[] }) {
  return (
    <>
      <FilterInput label="من تاريخ" type="date" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
      <FilterInput label="إلى تاريخ" type="date" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
      <FilterSelect label="المورد" value={f.values.supplierId} onChange={(e) => f.set({ supplierId: e.target.value })}>
        <option value="">الكل</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect label="موظف التوصيل" value={f.values.driverId} onChange={(e) => f.set({ driverId: e.target.value })}>
        <option value="">الكل</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </FilterSelect>
      <FilterInput label="المنطقة" value={f.values.area} onChange={(e) => f.set({ area: e.target.value })} placeholder="مثال: الجبيهة" />
      <FilterSelect label="طريقة الدفع" value={f.values.paymentMethod} onChange={(e) => f.set({ paymentMethod: e.target.value })}>
        <option value="">الكل</option>
        {Object.entries(PAY_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </FilterSelect>
    </>
  );
}

const pick = (v: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter((k) => v[k]).map((k) => [k, v[k]]));

// ───────────── لوحة الإحصائيات ─────────────

function DashboardTab({ f }: { f: Filters }) {
  const carriers = useCarriers();
  const suppliers = useSuppliers();
  const params = pick(f.values, ['from', 'to', 'supplierId', 'driverId', 'area', 'paymentMethod', 'q']);
  const q = useAdminQuery(() => api.get<Stats>('/admin/delivery/stats', params), [JSON.stringify(params)], { keep: true, live: true });
  const s = q.data;
  const go = (bucket: string) => f.set({ tab: 'orders', bucket } as never);
  const perf: Column<DriverPerf>[] = [
    { key: 'name', header: 'الموظف', cell: (d) => <span className="font-medium">{d.name}</span> },
    { key: 'assigned', header: 'المسندة', align: 'end', cell: (d) => <span className="tabular-nums">{d.assigned}</span> },
    { key: 'delivered', header: 'المسلّمة', align: 'end', cell: (d) => <span className="tabular-nums">{d.delivered}</span> },
    { key: 'active', header: 'الجارية', align: 'end', cell: (d) => <span className="tabular-nums">{d.active}</span> },
    { key: 'failed', header: 'المتعثرة', align: 'end', cell: (d) => <span className={cx('tabular-nums', d.failed > 0 && 'text-danger')}>{d.failed}</span> },
    { key: 'rate', header: 'نسبة النجاح', align: 'end', cell: (d) => (d.successRate == null ? '—' : <span className="tabular-nums">{d.successRate}%</span>) },
    { key: 'time', header: 'متوسط المدة', align: 'end', cell: (d) => (d.avgMinutes == null ? '—' : <span className="tabular-nums">{d.avgMinutes} د</span>) },
    { key: 'collected', header: 'المحصّل', align: 'end', cell: (d) => <span className="tabular-nums">{formatJOD(d.collected)}</span> },
  ];
  return (
    <div className="space-y-5">
      <FilterBar onClear={f.clear} active={Object.keys(params).length > 0}>
        <CommonFilters f={f} drivers={carriers.drivers} suppliers={suppliers} />
      </FilterBar>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <StatTile label="إجمالي الطلبات" value={s?.total ?? 0} loading={!s} tone="sand" />
        {BUCKETS.map((b) => (
          <button key={b.key} type="button" onClick={() => go(b.key)} className="text-start">
            <StatTile label={b.label} value={s?.buckets[b.key] ?? 0} loading={!s} tone={b.key === 'failed' && (s?.buckets.failed ?? 0) > 0 ? 'warn' : b.key === 'delivered' ? 'brand' : 'neutral'} />
          </button>
        ))}
        <StatTile label="إجمالي المبالغ المحصّلة" value={<span className="text-xl">{formatJOD(s?.collected ?? 0)}</span>} loading={!s} tone="brand" />
        <StatTile label="إجمالي المبالغ غير المحصّلة" value={<span className="text-xl">{formatJOD(s?.uncollected ?? 0)}</span>} loading={!s} tone={(s?.uncollected ?? 0) > 0 ? 'warn' : 'neutral'} />
      </div>
      <Panel title="أداء موظفي التوصيل" bodyClassName="p-0 sm:p-0">
        <DataTable rows={s?.drivers} columns={perf} rowKey={(d) => d.driverId} loading={q.loading && !s} error={q.error} onRetry={q.retry} empty={{ title: 'لا يوجد موظفو توصيل بعد' }} />
      </Panel>
    </div>
  );
}

// ───────────── الطلبات ─────────────

function OrdersTab({ f }: { f: Filters }) {
  const { admin } = useAdmin();
  const m = useMutation();
  const { tab: _tab, ...filters } = f.values;
  const params = pick(filters, Object.keys(filters));
  const list = useAdminQuery(() => api.get<Paged<DeliveryListOrder>>('/admin/delivery/orders', { ...params, page: f.page, pageSize: 25 }), [JSON.stringify(params), f.page], { keep: true, live: true });
  const carriers = useCarriers();
  const suppliers = useSuppliers();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDriver, setBulkDriver] = useState('');
  const canAssign = hasPerm(admin, 'orders.assign');

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const bulkAssign = async () => {
    const r = await m.run('bulk', () => api.post<{ id: string; ok: boolean; error?: string }[]>('/admin/delivery/orders/assign-bulk', { orderIds: [...selected], driverId: bulkDriver }), 'تم الإسناد');
    if (r) {
      setSelected(new Set());
      list.reload();
    }
  };

  const columns: Column<DeliveryListOrder>[] = [
    ...(canAssign
      ? [
          {
            key: 'sel',
            header: '',
            cell: (o: DeliveryListOrder) => (
              <input
                type="checkbox"
                aria-label={`تحديد ${o.code ?? o.number}`}
                checked={selected.has(o.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(o.id)}
                className="h-4 w-4 accent-[rgb(var(--c-primary))]"
              />
            ),
          },
        ]
      : []),
    {
      key: 'order',
      header: 'رقم الطلب',
      cell: (o) => (
        <span className="flex flex-col">
          <span className="ltr text-start font-semibold">{o.code ?? `#${o.number}`}</span>
          <span className="text-xs text-muted">
            {formatDate(o.createdAt)} · {SOURCE_LABEL[o.source]}
          </span>
        </span>
      ),
    },
    { key: 'supplier', header: 'المورد', cell: (o) => o.supplier?.name ?? o.vendorOrders[0]?.vendor.name ?? '—' },
    {
      key: 'customer',
      header: 'العميل',
      cell: (o) => (
        <span className="flex max-w-[15rem] flex-col">
          <span>{o.customerName}</span>
          <span className="truncate text-xs text-muted">{o.area ? `${o.area} — ` : ''}{o.address}</span>
        </span>
      ),
    },
    { key: 'driver', header: 'موظف التوصيل', cell: (o) => o.driver?.name ?? o.deliveryCompany?.name ?? <span className="text-muted">غير مسند</span> },
    { key: 'status', header: 'الحالة', cell: (o) => <DeliveryStatusTag status={o.deliveryStatus} /> },
    {
      key: 'money',
      header: 'التحصيل',
      align: 'end',
      cell: (o) => (
        <span className="flex flex-col items-end gap-0.5">
          <b className="tabular-nums">{formatJOD(o.codAmount ?? 0)}</b>
          <FinancialTag status={o.financialStatus} />
        </span>
      ),
    },
  ];

  return (
    <>
      <FilterBar onClear={f.clear} active={Object.keys(params).length > 0}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="FG-ORD-… / اسم / هاتف" />
        <FilterSelect label="الحالة" value={f.values.deliveryStatus || (f.values.bucket ? `b:${f.values.bucket}` : '')} onChange={(e) => {
          const v = e.target.value;
          f.set(v.startsWith('b:') ? { bucket: v.slice(2), deliveryStatus: '' } : { deliveryStatus: v, bucket: '' });
        }}>
          <option value="">الكل</option>
          <optgroup label="مجموعات">
            {BUCKETS.map((b) => (
              <option key={b.key} value={`b:${b.key}`}>
                {b.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="الحالات">
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </optgroup>
        </FilterSelect>
        <CommonFilters f={f} drivers={carriers.drivers} suppliers={suppliers} />
        <FilterSelect label="الحالة المالية" value={f.values.financialStatus} onChange={(e) => f.set({ financialStatus: e.target.value })}>
          <option value="">الكل</option>
          {Object.entries(FINANCIAL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {canAssign && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
          <span className="me-auto self-center text-sm font-medium">تم تحديد {selected.size} طلب</span>
          <Select label="إسناد إلى" value={bulkDriver} onChange={(e) => setBulkDriver(e.target.value)} wrapperClassName="min-w-[12rem]">
            <option value="">اختر موظف التوصيل</option>
            {carriers.drivers.filter((d) => d.status === 'ACTIVE').map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.activeOrders} جارية)
              </option>
            ))}
          </Select>
          <Button disabled={!bulkDriver} loading={m.pending === 'bulk'} onClick={bulkAssign}>
            إسناد
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(o) => o.id}
        rowHref={(o) => `/admin/delivery/orders/${o.id}`}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        page={list.data?.page}
        pages={list.data?.pages}
        total={list.data?.total}
        onPage={f.setPage}
        refreshing={list.refreshing}
        empty={{ title: 'لا توجد طلبات مطابقة', description: 'جرّب تغيير الفلاتر.' }}
      />
    </>
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
/** ملخص التوصيل في صفحة طلب المتجر — الإدارة الكاملة في صفحة طلب التوصيل */
export function OrderDeliveryPanel({ order }: { order: { id: string; code?: string | null; deliveryStatus: DeliveryStatus; financialStatus?: FinancialStatus | null; codAmount: number | null; codCollected: number | null; driver: { name: string } | null; deliveryCompany: { name: string } | null } }) {
  return (
    <Panel
      title="التوصيل والتحصيل"
      actions={
        <ButtonLink to={`/admin/delivery/orders/${order.id}`} size="sm" variant="outline">
          إدارة التوصيل
        </ButtonLink>
      }
    >
      <DefList
        cols={1}
        items={[
          order.code ? ['رقم الطلب', <span key="c" className="ltr">{order.code}</span>] : null,
          ['الحالة', <DeliveryStatusTag key="s" status={order.deliveryStatus} />],
          ['موظف التوصيل', order.driver?.name ?? order.deliveryCompany?.name ?? 'غير مسند'],
          ['المطلوب تحصيله', formatJOD(order.codAmount ?? 0)],
          order.codCollected != null && ['المحصّل', formatJOD(order.codCollected)],
          ['الحالة المالية', <FinancialTag key="f" status={order.financialStatus} />],
        ]}
      />
    </Panel>
  );
}
