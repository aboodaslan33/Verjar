import { useEffect, useState } from 'react';
import { Checkbox, Input, Select } from '../../ui';
import { api } from '../../../lib/api';
import { REWARD_TYPE_LABEL } from '../../../lib/insights';
import type { Category } from '../../../lib/types';
import { cx } from '../../../lib/format';

/** حقول الكوبون (إنشاء كوبون عام أو كوبون مكافأة لعميل) */
export type CouponDraft = {
  code: string;
  name: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  maxDiscount: string;
  minOrder: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  categoryIds: string[];
  productIds: { id: string; name: string }[];
};

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);

export function emptyCoupon(prefix = 'VIP'): CouponDraft {
  return {
    code: `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: prefix === 'VIP' ? 'VIP Customer Coupon' : '',
    type: 'PERCENT',
    value: '10',
    maxDiscount: '50',
    minOrder: '',
    startsAt: today(),
    endsAt: plusDays(30),
    usageLimit: '1',
    perCustomerLimit: '1',
    categoryIds: [],
    productIds: [],
  };
}

export function couponPayload(c: CouponDraft) {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    code: c.code.trim(),
    name: c.name.trim(),
    type: c.type,
    value: Number(c.value),
    maxDiscount: c.type === 'PERCENT' ? num(c.maxDiscount) : null,
    minOrder: num(c.minOrder),
    startsAt: c.startsAt || null,
    endsAt: c.endsAt ? `${c.endsAt}T23:59:59` : null,
    usageLimit: num(c.usageLimit),
    perCustomerLimit: num(c.perCustomerLimit) ?? 1,
    categoryIds: c.categoryIds,
    productIds: c.productIds.map((p) => p.id),
  };
}

export function CouponFields({ value: c, onChange, errors = {} }: { value: CouponDraft; onChange: (c: CouponDraft) => void; errors?: Record<string, string> }) {
  const set = (k: keyof CouponDraft) => (e: { target: { value: string } }) => onChange({ ...c, [k]: e.target.value });
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get<Category[]>('/store/categories').then(setCats).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => {
      api
        .get<{ items: { id: string; name: string }[] }>('/store/products', { q, pageSize: 8 })
        .then((r) => setFound(r.items.map((p) => ({ id: p.id, name: p.name }))))
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const allCats = cats.flatMap((x) => [{ id: x.id, name: x.name }, ...(x.children ?? []).map((k) => ({ id: k.id, name: `${x.name} / ${k.name}` }))]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="كود الكوبون" className="ltr text-start uppercase" value={c.code} onChange={set('code')} error={errors.code} hint="أحرف إنجليزية وأرقام" />
        <Input label="اسم الكوبون" value={c.name} onChange={set('name')} error={errors.name} />
        <Select label="نوع الخصم" value={c.type} onChange={set('type')}>
          <option value="PERCENT">نسبة مئوية %</option>
          <option value="FIXED">مبلغ ثابت (د.أ)</option>
        </Select>
        <Input label={c.type === 'PERCENT' ? 'قيمة الخصم %' : 'قيمة الخصم (د.أ)'} type="number" inputMode="decimal" className="ltr text-start" value={c.value} onChange={set('value')} error={errors.value} />
        {c.type === 'PERCENT' && <Input label="الحد الأقصى للخصم (د.أ)" optional type="number" inputMode="decimal" className="ltr text-start" value={c.maxDiscount} onChange={set('maxDiscount')} error={errors.maxDiscount} />}
        <Input label="الحد الأدنى للطلب (د.أ)" optional type="number" inputMode="decimal" className="ltr text-start" value={c.minOrder} onChange={set('minOrder')} error={errors.minOrder} />
        <Input label="تاريخ البداية" type="date" className="ltr text-start" value={c.startsAt} onChange={set('startsAt')} error={errors.startsAt} />
        <Input label="تاريخ الانتهاء" type="date" className="ltr text-start" value={c.endsAt} onChange={set('endsAt')} error={errors.endsAt} />
        <Input label="عدد مرات الاستخدام (الكلي)" optional type="number" className="ltr text-start" value={c.usageLimit} onChange={set('usageLimit')} error={errors.usageLimit} hint="فارغ = بدون حد" />
        <Input label="لكل عميل" type="number" className="ltr text-start" value={c.perCustomerLimit} onChange={set('perCustomerLimit')} error={errors.perCustomerLimit} />
      </div>
      <div>
        <p className="label">الفئات المشمولة <span className="text-xs font-normal text-muted">(بدون اختيار = كل المنتجات)</span></p>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {allCats.map((x) => {
            const on = c.categoryIds.includes(x.id);
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...c, categoryIds: on ? c.categoryIds.filter((i) => i !== x.id) : [...c.categoryIds, x.id] })}
                className={cx('rounded-full border px-2.5 py-1 text-xs', on ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink')}
              >
                {x.name}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <Input label="منتجات محددة" optional placeholder="ابحث باسم المنتج…" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.length > 0 && (
          <ul className="mt-1 divide-y divide-line rounded-lg border border-line text-sm">
            {found
              .filter((p) => !c.productIds.some((x) => x.id === p.id))
              .map((p) => (
                <li key={p.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-start hover:bg-subtle" onClick={() => (onChange({ ...c, productIds: [...c.productIds, p] }), setQ(''))}>
                    + {p.name}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {c.productIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.productIds.map((p) => (
              <button key={p.id} type="button" onClick={() => onChange({ ...c, productIds: c.productIds.filter((x) => x.id !== p.id) })} className="rounded-full bg-subtle px-2.5 py-1 text-xs hover:bg-danger/10">
                {p.name} ×
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** مسودة مكافأة واحدة */
export type RewardDraft = { type: string; on: boolean; title: string; planId: string; durationDays: string; value: string; coupon: CouponDraft };

export const SUPPLIER_TYPES = ['BADGE', 'HOME_BANNER', 'FEATURED_PLACEMENT', 'FREE_SUBSCRIPTION', 'EXTRA_PRODUCTS', 'SUBSCRIPTION_DISCOUNT', 'POINTS'] as const;
export const CUSTOMER_TYPES = ['COUPON', 'POINTS'] as const;

export function defaultRewards(kind: 'SUPPLIER' | 'CUSTOMER'): RewardDraft[] {
  const base = (type: string, on: boolean, extra: Partial<RewardDraft> = {}): RewardDraft => ({ type, on, title: '', planId: 'plan_pro', durationDays: '30', value: '', coupon: emptyCoupon(), ...extra });
  return kind === 'SUPPLIER'
    ? [
        base('BADGE', true, { title: 'مورد الشهر' }),
        base('HOME_BANNER', false),
        base('FEATURED_PLACEMENT', false),
        base('FREE_SUBSCRIPTION', false, { durationDays: '30' }),
        base('EXTRA_PRODUCTS', false, { value: '20' }),
        base('SUBSCRIPTION_DISCOUNT', false, { value: '25' }),
        base('POINTS', false, { value: '500' }),
      ]
    : [base('COUPON', true), base('POINTS', false, { value: '200' })];
}

export function rewardsPayload(list: RewardDraft[]) {
  return list
    .filter((r) => r.on)
    .map((r) => ({
      type: r.type,
      title: r.title.trim() || null,
      planId: r.type === 'FREE_SUBSCRIPTION' ? r.planId : null,
      durationDays: r.durationDays ? Number(r.durationDays) : null,
      value: r.value ? Number(r.value) : null,
      coupon: r.type === 'COUPON' ? couponPayload(r.coupon) : null,
    }));
}

/** اختيار المكافآت وإعدادها (المدة، الباقة، القيمة، الكوبون) — لا شيء يُمنح دون اختيار صريح */
export function RewardPicker({ value, onChange, plans }: { value: RewardDraft[]; onChange: (v: RewardDraft[]) => void; plans: { id: string; name: string; price: number }[] }) {
  const upd = (i: number, patch: Partial<RewardDraft>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {value.map((r, i) => (
        <div key={r.type} className={cx('rounded-xl border p-3', r.on ? 'border-primary bg-primary/5' : 'border-line')}>
          <Checkbox label={REWARD_TYPE_LABEL[r.type] ?? r.type} checked={r.on} onChange={(on) => upd(i, { on })} />
          {r.on && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {r.type === 'BADGE' && <Input label="نص الشارة" value={r.title} onChange={(e) => upd(i, { title: e.target.value })} />}
              {r.type === 'FREE_SUBSCRIPTION' && (
                <Select label="الباقة" value={r.planId} onChange={(e) => upd(i, { planId: e.target.value })}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
              {r.type === 'EXTRA_PRODUCTS' && <Input label="عدد المنتجات الإضافية" type="number" className="ltr text-start" value={r.value} onChange={(e) => upd(i, { value: e.target.value })} />}
              {r.type === 'SUBSCRIPTION_DISCOUNT' && <Input label="نسبة الخصم %" type="number" className="ltr text-start" value={r.value} onChange={(e) => upd(i, { value: e.target.value })} />}
              {r.type === 'POINTS' && <Input label="عدد النقاط" type="number" className="ltr text-start" value={r.value} onChange={(e) => upd(i, { value: e.target.value })} />}
              {r.type !== 'POINTS' && r.type !== 'COUPON' && (
                <Select label="المدة" value={['30', '60', '90', '180', '365'].includes(r.durationDays) ? r.durationDays : 'custom'} onChange={(e) => upd(i, { durationDays: e.target.value === 'custom' ? '45' : e.target.value })}>
                  <option value="30">شهر</option>
                  <option value="60">شهران</option>
                  <option value="90">3 أشهر</option>
                  <option value="180">6 أشهر</option>
                  <option value="365">سنة</option>
                  <option value="custom">مدة مخصصة…</option>
                </Select>
              )}
              {r.type !== 'POINTS' && r.type !== 'COUPON' && !['30', '60', '90', '180', '365'].includes(r.durationDays) && (
                <Input label="المدة (يوم)" type="number" className="ltr text-start" value={r.durationDays} onChange={(e) => upd(i, { durationDays: e.target.value })} />
              )}
              {r.type === 'COUPON' && (
                <div className="sm:col-span-3">
                  <CouponFields value={r.coupon} onChange={(coupon) => upd(i, { coupon })} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
