import { useState, type ReactNode } from 'react';
import { STATUS_LABEL as ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, cx, formatDate, formatJOD } from '../../lib/format';
import { FINANCIAL_LABEL, STATUS_LABEL as DELIVERY_LABEL, financialTone, statusTone } from '../../lib/delivery';
import {
  FEE_STATUSES,
  FEE_STATUS_HINT,
  FEE_STATUS_LABEL,
  FEE_STATUS_TONE,
  rateLabel,
  type Activity,
  type FeeRate,
  type FeeStatus,
  type FeeSummary,
  type StatementRow,
} from '../../lib/supplierFinance';
import { Panel, StatTile } from '../admin/ui';
import { Button, Icon, Tag, Textarea } from '../ui';

/** أعلى الصفحة: المستحق لفرجار الآن (قابل للضغط) + نسبة فرجار + توضيح بالأرقام */
export function FeeHeader({ summary, rate, onShowDue, rateNote }: { summary: FeeSummary; rate: FeeRate; onShowDue: () => void; rateNote: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <button
        type="button"
        onClick={onShowDue}
        className="card card-hover group relative flex flex-col items-start gap-1 border-primary/60 bg-primary/5 p-5 text-start lg:col-span-2"
      >
        <span className="text-sm font-semibold text-muted">المبلغ المستحق لفرجار · Amount Due to Farjar</span>
        <span className="font-display text-4xl font-bold tabular-nums">{formatJOD(summary.due)}</span>
        <span className="text-sm text-muted">
          {summary.outstanding > summary.due ? (
            <>
              <span>إجمالي المتبقي</span> <b className="tabular-nums">{formatJOD(summary.outstanding)}</b> · <span>معلّق</span> {formatJOD(summary.pending)}
              {summary.disputed > 0 && (
                <>
                  {' · '}
                  <span>متنازع عليه</span> {formatJOD(summary.disputed)}
                </>
              )}
            </>
          ) : (
            'اضغط لعرض الطلبات التي كوّنت هذا المبلغ'
          )}
        </span>
        <Icon name="arrowLeft" className="absolute end-5 top-5 h-5 w-5 text-muted transition-transform group-hover:-translate-x-0.5" />
      </button>
      <div className="card flex flex-col justify-between gap-2 bg-inverse p-5 text-inverse-fg">
        <span className="text-xs font-bold tracking-wider opacity-70">FARJAR PLATFORM FEE</span>
        <span className="font-display text-4xl font-bold" dir="ltr">
          {rateLabel(rate)}
        </span>
        <span className="text-xs opacity-70">{rateNote}</span>
      </div>
    </div>
  );
}

/** المثال كما يراه المورد: قيمة المبيعات للعملاء = قيمته الأساسية + إيراد فرجار */
export function FeeEquation({ summary }: { summary: FeeSummary }) {
  const part = (label: string, en: string, value: number, strong?: boolean) => (
    <div className={cx('min-w-0 flex-1 rounded-xl border border-line p-3', strong && 'bg-subtle/60')}>
      <p className="text-xs text-muted">
        {label} <span className="block text-[11px] opacity-80">{en}</span>
      </p>
      <p className={cx('mt-1 truncate tabular-nums', strong ? 'text-xl font-bold' : 'text-lg font-semibold')}>{formatJOD(value)}</p>
    </div>
  );
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {part('مبيعاتك الأساسية', 'Supplier Base Sales', summary.supplierBase)}
      <span className="text-center text-xl text-muted" aria-hidden>
        +
      </span>
      {part('إيراد فرجار', 'Farjar Revenue', summary.fees)}
      <span className="text-center text-xl text-muted" aria-hidden>
        =
      </span>
      {part('قيمة المبيعات للعملاء', 'Customer Sales Value', summary.customerSales, true)}
    </div>
  );
}

/** بطاقات الملخص المالي */
export function FeeSummaryTiles({ summary, rate, supplier, loading }: { summary?: FeeSummary; rate?: FeeRate; supplier?: boolean; loading?: boolean }) {
  const s = summary;
  const tiles: [string, ReactNode, ReactNode?, ('neutral' | 'brand' | 'sand' | 'warn')?][] = [
    ['إجمالي المبيعات', formatJOD(s?.customerSales ?? 0), `${s?.orders ?? 0} طلب · شامل نسبة فرجار`],
    ['قبل نسبة فرجار', formatJOD(s?.supplierBase ?? 0), supplier ? 'المستحق لك من المبيعات' : 'مستحق الموردين'],
    ['نسبة فرجار', rate ? <span dir="ltr">{rateLabel(rate)}</span> : '—', 'تحددها الإدارة'],
    ['إجمالي عمولة فرجار', formatJOD(s?.fees ?? 0), undefined, 'brand'],
    ['المدفوع لفرجار', formatJOD(s?.paid ?? 0), undefined, 'sand'],
    [supplier ? 'المتبقي عليك' : 'المتبقي على المورد', formatJOD(s?.outstanding ?? 0), undefined, 'warn'],
    ['معلّق', formatJOD(s?.pending ?? 0), 'طلبات قيد التنفيذ'],
    ['متنازع عليه', formatJOD(s?.disputed ?? 0), undefined],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(([label, value, sub, tone]) => (
        <StatTile key={label} label={label} value={value} sub={sub} tone={tone} loading={loading} />
      ))}
    </div>
  );
}

/** فلتر حالات المبلغ (أزرار) */
export function FeeStatusFilter({ value, onChange }: { value: FeeStatus | ''; onChange: (s: FeeStatus | '') => void }) {
  const opts: (FeeStatus | '')[] = ['', ...FEE_STATUSES];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="حالة المبلغ">
      {opts.map((s) => (
        <button
          key={s || 'all'}
          type="button"
          aria-pressed={value === s}
          title={s ? FEE_STATUS_HINT[s] : undefined}
          onClick={() => onChange(s)}
          className={cx(
            'rounded-full border px-3 py-1.5 text-sm transition-colors',
            value === s ? 'border-ink bg-ink text-bg' : 'border-line text-muted hover:border-ink hover:text-ink',
          )}
        >
          {s ? FEE_STATUS_LABEL[s] : 'الكل'}
        </button>
      ))}
    </div>
  );
}

/**
 * كشف حساب فرجار (Farjar Statement): لكل طلب منتجاته وأسعاره ونسبته ومبالغه وحالاته.
 * المورد يستطيع الاعتراض، والأدمن يفتح/يغلق النزاع.
 */
export function FeeStatement({
  rows,
  orderHref,
  onDispute,
  onToggleDispute,
  busyId,
}: {
  rows: StatementRow[];
  orderHref?: (r: StatementRow) => string;
  onDispute?: (r: StatementRow, note: string) => Promise<boolean>;
  onToggleDispute?: (r: StatementRow, disputed: boolean, note: string) => Promise<boolean>;
  busyId?: string | null;
}) {
  if (!rows.length) return <p className="p-4 text-sm text-muted sm:p-5">لا توجد طلبات بهذه الحالة.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <StatementItem key={r.id} r={r} orderHref={orderHref} onDispute={onDispute} onToggleDispute={onToggleDispute} busy={busyId === r.id} />
      ))}
    </ul>
  );
}

function StatementItem({
  r,
  orderHref,
  onDispute,
  onToggleDispute,
  busy,
}: {
  r: StatementRow;
  orderHref?: (r: StatementRow) => string;
  onDispute?: (r: StatementRow, note: string) => Promise<boolean>;
  onToggleDispute?: (r: StatementRow, disputed: boolean, note: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const canDispute = !!onDispute && r.feeStatus !== 'PAID' && r.feeStatus !== 'DISPUTED';
  const submit = async () => {
    const done = onDispute ? await onDispute(r, note.trim()) : await onToggleDispute!(r, !r.dispute, note.trim());
    if (done) {
      setOpen(false);
      setNote('');
    }
  };
  const title = `طلب #${r.number}`;
  return (
    <li className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {orderHref ? (
              <a href={orderHref(r)} className="hover:underline">
                {title}
              </a>
            ) : (
              title
            )}
            <Tag tone={FEE_STATUS_TONE[r.feeStatus]}>{FEE_STATUS_LABEL[r.feeStatus]}</Tag>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatDate(r.date)}
            {r.orderCode && (
              <>
                {' · '}
                <span dir="ltr">{r.orderCode}</span>
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Tag>الطلب: {ORDER_STATUS_LABEL[r.orderStatus]}</Tag>
            <Tag tone={statusTone(r.deliveryStatus)}>التوصيل: {DELIVERY_LABEL[r.deliveryStatus]}</Tag>
            {r.paymentStatus && <Tag tone={financialTone(r.paymentStatus)}>الدفع: {FINANCIAL_LABEL[r.paymentStatus]}</Tag>}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-x-4 text-end text-sm">
          <div>
            <dt className="text-xs text-muted">لفرجار</dt>
            <dd className="font-bold tabular-nums">{formatJOD(r.feeAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">المدفوع</dt>
            <dd className="tabular-nums">{formatJOD(r.feePaid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">المتبقي</dt>
            <dd className={cx('tabular-nums', r.remaining > 0 && 'font-bold')}>{formatJOD(r.remaining)}</dd>
          </div>
        </dl>
      </div>

      <ul className="space-y-1 rounded-xl bg-subtle/50 p-3 text-sm">
        {r.items.map((i) => (
          <li key={i.id} className="flex flex-wrap justify-between gap-x-3">
            <span className="min-w-0">
              {i.product} × {i.quantity}
            </span>
            <span className="text-xs text-muted">
              سعر المورد {formatJOD(i.supplierPrice)} · سعر العميل {formatJOD(i.customerPrice)} · <span dir="ltr">{i.feePercent}%</span> = {formatJOD(i.feeAmount)}
            </span>
          </li>
        ))}
      </ul>

      {r.settledByPayout && <p className="text-xs text-muted">حصّلت فرجار المبلغ من العميل واحتفظت بنسبتها في تسوية المورد.</p>}
      {r.dispute && (
        <p className="rounded-lg border border-danger/40 px-3 py-2 text-sm">
          <b>{r.dispute.by === 'SUPPLIER' ? 'اعتراض المورد' : 'نزاع من الإدارة'}:</b> {r.dispute.note || '—'}
        </p>
      )}

      {(canDispute || onToggleDispute) &&
        (open ? (
          <div className="space-y-2">
            <Textarea
              label={onDispute ? 'سبب الاعتراض' : r.dispute ? 'ملاحظة الإغلاق (اختياري)' : 'سبب النزاع'}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant={r.dispute ? 'primary' : 'danger'} loading={busy} disabled={!!onDispute && note.trim().length < 3} onClick={submit}>
                {onDispute ? 'إرسال الاعتراض' : r.dispute ? 'إغلاق النزاع' : 'فتح نزاع'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            {onDispute ? 'اعتراض على المبلغ' : r.dispute ? 'إغلاق النزاع' : 'فتح نزاع'}
          </Button>
        ))}
    </li>
  );
}

/** آخر العمليات المالية */
export function ActivityPanel({ items }: { items: Activity[] }) {
  return (
    <Panel title="آخر العمليات المالية" bodyClassName="p-0 sm:p-0">
      {!items.length ? (
        <p className="p-4 text-sm text-muted sm:p-5">لا توجد عمليات بعد.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={`${a.kind}-${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0">
                <span className="block font-medium">
                  {a.kind === 'SALE' ? `بيع — طلب ${a.ref}` : a.kind === 'FEE_PAYMENT' ? 'دفعة لفرجار' : 'تسوية من فرجار'}
                </span>
                <span className="text-xs text-muted">
                  {formatDate(a.date)}
                  {a.kind === 'FEE_PAYMENT' && ` · ${PAYMENT_METHOD_LABEL[a.method]}`}
                  {a.kind !== 'SALE' && a.ref && (
                    <>
                      {' · '}
                      <span dir="ltr">{a.ref}</span>
                    </>
                  )}
                  {a.kind === 'SALE' && ` · مبيعات ${formatJOD(a.total)}`}
                  {a.kind === 'PAYOUT' && ` · دُفع للمورد ${formatJOD(a.total)}`}
                </span>
              </span>
              <span className="text-end">
                <b className={cx('block tabular-nums', a.kind !== 'SALE' && 'text-success')}>
                  {a.kind === 'SALE' ? '+' : '−'} {formatJOD(a.amount)}
                </b>
                <span className="text-xs text-muted">{a.kind === 'SALE' ? 'نسبة مستحقة' : 'مسدد'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
