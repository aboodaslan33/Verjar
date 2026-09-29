import { Link } from 'react-router-dom';
import { ButtonLink, EmptyState, ErrorState, Icon, SkeletonRows, Tag } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { RFQ_STATUS_LABEL, rfqTone, type RfqStatus } from '../../lib/market';
import { useAsync } from '../../lib/useAsync';

type Row = { id: string; code: string; title: string; status: RfqStatus; createdAt: string; neededBy: string | null; finalValue: number | null; itemCount: number; supplierCount: number; quoteCount: number };

/** طلبات عروض الأسعار في حساب العميل */
export function RfqTab() {
  const q = useAsync(() => api.get<Row[]>('/market/rfqs'), [], 'account/rfqs');
  if (q.loading && !q.data) return <SkeletonRows rows={3} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!q.data?.length) {
    return (
      <EmptyState
        title="لا توجد طلبات عروض أسعار"
        description="اطلب عرض سعر لأي منتج أو احتياج صناعي، وتصلك عروض الموردين هنا للمقارنة."
        action={<ButtonLink to="/rfq/new">اطلب عرض سعر</ButtonLink>}
      />
    );
  }
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ButtonLink to="/rfq/new" size="sm">
          <Icon name="plus" className="h-4 w-4" /> طلب جديد
        </ButtonLink>
      </div>
      <ul className="space-y-3">
        {q.data.map((r) => (
          <li key={r.id}>
            <Link to={`/account/rfq/${r.id}`} className="block rounded-2xl border border-line bg-surface p-4 transition-shadow hover:shadow-lift sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="ltr text-xs font-semibold text-muted">{r.code}</p>
                  <p className="mt-1 font-semibold">
                    {r.title}
                    {r.itemCount > 1 && <span className="text-muted"> + {r.itemCount - 1} بنود</span>}
                  </p>
                </div>
                <Tag tone={rfqTone(r.status)}>{RFQ_STATUS_LABEL[r.status]}</Tag>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>{formatDate(r.createdAt)}</span>
                <span>
                  <span className="num font-semibold text-ink">{r.quoteCount}</span> عروض من <span className="num">{r.supplierCount}</span> موردين
                </span>
                {r.finalValue != null && <span>قيمة الصفقة {formatJOD(r.finalValue)}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
