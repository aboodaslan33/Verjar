import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { defaultRewards, RewardPicker, rewardsPayload, type RewardDraft } from '../../../components/admin/insights/RewardForm';
import { useAdminQuery, useMutation } from '../../../components/admin/hooks';
import { AdminPage, DetailSkeleton, Panel } from '../../../components/admin/ui';
import { Alert, Button, Checkbox, ErrorState, Icon, Input, Modal, Tag } from '../../../components/ui';
import { api } from '../../../lib/api';
import { cx, displayPhone, formatDate, formatJOD } from '../../../lib/format';
import { currentPeriodKey, REWARD_STATUS_LABEL, REWARD_TYPE_LABEL } from '../../../lib/insights';
import { useDocumentTitle } from '../../../lib/useAsync';
import { MonthPicker } from './Performance';

type SupplierCand = {
  id: string;
  name: string;
  city: string | null;
  verified: boolean;
  plan: string | null;
  sales: number;
  orders: number;
  customers: number;
  completionRate: number | null;
  cancelRate: number | null;
  rating: number | null;
  ratingCount: number;
  prepHours: number | null;
  score: number;
};
type CustomerCand = { id: string; name: string; companyName: string | null; phone: string; spend: number; orders: number; activeDays90: number; maintenance: number; paymentRate: number | null; lastLoginAt: string | null; score: number };
export type RewardRow = { id: string; type: string; title: string; status: string; startsAt: string; endsAt: string | null; coupon?: { code: string; usedCount: number; usageLimit: number | null; endsAt: string | null } | null };
type Chosen = {
  id: string;
  kind: 'SUPPLIER' | 'CUSTOMER';
  title: string;
  note: string | null;
  createdAt: string;
  revokedAt: string | null;
  vendor: { id: string; name: string; slug: string } | null;
  customer: { id: string; name: string; companyName: string | null; phone: string } | null;
  rewards: RewardRow[];
};
type Data = { period: string; label: string; suppliers: SupplierCand[]; customers: CustomerCand[]; chosen: Chosen[] };
type Target = { kind: 'SUPPLIER' | 'CUSTOMER'; id: string; name: string; score?: unknown };

const pct = (v: number | null) => (v == null ? '—' : <span dir="ltr">{v}%</span>);

/** المورد والعميل المتميز: اقتراحات من البيانات، والاختيار والمكافأة بقرار الـ Super Admin */
export default function Recognition() {
  useDocumentTitle('التميز الشهري');
  const now = currentPeriodKey();
  const [params, setParams] = useSearchParams();
  const period = params.get('period') ?? now;
  const q = useAdminQuery(() => api.get<Data>('/admin/insights/recognition', { period }), [period], { keep: true });
  const plans = useAdminQuery(() => api.get<{ id: string; name: string; price: number }[]>('/admin/market/plans'), []);
  const [target, setTarget] = useState<Target | null>(null);
  const m = useMutation();
  if (q.loading && !q.data) return <DetailSkeleton />;
  if (q.error && !q.data) return <ErrorState message={q.error.message} onRetry={q.retry} />;
  const d = q.data!;
  const chosen = (k: 'SUPPLIER' | 'CUSTOMER') => d.chosen.find((c) => c.kind === k && !c.revokedAt);

  return (
    <AdminPage
      title="التميز الشهري"
      description="Supplier / Customer of the Month — النظام يقترح الأفضل من بيانات الشهر الفعلية، وأنت تختار وتحدد المكافأة. لا يُمنح شيء تلقائيًا."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthPicker label="الشهر" value={period} max={now} onChange={(v) => setParams({ period: v }, { replace: true })} />
          <Link to="/admin/insights/archive" className="text-sm font-semibold text-muted underline hover:text-ink">
            الأرشيف
          </Link>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-2">
        {/* مورد الشهر */}
        <section className="space-y-4" aria-labelledby="sup-title">
          <h2 id="sup-title" className="flex items-center gap-2 text-lg">
            <Icon name="star" className="h-5 w-5 text-primary" /> مورد {d.label}
          </h2>
          {chosen('SUPPLIER') ? (
            <ChosenCard rec={chosen('SUPPLIER')!} onChanged={q.retry} />
          ) : (
            <Panel title="الموردون المقترحون" bodyClassName="p-0 sm:p-0">
              {d.suppliers.length === 0 ? (
                <p className="p-4 text-sm text-muted sm:p-5">لا توجد مبيعات أو صفقات للموردين في هذا الشهر.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.suppliers.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', i === 0 ? 'bg-primary text-primary-fg' : 'bg-subtle')}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          <Link to={`/admin/market/suppliers/${s.id}`} className="hover:underline">
                            {s.name}
                          </Link>{' '}
                          {s.plan && <span className="text-xs text-muted">· {s.plan}</span>}
                        </p>
                        <p className="text-xs text-muted">
                          مبيعات <b className="text-ink">{formatJOD(s.sales)}</b> · {s.orders} طلب · {s.customers} عميل · إتمام {pct(s.completionRate)} · إلغاء {pct(s.cancelRate)} · تقييم{' '}
                          {s.rating ?? '—'}
                          {s.ratingCount ? ` (${s.ratingCount})` : ''} · تجهيز {s.prepHours != null ? `${s.prepHours} س` : '—'}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums" title="نتيجة الترشيح من 100">
                        {s.score}/100
                      </span>
                      <Button size="sm" variant={i === 0 ? 'primary' : 'outline'} onClick={() => setTarget({ kind: 'SUPPLIER', id: s.id, name: s.name, score: s })}>
                        اختيار
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {!chosen('SUPPLIER') && <ManualPick kind="SUPPLIER" onPick={setTarget} />}
        </section>

        {/* عميل الشهر */}
        <section className="space-y-4" aria-labelledby="cus-title">
          <h2 id="cus-title" className="flex items-center gap-2 text-lg">
            <Icon name="star" className="h-5 w-5 text-primary" /> عميل {d.label}
          </h2>
          {chosen('CUSTOMER') ? (
            <ChosenCard rec={chosen('CUSTOMER')!} onChanged={q.retry} />
          ) : (
            <Panel title="العملاء المقترحون" bodyClassName="p-0 sm:p-0">
              {d.customers.length === 0 ? (
                <p className="p-4 text-sm text-muted sm:p-5">لا توجد مشتريات في هذا الشهر.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.customers.map((c, i) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', i === 0 ? 'bg-primary text-primary-fg' : 'bg-subtle')}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          <Link to={`/admin/customers/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>{' '}
                          {c.companyName && <span className="text-xs text-muted">· {c.companyName}</span>}
                        </p>
                        <p className="text-xs text-muted">
                          مشتريات <b className="text-ink">{formatJOD(c.spend)}</b> · {c.orders} طلب · نشاط {c.activeDays90} يوم/90 · صيانة {c.maintenance} · التزام بالدفع {pct(c.paymentRate)}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{c.score}/100</span>
                      <Button size="sm" variant={i === 0 ? 'primary' : 'outline'} onClick={() => setTarget({ kind: 'CUSTOMER', id: c.id, name: c.name, score: c })}>
                        اختيار
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {!chosen('CUSTOMER') && <ManualPick kind="CUSTOMER" onPick={setTarget} />}
        </section>
      </div>

      <p className="mt-6 text-xs text-muted">
        طريقة الترشيح — الموردون: المبيعات 35% · عدد الطلبات 15% · عدد العملاء 10% · معدل الإتمام 15% · التقييم 10% · سرعة التجهيز 8% · الالتزام (قلة الإلغاء) 7%. العملاء: المشتريات 40% · عدد الطلبات 15% · تكرار النشاط 15% · استخدام الصيانة 10% · الالتزام بالدفع 15% · نشاط الحساب 5%.
      </p>

      {target && (
        <SelectDialog
          target={target}
          period={period}
          periodLabel={d.label}
          plans={plans.data ?? []}
          onClose={() => setTarget(null)}
          onDone={() => (setTarget(null), q.retry())}
        />
      )}
      {m.error && <Alert tone="error">{m.error}</Alert>}
    </AdminPage>
  );
}

function ManualPick({ kind, onPick }: { kind: 'SUPPLIER' | 'CUSTOMER'; onPick: (t: Target) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; name: string; phone?: string; city?: string | null; companyName?: string | null }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setRows([]);
    const t = setTimeout(() => {
      api.get<typeof rows>('/admin/insights/targets', { kind, q }).then(setRows).catch(() => setRows([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind]);
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold">اختيار {kind === 'SUPPLIER' ? 'مورد' : 'عميل'} آخر يدويًا</summary>
      <Input label="" aria-label="بحث" className="mt-3" placeholder={kind === 'SUPPLIER' ? 'اسم المورد…' : 'الاسم أو الهاتف أو الشركة…'} value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="w-full px-3 py-2 text-start hover:bg-subtle" onClick={() => onPick({ kind, id: r.id, name: r.name })}>
                {r.name} <span className="text-xs text-muted">{r.companyName ?? r.city ?? ''} {r.phone ? displayPhone(r.phone) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function SelectDialog({ target, period, periodLabel, plans, onClose, onDone }: { target: Target; period: string; periodLabel: string; plans: { id: string; name: string; price: number }[]; onClose: () => void; onDone: () => void }) {
  const m = useMutation();
  const [title, setTitle] = useState(target.kind === 'SUPPLIER' ? 'مورد الشهر' : 'عميل الشهر');
  const [note, setNote] = useState('');
  const [rewards, setRewards] = useState<RewardDraft[]>(() => defaultRewards(target.kind));
  const submit = async () => {
    const body = {
      kind: target.kind,
      period,
      vendorId: target.kind === 'SUPPLIER' ? target.id : null,
      customerId: target.kind === 'CUSTOMER' ? target.id : null,
      title,
      note: note.trim() || null,
      score: target.score ?? null,
      rewards: rewardsPayload(rewards),
    };
    if (await m.run('save', () => api.post('/admin/insights/recognition', body), 'تم اختيار التميز ومنح المكافآت')) onDone();
  };
  const count = rewards.filter((r) => r.on).length;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${target.kind === 'SUPPLIER' ? 'مورد' : 'عميل'} ${periodLabel}: ${target.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={m.pending === 'save'} onClick={submit}>
            تأكيد الاختيار {count > 0 ? `ومنح ${count} مكافأة` : 'بدون مكافأة'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="اللقب" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="ملاحظة داخلية" optional value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <p className="label">المكافآت (اختر ما تريد منحه)</p>
          <RewardPicker value={rewards} onChange={setRewards} plans={plans} />
        </div>
        <p className="text-xs text-muted">
          يصل {target.kind === 'SUPPLIER' ? 'المورد' : 'العميل'} إشعار وبريد بكل مكافأة. {target.kind === 'CUSTOMER' && 'الكوبون خاص بهذا العميل ولا يعمل لغيره.'}
        </p>
        {m.error && !Object.keys(m.fieldErrors).length && <Alert tone="error">{m.error}</Alert>}
        {Object.keys(m.fieldErrors).length > 0 && <Alert tone="error">{Object.values(m.fieldErrors).join(' · ')}</Alert>}
      </div>
    </Modal>
  );
}

export function RewardList({ rewards, onChanged }: { rewards: RewardRow[]; onChanged: () => void }) {
  const m = useMutation();
  if (!rewards.length) return <p className="text-sm text-muted">بدون مكافآت.</p>;
  return (
    <ul className="divide-y divide-line">
      {rewards.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0 text-sm">
            <b>{r.title}</b> <span className="text-xs text-muted">· {REWARD_TYPE_LABEL[r.type] ?? r.type}</span>
            {r.coupon && (
              <span className="ms-1 text-xs">
                · كود <span className="ltr font-semibold">{r.coupon.code}</span> ({r.coupon.usedCount}/{r.coupon.usageLimit ?? '∞'})
              </span>
            )}
            <span className="block text-xs text-muted">
              {formatDate(r.startsAt)}
              {r.endsAt && <> ← {formatDate(r.endsAt)}</>}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <Tag tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{REWARD_STATUS_LABEL[r.status] ?? r.status}</Tag>
            {r.status === 'ACTIVE' && (
              <Button size="sm" variant="ghost" className="text-danger" loading={m.pending === r.id} onClick={async () => (await m.run(r.id, () => api.post(`/admin/insights/rewards/${r.id}/revoke`), 'أُلغيت المكافأة')) && onChanged()}>
                إلغاء
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChosenCard({ rec, onChanged }: { rec: Chosen; onChanged: () => void }) {
  const m = useMutation();
  const [confirm, setConfirm] = useState(false);
  const [alsoRewards, setAlsoRewards] = useState(false);
  const who = rec.vendor ?? rec.customer;
  return (
    <div className="card border-primary p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Tag tone="brand">{rec.title}</Tag>
          <p className="mt-2 text-xl font-bold">
            <Link to={rec.vendor ? `/admin/market/suppliers/${rec.vendor.id}` : `/admin/customers/${rec.customer!.id}`} className="hover:underline">
              {who?.name}
            </Link>
          </p>
          <p className="text-xs text-muted">اختير {formatDate(rec.createdAt)}{rec.note && ` · ${rec.note}`}</p>
        </div>
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}>
          إلغاء الاختيار
        </Button>
      </div>
      <div className="mt-3">
        <RewardList rewards={rec.rewards} onChanged={onChanged} />
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="إلغاء اختيار التميز؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              رجوع
            </Button>
            <Button
              variant="danger"
              loading={m.pending === 'revoke'}
              onClick={async () => {
                if (await m.run('revoke', () => api.post(`/admin/insights/recognition/${rec.id}/revoke`, { revokeRewards: alsoRewards }), 'أُلغي الاختيار')) {
                  setConfirm(false);
                  onChanged();
                }
              }}
            >
              إلغاء الاختيار
            </Button>
          </>
        }
      >
        <p className="text-sm">يبقى السجل في الأرشيف كاختيار ملغى، ويمكنك اختيار غيره لنفس الشهر.</p>
        <div className="mt-3">
          <Checkbox label="إلغاء مكافآته الفعّالة أيضًا" checked={alsoRewards} onChange={setAlsoRewards} />
        </div>
      </Modal>
    </div>
  );
}
