import { useRef, useState } from 'react';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, Panel } from '../../components/admin/ui';
import { ActivityPanel, FeeEquation, FeeHeader, FeeStatement, FeeStatusFilter, FeeSummaryTiles } from '../../components/finance/FeeFinance';
import { ErrorState, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { PAYMENT_METHOD_LABEL, formatDate, formatJOD } from '../../lib/format';
import type { Activity, FeePayment, FeeRate, FeeStatus, FeeSummary, StatementRow } from '../../lib/supplierFinance';
import { useDocumentTitle } from '../../lib/useAsync';

type Finance = { summary: FeeSummary; rate: FeeRate; activity: Activity[]; payments: FeePayment[] };

/** اللوحة المالية للمورد: نسبة فرجار والمستحق والمدفوع والمتبقي وكشف الحساب */
export default function VendorFinance() {
  useDocumentTitle('اللوحة المالية');
  const f = useFilters(['status', 'from', 'to'] as const);
  const status = f.values.status as FeeStatus | '';
  const fin = useAdminQuery(() => api.get<Finance>('/vendor/finance'), []);
  const st = useAdminQuery(
    () => api.get<{ rows: StatementRow[]; total: number }>('/vendor/finance/statement', Object.fromEntries(Object.entries(f.values).filter(([, v]) => v))),
    [JSON.stringify(f.values)],
    { keep: true },
  );
  const m = useMutation();
  const [busy, setBusy] = useState<string | null>(null);
  const statementRef = useRef<HTMLDivElement>(null);

  if (fin.error) return <ErrorState message={fin.error.message} onRetry={fin.retry} />;
  const d = fin.data;

  const showDue = () => {
    f.set({ status: 'DUE' });
    statementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const dispute = async (r: StatementRow, note: string) => {
    setBusy(r.id);
    const ok = await m.run('dispute', () => api.post(`/vendor/finance/orders/${r.id}/dispute`, { note }), 'تم إرسال الاعتراض للإدارة');
    setBusy(null);
    if (ok) {
      st.reload();
      fin.reload();
    }
    return !!ok;
  };

  return (
    <AdminPage title="اللوحة المالية" description="Financial Dashboard — كل المبالغ محسوبة من الخادم بالنسبة المثبتة وقت كل طلب، وتغيير النسبة لاحقًا لا يغيّر الطلبات السابقة.">
      {d && (
        <div className="space-y-6">
          <FeeHeader summary={d.summary} rate={d.rate} onShowDue={showDue} rateNote={d.rate.perProduct ? 'تختلف حسب المنتج · تحددها إدارة فرجار' : 'تحددها إدارة فرجار ولا يمكن تعديلها من حسابك'} />
          <FeeEquation summary={d.summary} />
        </div>
      )}
      <div className="mt-6">
        <FeeSummaryTiles summary={d?.summary} rate={d?.rate} supplier loading={fin.loading} />
      </div>

      <div ref={statementRef} className="mt-8 scroll-mt-24">
        <Panel title="كشف حساب فرجار · Farjar Statement" bodyClassName="p-0 sm:p-0">
          <div className="space-y-3 border-b border-line p-4 sm:p-5">
            <FeeStatusFilter value={status} onChange={(s) => f.set({ status: s })} />
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Input label="من تاريخ" type="date" className="ltr text-start" value={f.values.from} onChange={(e) => f.set({ from: e.target.value })} />
              <Input label="إلى تاريخ" type="date" className="ltr text-start" value={f.values.to} onChange={(e) => f.set({ to: e.target.value })} />
            </div>
          </div>
          {st.error ? (
            <ErrorState message={st.error.message} onRetry={st.retry} />
          ) : st.loading && !st.data ? (
            <p className="p-5 text-sm text-muted">جاري التحميل…</p>
          ) : (
            <FeeStatement rows={st.data?.rows ?? []} orderHref={(r) => `/vendor/orders/${r.id}`} onDispute={dispute} busyId={busy} />
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ActivityPanel items={d?.activity ?? []} />
        <Panel title="دفعاتك لفرجار" bodyClassName="p-0 sm:p-0">
          {!d?.payments.length ? (
            <p className="p-4 text-sm text-muted sm:p-5">لم تُسجَّل دفعات بعد. تسجّل الإدارة الدفعة عند استلامها.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="block font-medium">{formatDate(p.paidAt)}</span>
                    <span className="text-xs text-muted">
                      {PAYMENT_METHOD_LABEL[p.method]}
                      {p.reference && (
                        <>
                          {' · '}
                          <span dir="ltr">{p.reference}</span>
                        </>
                      )}
                      {p.orders.length > 0 && ` · طلبات ${p.orders.map((o) => `#${o.number}`).join('، ')}`}
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
