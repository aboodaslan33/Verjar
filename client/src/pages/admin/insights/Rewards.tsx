import { useState } from 'react';
import { Link } from 'react-router-dom';
import { couponPayload, CouponFields, emptyCoupon, type CouponDraft } from '../../../components/admin/insights/RewardForm';
import { useAdminQuery, useMutation } from '../../../components/admin/hooks';
import { AdminPage, Panel } from '../../../components/admin/ui';
import { Alert, Button, ErrorState, Icon, Input, Modal, SkeletonRows, Tag } from '../../../components/ui';
import { api } from '../../../lib/api';
import { formatDate, formatJOD } from '../../../lib/format';
import { periodLabel, REWARD_STATUS_LABEL, REWARD_TYPE_LABEL } from '../../../lib/insights';
import { useDocumentTitle } from '../../../lib/useAsync';

type Coupon = {
  id: string;
  code: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount: number | null;
  minOrder: number | null;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  usedCount: number;
  active: boolean;
  categoryIds: string[];
  productIds: string[];
  customer: { id: string; name: string; phone: string } | null;
  totalDiscount: number;
};
type Reward = {
  id: string;
  type: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  vendor: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  coupon: { code: string; usedCount: number; usageLimit: number | null } | null;
  recognition: { period: string; title: string } | null;
};
type Tier = { id: string; audience: 'CUSTOMER' | 'SUPPLIER'; code: string; name: string; rank: number; minPoints: number; minSpend: number | null; active: boolean };

/** المكافآت والكوبونات ومستويات الولاء */
export default function Rewards() {
  useDocumentTitle('المكافآت والكوبونات');
  const coupons = useAdminQuery(() => api.get<Coupon[]>('/admin/insights/coupons'), []);
  const rewards = useAdminQuery(() => api.get<Reward[]>('/admin/insights/rewards'), []);
  const loyalty = useAdminQuery(() => api.get<{ tiers: Tier[]; counts: Record<string, Record<string, number>> }>('/admin/insights/loyalty'), []);
  const m = useMutation();
  const [creating, setCreating] = useState(false);
  const now = Date.now();
  const status = (c: Coupon) =>
    !c.active ? ['معطّل', 'neutral'] : c.endsAt && new Date(c.endsAt).getTime() < now ? ['منتهي', 'neutral'] : c.usageLimit != null && c.usedCount >= c.usageLimit ? ['مستخدم بالكامل', 'neutral'] : ['فعّال', 'success'];

  return (
    <AdminPage
      title="المكافآت والكوبونات"
      description="كوبونات الخصم (عامة أو لعميل محدد)، سجل كل المكافآت الممنوحة، ومستويات برنامج الولاء للمرحلة القادمة."
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" /> كوبون جديد
        </Button>
      }
    >
      <Panel title="الكوبونات" bodyClassName="p-0 sm:p-0">
        {coupons.loading ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : coupons.error ? (
          <ErrorState message={coupons.error.message} onRetry={coupons.retry} />
        ) : !coupons.data?.length ? (
          <p className="p-4 text-sm text-muted sm:p-5">لا توجد كوبونات بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {coupons.data.map((c) => {
              const [label, tone] = status(c);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="ltr me-2 font-bold">{c.code}</span>
                    <span className="text-sm">{c.name}</span>
                    <span className="block text-xs text-muted">
                      {c.type === 'PERCENT' ? `${c.value}%${c.maxDiscount ? ` (حد ${formatJOD(c.maxDiscount)})` : ''}` : formatJOD(c.value)}
                      {c.minOrder ? ` · حد أدنى ${formatJOD(c.minOrder)}` : ''} · {formatDate(c.startsAt)}
                      {c.endsAt && <> ← {formatDate(c.endsAt)}</>} · {c.categoryIds.length || c.productIds.length ? `${c.categoryIds.length} فئة / ${c.productIds.length} منتج` : 'كل المنتجات'}
                      {c.customer && (
                        <>
                          {' '}
                          · لـ{' '}
                          <Link to={`/admin/customers/${c.customer.id}`} className="underline">
                            {c.customer.name}
                          </Link>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums text-muted">
                      استُخدم {c.usedCount}/{c.usageLimit ?? '∞'} · خصم {formatJOD(c.totalDiscount)}
                    </span>
                    <Tag tone={tone as 'success' | 'neutral'}>{label}</Tag>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={m.pending === c.id}
                      onClick={async () => (await m.run(c.id, () => api.patch(`/admin/insights/coupons/${c.id}`, { active: !c.active }), c.active ? 'عُطّل الكوبون' : 'فُعّل الكوبون')) && coupons.retry()}
                    >
                      {c.active ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="سجل المكافآت" className="mt-6" bodyClassName="p-0 sm:p-0">
        {rewards.loading ? (
          <div className="p-4">
            <SkeletonRows rows={3} />
          </div>
        ) : !rewards.data?.length ? (
          <p className="p-4 text-sm text-muted sm:p-5">
            لا توجد مكافآت بعد. تُمنح من{' '}
            <Link to="/admin/insights/recognition" className="underline">
              التميز الشهري
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rewards.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <span className="min-w-0 text-sm">
                  <b>{r.title}</b> <span className="text-xs text-muted">· {REWARD_TYPE_LABEL[r.type] ?? r.type}</span>
                  <span className="block text-xs text-muted">
                    {r.vendor ? (
                      <Link to={`/admin/market/suppliers/${r.vendor.id}`} className="underline">
                        {r.vendor.name}
                      </Link>
                    ) : r.customer ? (
                      <Link to={`/admin/customers/${r.customer.id}`} className="underline">
                        {r.customer.name}
                      </Link>
                    ) : null}
                    {r.recognition && <> · {r.recognition.title} {periodLabel(r.recognition.period)}</>} · {formatDate(r.createdAt)}
                    {r.endsAt && <> ← {formatDate(r.endsAt)}</>}
                    {r.coupon && (
                      <>
                        {' '}
                        · كود <span className="ltr">{r.coupon.code}</span> ({r.coupon.usedCount}/{r.coupon.usageLimit ?? '∞'})
                      </>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Tag tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{REWARD_STATUS_LABEL[r.status] ?? r.status}</Tag>
                  {r.status === 'ACTIVE' && (
                    <Button size="sm" variant="ghost" className="text-danger" loading={m.pending === r.id} onClick={async () => (await m.run(r.id, () => api.post(`/admin/insights/rewards/${r.id}/revoke`), 'أُلغيت المكافأة')) && rewards.retry()}>
                      إلغاء
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {loyalty.data && <LoyaltyPanel tiers={loyalty.data.tiers} counts={loyalty.data.counts} onSaved={loyalty.retry} />}

      {creating && <CouponDialog onClose={() => setCreating(false)} onDone={() => (setCreating(false), coupons.retry())} />}
    </AdminPage>
  );
}

function CouponDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const m = useMutation();
  const [c, setC] = useState<CouponDraft>(() => ({ ...emptyCoupon('SAVE'), name: '', usageLimit: '100' }));
  const submit = async () => {
    if (await m.run('save', () => api.post('/admin/insights/coupons', couponPayload(c)), 'تم إنشاء الكوبون')) onDone();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="كوبون جديد"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={m.pending === 'save'} onClick={submit}>
            إنشاء الكوبون
          </Button>
        </>
      }
    >
      <CouponFields value={c} onChange={setC} errors={m.fieldErrors} />
      <p className="mt-3 text-xs text-muted">كوبون عام لكل العملاء. كوبون عميل محدد يُنشأ من "التميز الشهري" كمكافأة ويصله إشعار.</p>
      {m.error && !Object.keys(m.fieldErrors).length && (
        <Alert tone="error" className="mt-3">
          {m.error}
        </Alert>
      )}
    </Modal>
  );
}

function LoyaltyPanel({ tiers, counts, onSaved }: { tiers: Tier[]; counts: Record<string, Record<string, number>>; onSaved: () => void }) {
  const m = useMutation();
  const [edit, setEdit] = useState<Record<string, { minPoints: string; minSpend: string }>>({});
  const groups: ['CUSTOMER' | 'SUPPLIER', string][] = [
    ['CUSTOMER', 'العملاء: Regular → Silver → Gold → VIP'],
    ['SUPPLIER', 'الموردون: Standard → Verified → Premium → Featured'],
  ];
  return (
    <Panel title="برنامج الولاء (المرحلة القادمة)" className="mt-6">
      <Alert tone="info" className="mb-4">
        المستويات والنقاط جاهزة في قاعدة البيانات وغير مفعّلة الآن — المرحلة الأولى هي التميز الشهري. يمكنك ضبط حدود كل مستوى مسبقًا، وتُسجَّل نقاط المكافآت في سجل النقاط.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map(([aud, title]) => (
          <div key={aud}>
            <p className="mb-2 text-sm font-semibold">{title}</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {tiers
                .filter((t) => t.audience === aud)
                .map((t) => {
                  const e = edit[t.id] ?? { minPoints: String(t.minPoints), minSpend: t.minSpend != null ? String(t.minSpend) : '' };
                  const dirty = e.minPoints !== String(t.minPoints) || e.minSpend !== (t.minSpend != null ? String(t.minSpend) : '');
                  return (
                    <li key={t.id} className="flex flex-wrap items-end gap-2 px-3 py-2.5">
                      <span className="w-24 shrink-0">
                        <b>{t.name}</b>
                        <span className="block text-xs text-muted">{counts[aud]?.[t.code] ?? 0} حاليًا</span>
                      </span>
                      <Input label="نقاط" type="number" className="ltr w-24 text-start" value={e.minPoints} onChange={(ev) => setEdit((x) => ({ ...x, [t.id]: { ...e, minPoints: ev.target.value } }))} />
                      <Input label="إنفاق/مبيعات (د.أ)" type="number" className="ltr w-32 text-start" value={e.minSpend} onChange={(ev) => setEdit((x) => ({ ...x, [t.id]: { ...e, minSpend: ev.target.value } }))} />
                      {dirty && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={m.pending === t.id}
                          onClick={async () =>
                            (await m.run(t.id, () => api.patch(`/admin/insights/loyalty/${t.id}`, { minPoints: Number(e.minPoints) || 0, minSpend: e.minSpend === '' ? null : Number(e.minSpend) }), 'تم الحفظ')) && onSaved()
                          }
                        >
                          حفظ
                        </Button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}
