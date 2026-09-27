import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { FileUploadForm } from '../../components/admin/FileUploadForm';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { CONTRACT_STATUS_LABEL } from '../../components/admin/labels';
import { PaymentForm } from '../../components/admin/PaymentForm';
import { FilesList, PaymentsList } from '../../components/admin/RecordLists';
import type { CustomerDetail as Customer } from '../../components/admin/types';
import { AdminPage, DetailSkeleton, Panel } from '../../components/admin/ui';
import { GrantDialog } from './Vendors';
import { Button, ButtonA, ButtonLink, ErrorState, Icon, Input, StatusBadge, Tag, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { BOOKING_TYPE_LABEL, CORPORATE_TYPE_LABEL, cx, displayPhone, formatDate, formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

type Tab = 'bookings' | 'orders' | 'corporate' | 'contracts' | 'files' | 'payments';

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<Customer>(`/admin/customers/${id}`), [id]);
  const [tab, setTab] = useState<Tab>('bookings');
  const [addPay, setAddPay] = useState(false);
  const c = q.data;
  useDocumentTitle(c?.name ?? 'عميل');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !c)
    return (
      <AdminPage title="العميل" back={{ to: '/admin/customers', label: 'العملاء' }}>
        <ErrorState message={q.error?.message ?? 'العميل غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const tabs: [Tab, string, number][] = [
    ['bookings', 'الحجوزات', c.bookings.length],
    ['orders', 'طلبات المتجر', c.orders.length],
    ['corporate', 'طلبات الشركات', c.corporateRequests.length],
    ['contracts', 'العقود', c.contracts.length],
    ['files', 'الملفات', c.quoteFiles.length],
    ['payments', 'الدفعات', c.payments.length],
  ];

  return (
    <AdminPage
      back={{ to: '/admin/customers', label: 'العملاء' }}
      title={c.name}
      meta={
        <>
          <span className="ltr text-sm text-muted">{displayPhone(c.phone)}</span>
          {c.companyName && <Tag tone="sand">{c.companyName}</Tag>}
          <span className="text-xs text-muted">
            عميل منذ {formatDate(c.createdAt)}
            {c.lastLoginAt && <> · آخر دخول {formatDate(c.lastLoginAt)}</>}
          </span>
        </>
      }
      actions={
        <>
          <ButtonA href={`tel:+${c.phone}`} variant="outline" size="sm">
            <Icon name="phone" className="h-4 w-4" /> اتصال
          </ButtonA>
          <ButtonA href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm">
            <Icon name="whatsapp" className="h-4 w-4" /> واتساب
          </ButtonA>
        </>
      }
    >
      <div className="mb-6 grid grid-cols-3 gap-3">
        {(
          [
            ['المطلوب', c.finance.billed, ''],
            ['المدفوع', c.finance.paid, 'text-success'],
            ['المتبقي', c.finance.remaining, c.finance.remaining > 0.0005 ? 'text-warn' : ''],
          ] as const
        ).map(([k, v, cls]) => (
          <div key={k} className="card px-4 py-3">
            <p className="text-xs text-muted">{k}</p>
            <p className={cx('mt-0.5 text-lg font-bold tabular-nums sm:text-xl', cls)}>{formatJOD(v)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {tabs.map(([k, l, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cx(
                  '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm',
                  tab === k ? 'border-brand-600 font-semibold text-ink' : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {l} <span className="text-xs tabular-nums text-muted">({n})</span>
              </button>
            ))}
          </div>

          <div className="card p-4 sm:p-5">
            {tab === 'bookings' && (
              <HistoryList
                empty="لا توجد حجوزات"
                items={c.bookings.map((b) => ({
                  id: b.id,
                  to: `/admin/bookings/${b.id}`,
                  title: (
                    <>
                      حجز #{b.number} · {BOOKING_TYPE_LABEL[b.type]}
                    </>
                  ),
                  sub: `${formatDate(b.scheduledAt, true)} · ${b.locationText}`,
                  end: (
                    <>
                      {b.quotedAmount != null && <span className="text-sm tabular-nums">{formatJOD(b.quotedAmount)}</span>}
                      <StatusBadge status={b.status} />
                    </>
                  ),
                }))}
              />
            )}
            {tab === 'orders' && (
              <HistoryList
                empty="لا توجد طلبات"
                items={c.orders.map((o) => ({
                  id: o.id,
                  to: `/admin/orders/${o.id}`,
                  title: <>طلب #{o.number}</>,
                  sub: `${formatDate(o.createdAt)} · ${o.items.map((i) => `${i.name} × ${i.quantity}`).join('، ')}`,
                  end: (
                    <>
                      <span className="text-sm font-semibold tabular-nums">{formatJOD(o.total)}</span>
                      <StatusBadge status={o.status} />
                    </>
                  ),
                }))}
              />
            )}
            {tab === 'corporate' && (
              <HistoryList
                empty="لا توجد طلبات شركات"
                items={c.corporateRequests.map((r) => ({
                  id: r.id,
                  to: `/admin/corporate/${r.id}`,
                  title: (
                    <>
                      {r.companyName} · {CORPORATE_TYPE_LABEL[r.type]}
                    </>
                  ),
                  sub: `${formatDate(r.createdAt)} · ${r.services.map((s) => s.name).join('، ')}`,
                  end: <StatusBadge status={r.status} />,
                }))}
              />
            )}
            {tab === 'contracts' && (
              <HistoryList
                empty="لا توجد عقود"
                items={c.contracts.map((k) => ({
                  id: k.id,
                  to: k.corporateRequestId ? `/admin/corporate/${k.corporateRequestId}` : '/admin/contracts',
                  title: (
                    <>
                      {k.title} · #{k.number}
                    </>
                  ),
                  sub: `${formatDate(k.startDate)} — ${formatDate(k.endDate)}`,
                  end: (
                    <>
                      <span className="text-sm tabular-nums">{formatJOD(k.value)}</span>
                      <Tag tone={k.status === 'ACTIVE' ? 'brand' : 'neutral'}>{CONTRACT_STATUS_LABEL[k.status]}</Tag>
                    </>
                  ),
                }))}
              />
            )}
            {tab === 'files' && (
              <div className="space-y-5">
                <FilesList files={c.quoteFiles} onDeleted={() => q.reload()} />
                <div className="border-t border-line pt-4">
                  <h3 className="mb-3 text-sm font-semibold">رفع ملف للعميل</h3>
                  <FileUploadForm target={{ customerId: c.id }} defaultKind="OTHER" onUploaded={() => q.reload()} />
                </div>
              </div>
            )}
            {tab === 'payments' && (
              <div className="space-y-4">
                {addPay ? (
                  <div className="rounded-xl border border-line bg-subtle/40 p-4">
                    <PaymentForm
                      customerId={c.id}
                      onCancel={() => setAddPay(false)}
                      onSaved={() => {
                        setAddPay(false);
                        q.reload();
                      }}
                    />
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setAddPay(true)}>
                    <Icon name="plus" className="h-4 w-4" /> إضافة دفعة
                  </Button>
                )}
                <PaymentsList payments={c.payments} onDeleted={() => q.reload()} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <EditPanel key={c.id + (c.notes ?? '') + c.name} customer={c} onSaved={q.reload} />
          <VendorPanel customer={c} onChanged={q.reload} />
        </div>
      </div>
    </AdminPage>
  );
}

function HistoryList({
  items,
  empty,
}: {
  items: { id: string; to: string; title: ReactNode; sub: string; end: ReactNode }[];
  empty: string;
}) {
  if (!items.length) return <p className="py-4 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="-my-2 divide-y divide-line">
      {items.map((it) => (
        <li key={it.id}>
          <Link to={it.to} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:text-brand-700 dark:hover:text-brand-200">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{it.title}</p>
              <p className="line-clamp-1 text-xs text-muted">{it.sub}</p>
            </div>
            <div className="flex items-center gap-2">{it.end}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EditPanel({ customer: c, onSaved }: { customer: Customer; onSaved: () => void }) {
  const m = useMutation();
  const [name, setName] = useState(c.name);
  const [email, setEmail] = useState(c.email ?? '');
  const [company, setCompany] = useState(c.companyName ?? '');
  const [notes, setNotes] = useState(c.notes ?? '');
  const [confirmReset, setConfirmReset] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await m.run(
      'save',
      () =>
        api.patch(`/admin/customers/${c.id}`, {
          name: name.trim(),
          email: email.trim() || null,
          companyName: company.trim() || null,
          notes: notes.trim() || null,
        }),
      'تم حفظ بيانات العميل',
    );
    if (r) onSaved();
  };

  const reset = async () => {
    const r = await m.run('reset', () => api.patch(`/admin/customers/${c.id}`, { tempPassword }), 'تم تعيين كلمة المرور المؤقتة');
    setConfirmReset(false);
    if (r) {
      setTempPassword('');
      onSaved();
    }
  };

  return (
    <>
      <Panel title="بيانات العميل">
        <form onSubmit={save} className="space-y-3" noValidate>
          <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} error={m.fieldErrors.name} />
          <Input label="البريد الإلكتروني" optional type="email" dir="ltr" className="text-start" value={email} onChange={(e) => setEmail(e.target.value)} error={m.fieldErrors.email} />
          <Input label="اسم الشركة" optional value={company} onChange={(e) => setCompany(e.target.value)} error={m.fieldErrors.companyName} />
          <Textarea label="ملاحظات داخلية" optional rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} error={m.fieldErrors.notes} />
          <Button type="submit" size="sm" loading={m.pending === 'save'}>
            حفظ
          </Button>
        </form>
      </Panel>
      <Panel title="كلمة المرور">
        <p className="mb-3 text-sm text-muted">
          إذا نسي العميل كلمة المرور ولا يملك بريدًا في حسابه، عيّن له كلمة مرور مؤقتة وأرسلها له، ثم يغيّرها من حسابه.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="كلمة مرور مؤقتة"
            dir="ltr"
            className="text-start"
            wrapperClassName="min-w-0 flex-1"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            error={m.fieldErrors.tempPassword}
            hint="8 أحرف على الأقل"
          />
          <Button size="sm" variant="outline" className="mb-7 h-[50px]" disabled={tempPassword.length < 8} onClick={() => setConfirmReset(true)}>
            تعيين
          </Button>
        </div>
      </Panel>
      <ConfirmDialog
        open={confirmReset}
        title="إعادة تعيين كلمة المرور"
        confirmLabel="إعادة التعيين"
        tone="primary"
        loading={m.pending === 'reset'}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
      >
        ستُستبدل كلمة مرور {c.name} بالكلمة المؤقتة، وتنتهي جلساته الحالية. أرسلها له بطريقة آمنة (اتصال أو واتساب).
      </ConfirmDialog>
    </>
  );
}

/** صلاحية المورد لهذا العميل */
function VendorPanel({ customer: c, onChanged }: { customer: Customer; onChanged: () => void }) {
  const [granting, setGranting] = useState(false);
  return (
    <Panel title="صلاحية المورد">
      {c.vendor ? (
        <div className="space-y-2 text-sm">
          <p>
            متجر <Link to={`/admin/vendors/${c.vendor.id}`} className="font-semibold hover:underline">{c.vendor.name}</Link>
            {c.vendor.active ? ` · عمولة ${c.vendor.commissionPercent}%` : ' · الصلاحية مسحوبة'}
          </p>
          <ButtonLink to={`/admin/vendors/${c.vendor.id}`} size="sm" variant="outline">
            إدارة المورد
          </ButtonLink>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">امنح العميل صلاحية مورد ليضيف منتجاته ويبيعها في السوق.</p>
          <Button size="sm" variant="outline" onClick={() => setGranting(true)}>
            منح صلاحية مورد
          </Button>
          <GrantDialog open={granting} onClose={() => setGranting(false)} onGranted={onChanged} customer={c} />
        </>
      )}
    </Panel>
  );
}
