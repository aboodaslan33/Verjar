import { Link } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import { useLive } from '../../components/admin/live';
import type { DashboardStats } from '../../components/admin/types';
import { AdminPage, Panel, StatTile } from '../../components/admin/ui';
import { URGENCY_LABEL } from '../../components/admin/labels';
import { ButtonLink, ErrorState, Skeleton, StatusBadge, Tag } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { api } from '../../lib/api';
import { BOOKING_TYPE_LABEL, CORPORATE_TYPE_LABEL, formatDate, formatJOD, formatTime } from '../../lib/format';
import type { BookingType, CorporateType } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

const KIND_LABEL = { booking: 'حجز', order: 'طلب متجر', corporate: 'طلب شركة' } as const;
const KIND_PATH = { booking: '/admin/bookings/', order: '/admin/orders/', corporate: '/admin/corporate/' } as const;

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'الآن';
  if (diff < 60) return `قبل ${Math.floor(diff)} د`;
  if (diff < 60 * 24) return `قبل ${Math.floor(diff / 60)} س`;
  return formatDate(iso);
}

export default function Dashboard() {
  useDocumentTitle('لوحة التحكم');
  const { admin } = useAdmin();
  const { recent } = useLive();
  const { data, error, loading, retry, refreshing } = useAdminQuery(
    () => api.get<DashboardStats>('/admin/dashboard/stats'),
    [],
    { live: true },
  );

  return (
    <AdminPage
      title={`أهلًا ${admin?.name ?? ''}`}
      description={formatDate(new Date(), false)}
      actions={
        <>
          <ButtonLink to="/admin/bookings?view=calendar" variant="outline" size="sm">
            التقويم
          </ButtonLink>
          <ButtonLink to="/admin/products/new" size="sm">
            منتج جديد
          </ButtonLink>
        </>
      }
    >
      {error && !data ? (
        <ErrorState message={error.message} onRetry={retry} />
      ) : (
        <div className="space-y-6">
          {recent.length > 0 && (
            <div className="card flex flex-wrap items-center gap-x-4 gap-y-1 border-s-4 border-s-sand-400 px-4 py-3 text-sm">
              <span className="font-semibold">وصل الآن:</span>
              {recent.slice(0, 3).map((e, i) => (
                <span key={i} className="text-muted">
                  {e.title} <span className="text-xs">({relTime(e.at)})</span>
                </span>
              ))}
            </div>
          )}
          <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 ${refreshing ? 'opacity-80' : ''}`}>
            <StatTile label="حجوزات اليوم" value={data?.bookingsToday ?? 0} loading={loading} tone="brand" to="/admin/bookings?view=calendar" />
            <StatTile label="حجوزات جديدة" value={data?.newBookings ?? 0} loading={loading} tone={data?.newBookings ? 'sand' : 'neutral'} to="/admin/bookings?status=NEW" />
            <StatTile label="طلبات متجر جديدة" value={data?.newOrders ?? 0} loading={loading} tone={data?.newOrders ? 'sand' : 'neutral'} to="/admin/orders?status=NEW" />
            <StatTile label="عقود شركات معلّقة" value={data?.pendingCorporate ?? 0} loading={loading} to="/admin/corporate" />
            <StatTile
              label="مبيعات المتجر هذا الشهر"
              value={<span className="text-xl">{formatJOD(data?.salesMonth ?? 0)}</span>}
              sub={`${data?.ordersMonth ?? 0} طلب`}
              loading={loading}
              to="/admin/orders"
            />
            <StatTile
              label="عقود تنتهي خلال 30 يوم"
              value={data?.expiringContracts ?? 0}
              loading={loading}
              tone={data?.expiringContracts ? 'warn' : 'neutral'}
              to="/admin/contracts?expiring=true"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel
              title="المواعيد القادمة"
              className="lg:col-span-3"
              bodyClassName="p-0 sm:p-0"
              actions={
                <Link to="/admin/bookings" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
                  كل الحجوزات
                </Link>
              }
            >
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : !data?.upcoming.length ? (
                <p className="p-5 text-sm text-muted">لا توجد مواعيد قادمة.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcoming.map((b) => (
                    <li key={b.id}>
                      <Link to={`/admin/bookings/${b.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-subtle/60 sm:px-5">
                        <div className="w-20 shrink-0 text-center">
                          <p className="text-sm font-bold">{formatTime(b.scheduledAt)}</p>
                          <p className="text-xs text-muted">{formatDate(b.scheduledAt)}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {b.name} <span className="text-xs text-muted">#{b.number}</span>
                          </p>
                          <p className="truncate text-xs text-muted">
                            {BOOKING_TYPE_LABEL[b.type]} · {b.locationText}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge status={b.status} />
                          {b.urgency === 'EMERGENCY' && <Tag tone="danger">{URGENCY_LABEL.EMERGENCY}</Tag>}
                          {b.urgency === 'URGENT' && <Tag tone="brand">{URGENCY_LABEL.URGENT}</Tag>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="آخر النشاطات" className="lg:col-span-2" bodyClassName="p-0 sm:p-0">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !data?.activity.length ? (
                <p className="p-5 text-sm text-muted">لا توجد نشاطات بعد.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.activity.map((a) => (
                    <li key={`${a.kind}-${a.id}`}>
                      <Link to={KIND_PATH[a.kind] + a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle/60 sm:px-5">
                        <span className="w-16 shrink-0 text-xs font-medium text-muted">{KIND_LABEL[a.kind]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {a.title} <span className="text-xs text-muted">#{a.number}</span>
                          </p>
                          <p className="truncate text-xs text-muted">
                            {a.kind === 'order'
                              ? formatJOD(a.sub)
                              : a.kind === 'booking'
                                ? BOOKING_TYPE_LABEL[a.sub as BookingType]
                                : CORPORATE_TYPE_LABEL[a.sub as CorporateType]}{' '}
                            · {relTime(a.at)}
                          </p>
                        </div>
                        <StatusBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
