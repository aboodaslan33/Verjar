import { Link } from 'react-router-dom';
import { STATUS_LABEL, formatDate, formatJOD } from '../../lib/format';
import { Tag } from '../ui';
import type { FeeLine, FeeProductRow, FeeTotals } from './types';
import { Panel, StatTile } from './ui';

/** بطاقات نسبة فرجار: المبيعات، إجمالي النسبة، المسدد، والمستحق */
export function FeeTiles({ totals, loading, supplier }: { totals?: FeeTotals; loading?: boolean; supplier?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="إجمالي المبيعات" value={formatJOD(totals?.sales ?? 0)} sub={`${totals?.units ?? 0} وحدة مباعة`} loading={loading} />
      <StatTile label="إجمالي نسبة فرجار" value={formatJOD(totals?.fees ?? 0)} sub={supplier ? `صافيك ${formatJOD(totals?.supplierNet ?? 0)}` : undefined} tone="brand" loading={loading} />
      <StatTile label={supplier ? 'المسدد لفرجار' : 'المحصّل'} value={formatJOD(totals?.feesSettled ?? 0)} sub="مخصوم في تسويات مدفوعة" tone="sand" loading={loading} />
      <StatTile label={supplier ? 'المستحق لفرجار' : 'المستحق لفرجار'} value={formatJOD(totals?.feesOutstanding ?? 0)} sub="لم يدخل تسوية بعد" tone="warn" loading={loading} />
    </div>
  );
}

/** إيراد فرجار حسب المنتج: المباع والمتبقي والمبيعات والنسبة */
export function FeeByProduct({ rows, productHref, showSupplier }: { rows: FeeProductRow[]; productHref?: (id: string) => string; showSupplier?: boolean }) {
  return (
    <Panel title="حسب المنتج" bodyClassName="p-0 sm:p-0">
      {!rows.length ? (
        <p className="p-4 text-sm text-muted sm:p-5">لا توجد مبيعات بعد.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.productId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
              <span className="min-w-0">
                {productHref ? (
                  <Link to={productHref(r.productId)} className="block font-medium hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  <span className="block font-medium">{r.name}</span>
                )}
                <span className="text-xs text-muted">
                  {showSupplier && r.vendor ? `${r.vendor.name} · ` : ''}
                  بيع {r.units} · باقي {r.remaining} · مبيعات {formatJOD(r.sales)}
                  {r.currentFeePercent != null && (
                    <>
                      {' '}
                      · النسبة الحالية <span dir="ltr">{r.currentFeePercent}%</span>
                    </>
                  )}
                </span>
              </span>
              <span className="text-end">
                <b className="block tabular-nums">{formatJOD(r.fees)}</b>
                <span className="text-xs text-muted">لفرجار</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** بنود الطلبات: لقطة السعر والنسبة وقت البيع */
export function FeeByOrder({ lines, orderHref, showSupplier }: { lines: FeeLine[]; orderHref?: (l: FeeLine) => string; showSupplier?: boolean }) {
  return (
    <Panel title="حسب الطلب" bodyClassName="p-0 sm:p-0">
      {!lines.length ? (
        <p className="p-4 text-sm text-muted sm:p-5">لا توجد طلبات بعد.</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {orderHref ? (
                    <Link to={orderHref(l)} className="hover:underline">
                      طلب #{showSupplier ? l.orderNumber : l.vendorOrderNumber}
                    </Link>
                  ) : (
                    <>طلب #{showSupplier ? l.orderNumber : l.vendorOrderNumber}</>
                  )}
                  <Tag>{STATUS_LABEL[l.status]}</Tag>
                  {l.settled && <Tag tone="sand">مسوّى</Tag>}
                </span>
                <span className="block text-sm">
                  {l.name} × {l.quantity}
                </span>
                <span className="text-xs text-muted">
                  {formatDate(l.createdAt)}
                  {showSupplier && l.vendor ? ` · ${l.vendor.name}` : ''} · سعر المورد {formatJOD(l.supplierUnitPrice)} · سعر العميل {formatJOD(l.customerUnitPrice)} · النسبة{' '}
                  <span dir="ltr">{l.feePercent}%</span>
                </span>
              </span>
              <span className="text-end">
                <b className="block tabular-nums">{formatJOD(l.feeAmount)}</b>
                <span className="text-xs text-muted">من {formatJOD(l.lineTotal)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
