import { Link } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import { AdminPage, Panel, StatTile } from '../../components/admin/ui';
import { Alert, ButtonLink, ErrorState, Icon, SkeletonRows, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';
import type { VendorMe, VendorOrder } from './types';
import { MarketSummary, VendorStatusBanner, type MarketOverview } from './VendorMarket';

export default function VendorHome() {
  useDocumentTitle('لوحة المورد');
  const me = useAdminQuery(() => api.get<VendorMe>('/vendor/me'), []);
  const orders = useAdminQuery(() => api.get<Paged<VendorOrder>>('/vendor/orders', { pageSize: 5 }), []);
  const market = useAdminQuery(() => api.get<MarketOverview>('/vendor/market/overview'), []);
  if (me.error) return <ErrorState message={me.error.message} onRetry={me.retry} />;
  const d = me.data;

  return (
    <AdminPage
      title={d ? `أهلًا، ${d.vendor.name}` : 'لوحة المورد'}
      description="FARJAR Industrial Marketplace — منتجاتك، طلبات عروض الأسعار، وصفقاتك"
      actions={
        <ButtonLink to="/vendor/products/new" size="sm">
          <Icon name="plus" className="h-4 w-4" /> منتج جديد
        </ButtonLink>
      }
    >
      <VendorStatusBanner o={market.data} />
      <MarketSummary o={market.data} loading={market.loading} />
      {d && d.counts.rejected > 0 && (
        <Alert tone="error" className="mb-4">
          لديك {d.counts.rejected} منتج مرفوض.{' '}
          <Link to="/vendor/products?approval=REJECTED" className="font-semibold underline">
            راجع سبب الرفض
          </Link>
        </Alert>
      )}
      {d && d.counts.pending > 0 && (
        <Alert tone="info" className="mb-4">
          {d.counts.pending} منتج بانتظار موافقة الإدارة، ولن يظهر في المتجر قبلها.
        </Alert>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="طلبات متجر جديدة" value={d?.counts.newOrders ?? 0} to="/vendor/orders?status=NEW" tone={d?.counts.newOrders ? 'brand' : 'neutral'} loading={me.loading} />
        <StatTile label="المبيعات" value={formatJOD(d?.totals.salesTotal ?? 0)} sub={`${d?.totals.ordersCount ?? 0} طلب`} loading={me.loading} />
        <StatTile label="المستحق لك" value={formatJOD(d?.totals.due ?? 0)} sub="من الطلبات المكتملة" to="/vendor/earnings" tone="warn" loading={me.loading} />
        <StatTile label="المنتجات" value={d?.counts.products ?? 0} to="/vendor/products" loading={me.loading} />
      </div>
      <Panel
        title="أحدث الطلبات"
        actions={
          <Link to="/vendor/orders" className="text-sm text-muted hover:text-ink">
            كل الطلبات
          </Link>
        }
        bodyClassName="p-0 sm:p-0"
      >
        {orders.loading ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : !orders.data?.items.length ? (
          <p className="p-4 text-sm text-muted sm:p-5">لا توجد طلبات بعد. تظهر هنا طلبات منتجاتك فور وصولها.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/vendor/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      طلب #{o.number} · {o.order.customerName}
                    </span>
                    <span className="text-xs text-muted">
                      {o.items.length} صنف · {formatDate(o.createdAt, true)}
                    </span>
                  </span>
                  <span className="text-end">
                    <span className="block font-semibold tabular-nums">{formatJOD(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  );
}
