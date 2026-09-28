import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters } from '../../components/admin/hooks';
import { AdminPage, FilterBar, FilterInput, FilterSelect, Panel } from '../../components/admin/ui';
import { Button, ButtonA, Icon } from '../../components/ui';
import { api } from '../../lib/api';
import { cx, formatJOD, STATUS_LABEL, STATUS_ORDER } from '../../lib/format';
import { useI18n, type MessageKey } from '../../lib/i18n';
import { MESSAGES } from '../../lib/i18n/messages';
import { useDocumentTitle } from '../../lib/useAsync';
import { ALL_STATUSES, PAY_LABEL } from '../../lib/delivery';

/** فلاتر إضافية لتقارير نظام التوصيل */
const DM_FILTERS = ['supplierId', 'driverId', 'area', 'paymentMethod', 'customer'] as const;

const GENERAL = ['sales', 'orders', 'delivery', 'cod', 'settlements', 'contracts', 'annual', 'pest', 'tenders', 'commissions'] as const;
const DM = ['dm_orders', 'dm_delivered', 'dm_failed', 'dm_collections', 'dm_drivers', 'dm_suppliers', 'dm_customers', 'dm_fees'] as const;
const KINDS = [...GENERAL, ...DM] as const;
type Kind = (typeof KINDS)[number];
type Col = { key: string; ar: string; en: string; money?: boolean };
type Report = { columns: Col[]; rows: Record<string, unknown>[]; totals: Record<string, number> };

const ORDER_EN: Record<string, string> = { NEW: 'New', UNDER_REVIEW: 'Under review', PRICED: 'Priced', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const DELIVERY_STATUSES: string[] = ALL_STATUSES;
const CONTRACT = ['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED'];
/** قيم فلتر الحالة لكل تقرير ومفتاح ترجمتها */
const STATUS: Partial<Record<Kind, { values: string[]; prefix: string }>> = {
  orders: { values: STATUS_ORDER, prefix: 'order.' },
  delivery: { values: DELIVERY_STATUSES, prefix: 'delivery.status.' },
  dm_orders: { values: DELIVERY_STATUSES, prefix: 'delivery.status.' },
  dm_collections: { values: DELIVERY_STATUSES, prefix: 'delivery.status.' },
  cod: { values: ['PENDING', 'COLLECTED', 'SETTLED'], prefix: 'cod.status.' },
  settlements: { values: ['CONFIRMED', 'VOIDED'], prefix: 'settle.status.' },
  contracts: { values: CONTRACT, prefix: 'contract.status.' },
  annual: { values: CONTRACT, prefix: 'contract.status.' },
  pest: { values: CONTRACT, prefix: 'contract.status.' },
  tenders: { values: ['DRAFT', 'OPEN', 'CLOSED', 'UNDER_REVIEW', 'AWARDED', 'CANCELLED'], prefix: 'tender.status.' },
};

/** يترجم قيم الحالات/الأنواع في الخلايا إن وُجد لها مفتاح */
const CELL_PREFIX: Record<string, string[]> = {
  deliveryStatus: ['delivery.status.'],
  financial: ['fin.'],
  codStatus: ['cod.status.'],
  paymentMethod: ['pay.'],
  type: ['contract.type.'],
  status: ['contract.status.', 'tender.status.', 'settle.status.', 'delivery.status.'],
};

/** إجماليات لا تقابل عمودًا في الجدول: [عربي، إنجليزي، مبلغ مالي] */
const TOTALS: Record<string, [string, string, boolean]> = {
  count: ['عدد السجلات', 'Records', false],
  confirmed: ['تسويات مؤكدة', 'Confirmed settlements', true],
  settled: ['مُسوّى', 'Settled', true],
  active: ['نشطة', 'Active', false],
  expiring: ['قاربت على الانتهاء', 'Expiring soon', false],
  awarded: ['مُرسّاة', 'Awarded', false],
  tenders: ['عمولات العطاءات', 'Tender commissions', true],
  marketplace: ['عمولات المتجر', 'Marketplace commissions', true],
  pestRequests: ['طلبات مكافحة الآفات', 'Pest control requests', false],
  remaining: ['غير المحصّل', 'Uncollected', true],
};

export default function Reports() {
  const { t, lang } = useI18n();
  useDocumentTitle(t('report.title'));
  const f = useFilters(['kind', 'from', 'to', 'status', ...DM_FILTERS] as const);
  const kind: Kind = (KINDS as readonly string[]).includes(f.values.kind) ? (f.values.kind as Kind) : 'sales';
  const isDm = kind.startsWith('dm_');
  const params: Record<string, string | undefined> = { from: f.values.from || undefined, to: f.values.to || undefined, status: f.values.status || undefined };
  if (isDm) for (const k of DM_FILTERS) params[k] = f.values[k] || undefined;
  const q = useAdminQuery(() => api.get<Report>(`/admin/reports/${kind}`, params), [kind, JSON.stringify(params)], { keep: true });
  // قوائم الفلاتر (قد لا يملك المستخدم صلاحيتها — تبقى فارغة)
  const lookups = useAdminQuery(
    () =>
      isDm
        ? Promise.all([
            api.get<{ id: string; name: string }[]>('/admin/delivery/suppliers').catch(() => []),
            api.get<{ id: string; name: string }[]>('/admin/delivery/drivers').catch(() => []),
          ])
        : Promise.resolve([[], []] as { id: string; name: string }[][]),
    [isDm],
  );
  const [suppliers, drivers] = lookups.data ?? [[], []];
  const anyFilter = Boolean(f.values.from || f.values.to || f.values.status || (isDm && DM_FILTERS.some((k) => f.values[k])));

  const label = (key: string, v: unknown): string => {
    if (v == null || v === '') return '—';
    const s = String(v);
    if (kind === 'orders' && key === 'status') return (lang === 'ar' ? STATUS_LABEL[s as keyof typeof STATUS_LABEL] : ORDER_EN[s]) ?? s;
    for (const p of CELL_PREFIX[key] ?? []) if (`${p}${s}` in MESSAGES) return t(`${p}${s}` as MessageKey);
    return s;
  };

  const report = q.data;
  const columns: Column<Record<string, unknown>>[] = (report?.columns ?? []).map((c) => ({
    key: c.key,
    header: lang === 'ar' ? c.ar : c.en,
    align: c.money ? 'end' : undefined,
    cell: (r) => (c.money ? <span className="tabular-nums">{formatJOD(r[c.key] as number)}</span> : <span className={cx(typeof r[c.key] === 'number' && 'tabular-nums')}>{label(c.key, r[c.key])}</span>),
  }));
  const total = (k: string): { label: string; money: boolean } => {
    const c = report?.columns.find((x) => x.key === k);
    if (c) return { label: lang === 'ar' ? c.ar : c.en, money: Boolean(c.money) };
    const x = TOTALS[k];
    return x ? { label: lang === 'ar' ? x[0] : x[1], money: x[2] } : { label: k, money: false };
  };

  const exportUrl = (format: 'csv' | 'xlsx') =>
    api.url(`/admin/reports/${kind}?${new URLSearchParams({ format, lang, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) } as Record<string, string>)}`);
  const st = STATUS[kind];

  return (
    <AdminPage
      title={t('report.title')}
      description={t('report.subtitle')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <ButtonA href={exportUrl('xlsx')} download variant="outline" size="sm">
            <Icon name="download" className="h-4 w-4" /> {t('report.excel')}
          </ButtonA>
          <ButtonA href={exportUrl('csv')} download variant="ghost" size="sm">
            {t('common.export')}
          </ButtonA>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Icon name="printer" className="h-4 w-4" /> {t('report.print')}
          </Button>
        </div>
      }
    >
      <p className="print-only mb-4 text-sm">
        {t(`report.${kind}`)} · {f.values.from || '…'} → {f.values.to || '…'}
      </p>
      <div className="no-print mb-2 flex gap-2 text-xs font-semibold text-muted">
        <button type="button" onClick={() => f.set({ kind: '', status: '' })} className={cx('rounded-full px-3 py-1', !isDm ? 'bg-ink text-bg' : 'bg-subtle hover:text-ink')}>
          {t('report.groupGeneral')}
        </button>
        <button type="button" onClick={() => f.set({ kind: 'dm_orders', status: '' })} className={cx('rounded-full px-3 py-1', isDm ? 'bg-ink text-bg' : 'bg-subtle hover:text-ink')}>
          {t('report.groupDelivery')}
        </button>
      </div>
      <div role="tablist" className="no-print scroll-x mb-5 flex gap-1 border-b border-line">
        {(isDm ? DM : GENERAL).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => f.set({ kind: k === 'sales' ? '' : k, status: '' })}
            className={cx(
              'relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary after:transition-transform',
              kind === k ? 'text-ink after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-ink',
            )}
          >
            {t(`report.${k}`)}
          </button>
        ))}
      </div>

      <div className="no-print">
      <FilterBar onClear={() => f.set({ from: '', to: '', status: '', supplierId: '', driverId: '', area: '', paymentMethod: '', customer: '' })} active={anyFilter}>
        <FilterInput label={t('common.from')} type="date" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
        <FilterInput label={t('common.to')} type="date" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
        {st && (
          <FilterSelect label={t('common.status')} value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {st.values.map((v) => (
              <option key={v} value={v}>
                {kind === 'orders' ? (lang === 'ar' ? STATUS_LABEL[v as keyof typeof STATUS_LABEL] : ORDER_EN[v]) : t(`${st.prefix}${v}` as MessageKey)}
              </option>
            ))}
          </FilterSelect>
        )}
        {isDm && (
          <>
            <FilterSelect label="المورد" value={f.values.supplierId} onChange={(e) => f.set({ supplierId: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {suppliers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="موظف التوصيل" value={f.values.driverId} onChange={(e) => f.set({ driverId: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {drivers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="طريقة الدفع" value={f.values.paymentMethod} onChange={(e) => f.set({ paymentMethod: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {['COD', 'CASH', 'CLIQ', 'BANK_TRANSFER', 'CARD'].map((v) => (
                <option key={v} value={v}>
                  {PAY_LABEL[v]}
                </option>
              ))}
            </FilterSelect>
            <FilterInput label="المنطقة" value={f.values.area} onChange={(e) => f.set({ area: e.target.value })} />
            <FilterInput label="العميل" placeholder="الاسم أو الهاتف" value={f.values.customer} onChange={(e) => f.set({ customer: e.target.value })} />
          </>
        )}
      </FilterBar>
      </div>

      {report && (
        <Panel title={t('report.totals')} actions={<span className="text-xs text-muted">{t('report.rows', { n: report.rows.length })}</span>} className="mb-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(report.totals).map(([k, v]) => {
              const x = total(k);
              return (
                <div key={k}>
                  <dt className="text-xs text-muted">{x.label}</dt>
                  <dd className="mt-1 font-display text-lg font-semibold tabular-nums">{x.money ? formatJOD(v) : v}</dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      )}

      <DataTable
        rows={report?.rows}
        columns={columns}
        rowKey={(r) => String(r.code ?? r.ref ?? r.number ?? r.date ?? r.name ?? JSON.stringify(r))}
        loading={q.loading}
        error={q.error}
        onRetry={q.reload}
        refreshing={q.loading && !!report}
        empty={{ title: t('common.none') }}
      />
    </AdminPage>
  );
}
