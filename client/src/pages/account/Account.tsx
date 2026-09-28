import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  ButtonA,
  ButtonLink,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageLoader,
  Skeleton,
  SkeletonRows,
  StatusBadge,
  Tag,
} from '../../components/ui';
import { DeliveryStatusTag } from '../../components/delivery/Tags';
import { DeliveryTimeline } from '../../components/delivery/Timeline';
import { NotificationsBell } from '../../components/NotificationsBell';
import { isAdminUser, useAuth } from '../../context/Auth';
import { useCustomer } from '../../context/CustomerAuth';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import {
  BOOKING_TYPE_LABEL,
  CORPORATE_TYPE_LABEL,
  FILE_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  cx,
  displayPhone,
  formatDate,
  formatJOD,
} from '../../lib/format';
import type { DeliveryStatus } from '../../lib/delivery';
import type { BookingType, CorporateType, CustomerMe, Finance, RequestStatus } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { TendersTab } from './AccountTenders';

// ───────────── أنواع استجابة /account/overview ─────────────

type Num = number | string;
type Linked = { number: number } | null;

type OBooking = {
  id: string;
  number: number;
  ref: string;
  type: BookingType;
  status: RequestStatus;
  scheduledAt: string;
  locationText: string;
  urgency: 'NORMAL' | 'URGENT' | 'EMERGENCY';
  inspectionFee: Num | null;
  quotedAmount: Num | null;
  createdAt: string;
};
type OOrder = {
  id: string;
  number: number;
  ref: string;
  code: string | null;
  status: RequestStatus;
  deliveryStatus: DeliveryStatus;
  total: Num;
  subtotal: Num;
  discountTotal: Num;
  address: string | null;
  createdAt: string;
  items: { id: string; name: string; quantity: number; lineTotal: Num; vendorOrderId: string }[];
  vendorOrders: { id: string; number: number; status: RequestStatus; total: Num; vendor: { name: string; slug: string; isHouse: boolean } }[];
};
type OCorporate = {
  id: string;
  number: number;
  ref: string;
  type: CorporateType;
  status: RequestStatus;
  companyName: string;
  quotedAmount: Num | null;
  createdAt: string;
  services: { name: string }[];
};
type OContract = {
  id: string;
  number: number;
  title: string;
  startDate: string;
  endDate: string;
  value: Num;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  fileUrl: string | null;
};
type OFile = {
  id: string;
  kind: string;
  title: string;
  url: string;
  amount: Num | null;
  createdAt: string;
  booking: Linked;
  order: Linked;
  corporateRequest: Linked;
  contract: Linked;
};
type OPayment = {
  id: string;
  amount: Num;
  method: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  booking: Linked;
  order: Linked;
  contract: Linked;
};
type Overview = {
  bookings: OBooking[];
  orders: OOrder[];
  corporate: OCorporate[];
  contracts: OContract[];
  files: OFile[];
  payments: OPayment[];
  finance: Finance;
};

const PROGRESS: RequestStatus[] = ['NEW', 'UNDER_REVIEW', 'PRICED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const CONTRACT_STATUS: Record<OContract['status'], string> = { ACTIVE: 'ساري', EXPIRED: 'منتهي', CANCELLED: 'ملغي' };

type TabKey = 'bookings' | 'orders' | 'corporate' | 'tenders' | 'files' | 'payments';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'bookings', label: 'الحجوزات' },
  { key: 'orders', label: 'الطلبات' },
  { key: 'corporate', label: 'الشركات والعقود' },
  { key: 'tenders', label: 'العطاءات' },
  { key: 'files', label: 'الملفات' },
  { key: 'payments', label: 'الدفعات' },
];

function linkedLabel(x: { booking?: Linked; order?: Linked; corporateRequest?: Linked; contract?: Linked }): string | null {
  if (x.booking) return `حجز #${x.booking.number}`;
  if (x.order) return `طلب متجر #${x.order.number}`;
  if (x.corporateRequest) return `طلب شركة #${x.corporateRequest.number}`;
  if (x.contract) return `عقد #${x.contract.number}`;
  return null;
}

// ───────────── الصفحة ─────────────

export default function Account() {
  useDocumentTitle('صفحتي');
  const { user } = useAuth();
  const { customer, loading } = useCustomer();
  if (loading) return <PageLoader />;
  if (isAdminUser(user)) return <Navigate to="/admin" replace />;
  if (!customer) return <Navigate to="/login?next=/account" replace />;
  return <AccountView customer={customer} />;
}

function AccountView({ customer }: { customer: CustomerMe }) {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'bookings') as TabKey;
  const { data, error, loading, reload } = useAsync(() => api.get<Overview>('/account/overview'), [customer.id]);

  const counts: Record<TabKey, number> = {
    bookings: data?.bookings.length ?? 0,
    orders: data?.orders.length ?? 0,
    corporate: (data?.corporate.length ?? 0) + (data?.contracts.length ?? 0),
    tenders: 0,
    files: data?.files.length ?? 0,
    payments: data?.payments.length ?? 0,
  };

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="container flex flex-wrap items-end justify-between gap-4 py-8 md:py-10">
          <div>
            <p className="eyebrow">صفحتي</p>
            <h1 className="mt-1 text-2xl md:text-3xl">أهلًا {customer.name}</h1>
            <p className="mt-1 text-muted">
              <span className="ltr">{displayPhone(customer.phone)}</span>
              {customer.companyName && <span> · {customer.companyName}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationsBell hrefFor={(n) => (n.orderId && n.recipientType === 'VENDOR' ? `/vendor/delivery/${n.orderId}` : n.orderId ? '/account?tab=orders' : null)} />
            {customer.vendor && (
              <ButtonLink to="/vendor" variant="outline">
                لوحة متجري: {customer.vendor.name}
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      <div className="container py-8 md:py-10">
        {!customer.hasPassword && <PasswordCard customer={customer} prominent />}

        {/* ملخص مالي */}
        <section aria-label="الملخص المالي" className="grid grid-cols-3 gap-2 sm:gap-4">
          {loading && !data ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
          ) : (
            <>
              <FinanceTile label="إجمالي المطلوب" value={data?.finance.billed ?? 0} />
              <FinanceTile label="المدفوع" value={data?.finance.paid ?? 0} />
              <FinanceTile label="المتبقي" value={data?.finance.remaining ?? 0} highlight={(data?.finance.remaining ?? 0) > 0} />
            </>
          )}
        </section>

        {/* التبويبات */}
        <div className="sticky top-16 z-20 -mx-4 mt-8 border-b border-line bg-bg px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="أقسام الحساب" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  id={`tab-${t.key}`}
                  aria-selected={active}
                  aria-controls={`panel-${t.key}`}
                  onClick={() => setParams(t.key === 'bookings' ? {} : { tab: t.key }, { replace: true })}
                  className={cx(
                    'flex min-h-[48px] shrink-0 items-center gap-2 border-b-2 px-3 text-[15px] transition-colors',
                    active ? 'border-brand-700 font-semibold text-ink dark:border-brand-300' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {t.label}
                  {data && counts[t.key] > 0 && (
                    <span className={cx('rounded-full px-1.5 text-xs', active ? 'bg-primary text-primary-fg' : 'bg-subtle text-muted')}>
                      <span className="ltr">{counts[t.key]}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
          {loading && !data ? (
            <SkeletonRows rows={3} />
          ) : error ? (
            <ErrorState message={error.status === 401 ? 'انتهت الجلسة. سجّل الدخول مرة أخرى.' : error.message} onRetry={reload} />
          ) : data ? (
            <>
              {tab === 'bookings' && <BookingsTab items={data.bookings} />}
              {tab === 'orders' && <OrdersTab items={data.orders} />}
              {tab === 'corporate' && <CorporateTab items={data.corporate} contracts={data.contracts} />}
              {tab === 'tenders' && <TendersTab />}
              {tab === 'files' && <FilesTab items={data.files} />}
              {tab === 'payments' && <PaymentsTab items={data.payments} />}
            </>
          ) : null}
        </div>

        <section aria-labelledby="profile-title" className="mt-12 border-t border-line pt-8">
          <h2 id="profile-title" className="text-lg">
            بياناتي
          </h2>
          <ProfileCard customer={customer} />
          {customer.hasPassword && (
            <div className="mt-4">
              <PasswordCard customer={customer} />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ───────────── مكونات ─────────────

function FinanceTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cx(
        'min-w-0 rounded-2xl border p-3 sm:p-5',
        highlight ? 'border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-500/10' : 'border-line bg-surface',
      )}
    >
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className="mt-1 break-words text-base font-bold leading-snug sm:text-2xl">{formatJOD(value)}</p>
    </div>
  );
}

function ItemCard({ children }: { children: ReactNode }) {
  return <li className="card p-4 sm:p-5">{children}</li>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] font-medium">{children}</dd>
    </div>
  );
}

function StatusProgress({ status }: { status: RequestStatus }) {
  if (status === 'CANCELLED') {
    return <p className="mt-4 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">أُلغي هذا الطلب. للاستفسار تواصل معنا على واتساب.</p>;
  }
  const idx = PROGRESS.indexOf(status);
  return (
    <div className="mt-4" aria-label={`المرحلة: ${STATUS_LABEL[status]}`}>
      <ol className="flex gap-1" aria-hidden>
        {PROGRESS.map((s, i) => (
          <li key={s} className={cx('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-primary' : 'bg-subtle')} title={STATUS_LABEL[s]} />
        ))}
      </ol>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{STATUS_LABEL.NEW}</span>
        <span className="font-semibold text-ink">{STATUS_LABEL[status]}</span>
        <span>{STATUS_LABEL.COMPLETED}</span>
      </div>
    </div>
  );
}

function CardHead({ title, number, refCode, status }: { title: string; number: number; refCode?: string; status: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base sm:text-lg">
          {title} <span className="ltr text-muted">#{number}</span>
        </h3>
        {refCode && (
          <p className="text-xs text-muted">
            المرجع <span className="ltr">{refCode}</span>
          </p>
        )}
      </div>
      {status}
    </div>
  );
}

function BookingsTab({ items }: { items: OBooking[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="لا توجد حجوزات بعد"
        description="احجز كشفًا أو زيارة، وستظهر هنا حالة الحجز وعرض السعر."
        action={<ButtonLink to="/bookings">احجز موعدًا</ButtonLink>}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <ItemCard key={b.id}>
          <CardHead
            title={BOOKING_TYPE_LABEL[b.type]}
            number={b.number}
            refCode={b.ref}
            status={
              <div className="flex items-center gap-1.5">
                {b.urgency === 'EMERGENCY' && <Tag tone="danger">طارئ</Tag>}
                {b.urgency === 'URGENT' && <Tag tone="brand">عاجل</Tag>}
                <StatusBadge status={b.status} />
              </div>
            }
          />
          <dl className={cx('mt-4 grid gap-3 sm:grid-cols-3', b.status === 'CANCELLED' && 'opacity-60')}>
            <Meta label="الموعد">{formatDate(b.scheduledAt, true)}</Meta>
            <Meta label="الموقع">{b.locationText}</Meta>
            {b.quotedAmount != null ? (
              <Meta label="السعر المعروض">{formatJOD(b.quotedAmount)}</Meta>
            ) : b.inspectionFee != null ? (
              <Meta label="رسوم الكشف">{formatJOD(b.inspectionFee)}</Meta>
            ) : (
              <Meta label="السعر">بعد الزيارة</Meta>
            )}
          </dl>
          <StatusProgress status={b.status} />
        </ItemCard>
      ))}
    </ul>
  );
}

function OrdersTab({ items }: { items: OOrder[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="لا توجد طلبات من المتجر"
        description="طلبات الأثاث والمنتجات من المتجر تظهر هنا مع حالتها."
        action={<ButtonLink to="/store" variant="outline">تصفح المتجر</ButtonLink>}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((o) => (
        <ItemCard key={o.id}>
          <CardHead title="طلب متجر" number={o.number} refCode={o.code ?? o.ref} status={<DeliveryStatusTag status={o.deliveryStatus} />} />
          <div className="mt-4 overflow-hidden rounded-xl border border-line text-[15px]">
            {(o.vendorOrders?.length ? o.vendorOrders : [null]).map((vo) => (
              <div key={vo?.id ?? 'all'} className="border-b border-line last:border-b-0">
                {vo && o.vendorOrders.length > 1 && (
                  <p className="flex flex-wrap items-center justify-between gap-2 bg-subtle/60 px-3 py-2 text-sm">
                    <Link to={`/store/vendor/${vo.vendor.slug}`} className="font-semibold hover:underline">
                      {vo.vendor.name}
                    </Link>
                    <StatusBadge status={vo.status} />
                  </p>
                )}
                <ul className="divide-y divide-line">
                  {o.items
                    .filter((it) => !vo || it.vendorOrderId === vo.id)
                    .map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          {it.name} <span className="text-muted">× <span className="ltr">{it.quantity}</span></span>
                        </span>
                        <span className="shrink-0 font-medium">{formatJOD(it.lineTotal)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted">{formatDate(o.createdAt)}</span>
            <span>
              {Number(o.discountTotal) > 0 && <span className="me-3 text-muted">خصم {formatJOD(o.discountTotal)}</span>}
              الإجمالي <b className="text-base">{formatJOD(o.total)}</b>
            </span>
          </div>
          <OrderTracking id={o.id} status={o.deliveryStatus} />
        </ItemCard>
      ))}
    </ul>
  );
}

type Tracking = {
  deliveryStatus: DeliveryStatus;
  codAmount: Num;
  driver: { name: string; phone: string | null } | null;
  timeline: { status: DeliveryStatus; at: string }[];
};

/** تتبّع التوصيل: يُحمَّل عند الطلب فقط */
function OrderTracking({ id, status }: { id: string; status: DeliveryStatus }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    api
      .get<Tracking>(`/account/orders/${id}/tracking`)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, id, status]);
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
        تتبّع التوصيل
        <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !data ? (
            <p className="text-sm text-muted">جاري التحميل…</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <DeliveryTimeline status={data.deliveryStatus} timeline={data.timeline} />
              <div className="space-y-2 text-sm">
                {data.driver && (
                  <p className="rounded-xl bg-subtle px-3 py-2">
                    موظف التوصيل: <b>{data.driver.name}</b>
                    {data.driver.phone && (
                      <a href={`tel:${data.driver.phone}`} className="ms-2 underline ltr">
                        {data.driver.phone}
                      </a>
                    )}
                  </p>
                )}
                {Number(data.codAmount) > 0 && (
                  <p>
                    المطلوب عند الاستلام: <b>{formatJOD(data.codAmount)}</b>
                  </p>
                )}
                <p className="text-xs text-muted">رمز التحقق عند التسليم (إن طُلب) يصلك في الإشعارات أعلى الصفحة.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CorporateTab({ items, contracts }: { items: OCorporate[]; contracts: OContract[] }) {
  if (!items.length && !contracts.length) {
    return (
      <EmptyState
        title="لا توجد طلبات شركات أو عقود"
        description="عقود الصيانة السنوية وطلبات الصيانة العاجلة للمنشآت تظهر هنا."
        action={<ButtonLink to="/corporate" variant="outline">خدمات الشركات</ButtonLink>}
      />
    );
  }
  return (
    <div className="space-y-8">
      {contracts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg">العقود</h2>
          <ul className="space-y-3">
            {contracts.map((c) => (
              <ItemCard key={c.id}>
                <CardHead
                  title={c.title}
                  number={c.number}
                  status={<Tag tone={c.status === 'ACTIVE' ? 'brand' : c.status === 'CANCELLED' ? 'danger' : 'neutral'}>{CONTRACT_STATUS[c.status]}</Tag>}
                />
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Meta label="من">{formatDate(c.startDate)}</Meta>
                  <Meta label="إلى">{formatDate(c.endDate)}</Meta>
                  <Meta label="قيمة العقد">{formatJOD(c.value)}</Meta>
                </dl>
                {c.fileUrl && (
                  <ButtonA href={c.fileUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm" className="mt-4">
                    <Icon name="download" className="h-4 w-4" /> تحميل العقد
                  </ButtonA>
                )}
              </ItemCard>
            ))}
          </ul>
        </section>
      )}
      {items.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg">طلبات الشركات</h2>
          <ul className="space-y-3">
            {items.map((r) => (
              <ItemCard key={r.id}>
                <CardHead title={CORPORATE_TYPE_LABEL[r.type]} number={r.number} refCode={r.ref} status={<StatusBadge status={r.status} />} />
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Meta label="الشركة">{r.companyName}</Meta>
                  <Meta label="تاريخ الطلب">{formatDate(r.createdAt)}</Meta>
                  <Meta label="السعر المعروض">{r.quotedAmount != null ? formatJOD(r.quotedAmount) : 'بعد التقييم'}</Meta>
                </dl>
                {r.services.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {r.services.map((s) => (
                      <li key={s.name} className="rounded-md bg-subtle px-2 py-0.5 text-xs">
                        {s.name}
                      </li>
                    ))}
                  </ul>
                )}
                <StatusProgress status={r.status} />
              </ItemCard>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FilesTab({ items }: { items: OFile[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="لا توجد ملفات بعد"
        description="بعد الكشف نرفع هنا تقرير التقييم وعرض السعر بصيغة PDF لتحميلها في أي وقت."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((f) => {
        const linked = linkedLabel(f);
        return (
          <li key={f.id} className="card flex flex-wrap items-center gap-4 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand-100 text-sand-700 dark:bg-sand-700/25 dark:text-sand-200">
              <Icon name="file" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base">{f.title}</h3>
                <Tag tone="sand">{FILE_KIND_LABEL[f.kind] ?? 'ملف'}</Tag>
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {formatDate(f.createdAt)}
                {linked && <> · <span className="ltr">{linked}</span></>}
                {f.amount != null && <> · {formatJOD(f.amount)}</>}
              </p>
            </div>
            <ButtonA href={f.url} target="_blank" rel="noopener noreferrer" variant="outline" className="w-full sm:w-auto">
              <Icon name="download" className="h-4 w-4" /> تحميل
            </ButtonA>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentsTab({ items }: { items: OPayment[] }) {
  if (!items.length) {
    return <EmptyState title="لا توجد دفعات مسجلة" description="كل دفعة تستلمها منا تُسجَّل هنا بتاريخها وطريقتها." />;
  }
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line">
        {items.map((p) => {
          const linked = linkedLabel(p);
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="font-semibold">{formatJOD(p.amount)}</p>
                <p className="text-sm text-muted">
                  {formatDate(p.paidAt)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                  {p.reference && (
                    <>
                      {' '}· مرجع <span className="ltr">{p.reference}</span>
                    </>
                  )}
                </p>
                {p.note && <p className="mt-0.5 text-sm text-muted">{p.note}</p>}
              </div>
              {linked && <Tag>{linked}</Tag>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProfileCard({ customer }: { customer: CustomerMe }) {
  const { setCustomer } = useCustomer();
  const { toast } = useToast();
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? '');
  const [optIn, setOptIn] = useState(customer.emailOptIn);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const dirty =
    name.trim() !== customer.name || email.trim().toLowerCase() !== (customer.email ?? '') || optIn !== customer.emailOptIn;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = 'الاسم قصير جدًا';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'البريد الإلكتروني غير صالح';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      setCustomer(await api.patch<CustomerMe>('/auth/profile', { name: name.trim(), email: email.trim() || null, emailOptIn: optIn }));
      toast('تم حفظ بياناتك');
    } catch (err) {
      if (err instanceof ApiError) {
        const field = (err.field ?? Object.keys(err.fields)[0]) as 'name' | 'email' | undefined;
        setErrors(field ? { [field]: err.fields[field] ?? err.message } : { name: err.message });
      } else setErrors({ name: 'تعذر الحفظ' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-start">
      <Input label="الاسم" autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={errors.name} />
      <Input label="رقم الهاتف" value={displayPhone(customer.phone)} dir="ltr" className="text-end" disabled hint="للتعديل تواصل معنا." />
      <Input
        label="البريد الإلكتروني"
        optional
        type="email"
        dir="ltr"
        className="text-end"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <div className="sm:col-span-3">
        <Checkbox
          label="استلام أخبار المنتجات والخدمات الجديدة بالبريد"
          description={email.trim() ? undefined : 'أضف بريدك الإلكتروني حتى تصلك الرسائل.'}
          checked={optIn}
          onChange={setOptIn}
        />
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" variant="outline" loading={busy} disabled={!dirty}>
          حفظ البيانات
        </Button>
      </div>
    </form>
  );
}

function PasswordCard({ customer, prominent }: { customer: CustomerMe; prominent?: boolean }) {
  const { refresh } = useCustomer();
  const { toast } = useToast();
  const [open, setOpen] = useState(Boolean(prominent));
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const e1 = pw.length < 8 ? 'كلمة المرور 8 أحرف على الأقل' : pw.length > 100 ? 'كلمة المرور طويلة جدًا' : undefined;
  const e2 = pw2 !== pw ? 'كلمتا المرور غير متطابقتين' : undefined;
  const e0 = customer.hasPassword && !current ? 'أدخل كلمة المرور الحالية' : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerErr(null);
    if (e0 || e1 || e2) return;
    setBusy(true);
    try {
      await api.post('/auth/customer/password', { password: pw, ...(customer.hasPassword ? { current } : {}) });
      toast(customer.hasPassword ? 'تم تغيير كلمة المرور' : 'تم حفظ كلمة المرور');
      setCurrent('');
      setPw('');
      setPw2('');
      setTouched(false);
      setOpen(false);
      await refresh();
    } catch (err) {
      setServerErr(err instanceof ApiError ? err.fields.password ?? err.fields.current ?? err.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-[44px] text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
        تغيير كلمة المرور
      </button>
    );
  }

  return (
    <section className={cx('mb-8 rounded-2xl border p-5', prominent ? 'border-sand-300 bg-sand-50 dark:border-sand-700 dark:bg-sand-700/10' : 'border-line bg-surface')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{customer.hasPassword ? 'تغيير كلمة المرور' : 'عيّن كلمة مرور'}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {customer.hasPassword
              ? 'ستحتاجها للدخول مع رقم هاتفك.'
              : 'حتى تدخل لاحقًا برقم هاتفك أو بريدك وكلمة المرور.'}
          </p>
        </div>
        {prominent && (
          <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle" aria-label="إخفاء">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>
      <form
        noValidate
        onSubmit={submit}
        className={cx('mt-4 grid gap-3 sm:items-start', customer.hasPassword ? 'sm:grid-cols-[1fr_1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]')}
      >
        {customer.hasPassword && (
          <Input
            label="كلمة المرور الحالية"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={touched ? e0 : undefined}
          />
        )}
        <Input label="كلمة المرور الجديدة" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onBlur={() => pw && setTouched(true)} error={touched ? e1 : undefined} />
        <Input label="تأكيد كلمة المرور" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={touched ? e2 : undefined} />
        <Button type="submit" loading={busy} className="h-[50px] sm:mt-[1.875rem]">
          حفظ
        </Button>
      </form>
      {serverErr && (
        <Alert tone="error" className="mt-3">
          {serverErr}
        </Alert>
      )}
      {!prominent && (
        <button type="button" onClick={() => setOpen(false)} className="mt-2 min-h-[44px] text-sm text-muted hover:text-ink">
          إلغاء
        </button>
      )}
    </section>
  );
}
