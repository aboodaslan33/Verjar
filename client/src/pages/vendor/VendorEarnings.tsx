import { useAdminQuery } from '../../components/admin/hooks';
import type { DueVendorOrder, VendorPayout, VendorTotals } from '../../components/admin/types';
import { AdminPage, Ltr, Panel, StatTile } from '../../components/admin/ui';
import { ErrorState } from '../../components/ui';
import { api } from '../../lib/api';
import { PAYMENT_METHOD_LABEL, formatDate, formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

type Earnings = { totals: VendorTotals; payouts: VendorPayout[]; dueOrders: DueVendorOrder[] };

export default function VendorEarnings() {
  useDocumentTitle('الأرباح');
  const q = useAdminQuery(() => api.get<Earnings>('/vendor/earnings'), []);
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  const t = q.data?.totals;

  return (
    <AdminPage title="الأرباح" description="المبالغ محسوبة بنسبة العمولة وقت كل بيع">
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="المبيعات" value={formatJOD(t?.salesTotal ?? 0)} sub={`${t?.ordersCount ?? 0} طلب`} loading={q.loading} />
        <StatTile label="عمولة المنصة" value={formatJOD(t?.commissionTotal ?? 0)} loading={q.loading} />
        <StatTile label="مستحق لك" value={formatJOD(t?.due ?? 0)} sub={t && t.pending > 0 ? `و${formatJOD(t.pending)} من طلبات قيد التنفيذ` : undefined} tone="warn" loading={q.loading} />
        <StatTile label="استلمت" value={formatJOD(t?.paid ?? 0)} tone="sand" loading={q.loading} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="طلبات مكتملة بانتظار الدفع" bodyClassName="p-0 sm:p-0">
          {!q.data?.dueOrders.length ? (
            <p className="p-4 text-sm text-muted sm:p-5">لا توجد مبالغ بانتظار الدفع.</p>
          ) : (
            <ul className="divide-y divide-line">
              {q.data.dueOrders.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span>
                    <span className="block font-medium">طلب #{d.number}</span>
                    <span className="text-xs text-muted">
                      {formatDate(d.createdAt)} · مبيعات {formatJOD(d.total)} · عمولة {formatJOD(d.commissionTotal)}
                    </span>
                  </span>
                  <b className="tabular-nums">{formatJOD(d.vendorNet)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="الدفعات المستلمة" bodyClassName="p-0 sm:p-0">
          {!q.data?.payouts.length ? (
            <p className="p-4 text-sm text-muted sm:p-5">لم تُسجَّل دفعات بعد.</p>
          ) : (
            <ul className="divide-y divide-line">
              {q.data.payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span>
                    <span className="block font-medium">{formatDate(p.paidAt)}</span>
                    <span className="text-xs text-muted">
                      {PAYMENT_METHOD_LABEL[p.method]} · {p.ordersCount} طلب
                      {p.reference && (
                        <>
                          {' '}
                          · <Ltr>{p.reference}</Ltr>
                        </>
                      )}
                    </span>
                  </span>
                  <b className="tabular-nums">{formatJOD(p.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
