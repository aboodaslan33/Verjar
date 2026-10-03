import { Link } from 'react-router-dom';
import { useAdminQuery } from '../../../components/admin/hooks';
import { AdminPage, DetailSkeleton, Panel } from '../../../components/admin/ui';
import { ErrorState, Tag } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { REWARD_STATUS_LABEL } from '../../../lib/insights';
import { useDocumentTitle } from '../../../lib/useAsync';

type Item = {
  id: string;
  kind: 'SUPPLIER' | 'CUSTOMER';
  title: string;
  revokedAt: string | null;
  createdAt: string;
  vendor: { id: string; name: string } | null;
  customer: { id: string; name: string; companyName: string | null } | null;
  rewards: { id: string; title: string; status: string; startsAt: string; endsAt: string | null; coupon: { code: string; usedCount: number } | null }[];
};

/** أرشيف التميز والمكافآت حسب الشهر (لا يُحذف) */
export default function Archive() {
  useDocumentTitle('أرشيف التميز');
  const q = useAdminQuery(() => api.get<{ period: string; label: string; items: Item[] }[]>('/admin/insights/archive'), []);
  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  return (
    <AdminPage title="أرشيف التميز" back={{ to: '/admin/insights/recognition', label: 'التميز الشهري' }} description="سجل دائم لمورد وعميل كل شهر والمكافآت الممنوحة.">
      {q.data.length === 0 ? (
        <p className="text-sm text-muted">لا يوجد سجل بعد.</p>
      ) : (
        <div className="space-y-4">
          {q.data.map((g) => (
            <Panel key={g.period} title={g.label} actions={<Link to={`/admin/insights/recognition?period=${g.period}`} className="text-sm underline">فتح الشهر</Link>}>
              <ul className="space-y-4">
                {g.items.map((it) => (
                  <li key={it.id} className={it.revokedAt ? 'opacity-60' : ''}>
                    <p className="font-semibold">
                      {it.kind === 'SUPPLIER' ? 'مورد الشهر' : 'عميل الشهر'}:{' '}
                      {it.vendor ? (
                        <Link to={`/admin/market/suppliers/${it.vendor.id}`} className="hover:underline">
                          {it.vendor.name}
                        </Link>
                      ) : it.customer ? (
                        <Link to={`/admin/customers/${it.customer.id}`} className="hover:underline">
                          {it.customer.name}
                        </Link>
                      ) : null}{' '}
                      {it.revokedAt && <Tag tone="neutral">ملغى</Tag>}
                    </p>
                    {it.rewards.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-sm text-muted">
                        {it.rewards.map((r) => (
                          <li key={r.id}>
                            • المكافأة: <span className="text-ink">{r.title}</span>
                            {r.coupon && (
                              <>
                                {' '}
                                (<span className="ltr">{r.coupon.code}</span>، استُخدم {r.coupon.usedCount})
                              </>
                            )}{' '}
                            · {formatDate(r.startsAt)}
                            {r.endsAt && <> ← {formatDate(r.endsAt)}</>} · {REWARD_STATUS_LABEL[r.status] ?? r.status}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted">بدون مكافأة</p>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
