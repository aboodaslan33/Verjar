import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../../components/admin/hooks';
import { AdminPage, FilterBar, FilterSelect, Panel, Switch } from '../../../components/admin/ui';
import { Alert, Button, Checkbox, EmptyState, Icon, Input, Modal, Select, SkeletonRows, Tag, Textarea } from '../../../components/ui';
import { Stars } from '../../../components/market/Stars';
import { api } from '../../../lib/api';
import { formatDate, formatJOD } from '../../../lib/format';
import {
  AD_STATUS_LABEL,
  AD_TYPE_LABEL,
  COMMISSION_GROUPS,
  DEAL_TYPE_LABEL,
  FEATURE_LABEL,
  INVOICE_PURPOSE_LABEL,
  INVOICE_STATUS_LABEL,
  PLACEMENT_LABEL,
  groupLabel,
} from '../../../lib/market';
import type { Category, Paged } from '../../../lib/types';
import { useDocumentTitle } from '../../../lib/useAsync';

// ═════════ الباقات ═════════

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  maxProducts: number | null;
  maxUsers: number;
  maxRfqPerMonth: number | null;
  searchBoost: number;
  rfqPriority: number;
  leadsIncluded: boolean;
  features: Record<string, boolean>;
  badge: string | null;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  _count?: { vendors: number };
};

export function MarketPlans() {
  useDocumentTitle('الباقات');
  const q = useAdminQuery(() => api.get<Plan[]>('/admin/market/plans'), []);
  const [edit, setEdit] = useState<Plan | 'new' | null>(null);
  return (
    <AdminPage
      title="باقات الموردين"
      description="الأسعار والمدد والحدود والمزايا — كلها من هنا بدون تعديل الكود."
      actions={
        <Button size="sm" onClick={() => setEdit('new')}>
          <Icon name="plus" className="h-4 w-4" /> باقة جديدة
        </Button>
      }
    >
      {q.loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-3">
          {q.data?.map((p) => (
            <li key={p.id} className="card flex flex-col p-5">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-bold">{p.name}</p>
                <span className="flex gap-1">
                  {p.isDefault && <Tag>افتراضية</Tag>}
                  {!p.active && <Tag tone="danger">متوقفة</Tag>}
                </span>
              </div>
              <p className="mt-1 font-display text-2xl font-bold">{formatJOD(p.price)}</p>
              <p className="text-xs text-muted">كل {p.durationDays} يومًا · {p._count?.vendors ?? 0} مورد</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                <li>المنتجات: {p.maxProducts ?? 'غير محدود'}</li>
                <li>المستخدمون: {p.maxUsers}</li>
                <li>طلبات شهريًا: {p.maxRfqPerMonth ?? 'غير محدود'}</li>
                <li>أولوية البحث {p.searchBoost} · أولوية الطلبات {p.rfqPriority}</li>
                <li>{p.leadsIncluded ? 'الـ Leads مشمولة' : 'الـ Leads برسوم (إن فُعّلت)'}</li>
                {Object.entries(p.features)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <li key={k}>✓ {FEATURE_LABEL[k] ?? k}</li>
                  ))}
              </ul>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => setEdit(p)}>
                تعديل
              </Button>
            </li>
          ))}
        </ul>
      )}
      {edit && <PlanDialog plan={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), q.retry())} />}
    </AdminPage>
  );
}

function PlanDialog({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const [f, setF] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: String(plan?.price ?? 0),
    durationDays: String(plan?.durationDays ?? 30),
    maxProducts: plan?.maxProducts != null ? String(plan.maxProducts) : '',
    maxUsers: String(plan?.maxUsers ?? 1),
    maxRfqPerMonth: plan?.maxRfqPerMonth != null ? String(plan.maxRfqPerMonth) : '',
    searchBoost: String(plan?.searchBoost ?? 0),
    rfqPriority: String(plan?.rfqPriority ?? 0),
    badge: plan?.badge ?? '',
    sortOrder: String(plan?.sortOrder ?? 0),
  });
  const [flags, setFlags] = useState({ leadsIncluded: plan?.leadsIncluded ?? false, isDefault: plan?.isDefault ?? false, active: plan?.active ?? true });
  const [features, setFeatures] = useState<Record<string, boolean>>(plan?.features ?? {});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = async () => {
    const body = {
      ...(plan ? {} : { code: f.code }),
      name: f.name,
      description: f.description,
      price: Number(f.price) || 0,
      durationDays: Number(f.durationDays) || 30,
      maxProducts: num(f.maxProducts),
      maxUsers: Number(f.maxUsers) || 1,
      maxRfqPerMonth: num(f.maxRfqPerMonth),
      searchBoost: Number(f.searchBoost) || 0,
      rfqPriority: Number(f.rfqPriority) || 0,
      badge: f.badge.trim() || null,
      sortOrder: Number(f.sortOrder) || 0,
      ...flags,
      features: Object.fromEntries(Object.keys(FEATURE_LABEL).map((k) => [k, Boolean(features[k])])),
    };
    if (await m.run('save', () => (plan ? api.patch(`/admin/market/plans/${plan.id}`, body) : api.post('/admin/market/plans', body)), 'تم حفظ الباقة')) onSaved();
  };
  const fe = m.fieldErrors;
  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? `تعديل باقة ${plan.name}` : 'باقة جديدة'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={m.pending === 'save'} onClick={save}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {!plan && <Input label="الرمز (إنجليزي)" dir="ltr" className="text-start" value={f.code} onChange={set('code')} error={fe.code} placeholder="ENTERPRISE" />}
        <Input label="الاسم" value={f.name} onChange={set('name')} error={fe.name} />
        <Input label="السعر (د.أ)" type="number" min={0} className="ltr text-start" value={f.price} onChange={set('price')} error={fe.price} />
        <Input label="المدة (يوم)" type="number" min={1} className="ltr text-start" value={f.durationDays} onChange={set('durationDays')} error={fe.durationDays} />
        <Input label="حد المنتجات" optional type="number" min={0} className="ltr text-start" value={f.maxProducts} onChange={set('maxProducts')} hint="فارغ = غير محدود" />
        <Input label="عدد المستخدمين" type="number" min={1} className="ltr text-start" value={f.maxUsers} onChange={set('maxUsers')} />
        <Input label="طلبات عروض الأسعار شهريًا" optional type="number" min={0} className="ltr text-start" value={f.maxRfqPerMonth} onChange={set('maxRfqPerMonth')} hint="فارغ = غير محدود" />
        <Input label="الشارة" optional value={f.badge} onChange={set('badge')} placeholder="PRO" />
        <Input label="أولوية البحث" type="number" className="ltr text-start" value={f.searchBoost} onChange={set('searchBoost')} />
        <Input label="أولوية الطلبات" type="number" className="ltr text-start" value={f.rfqPriority} onChange={set('rfqPriority')} />
        <Textarea label="الوصف" wrapperClassName="sm:col-span-2" rows={2} value={f.description} onChange={set('description')} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.entries(FEATURE_LABEL).map(([k, l]) => (
          <Checkbox key={k} label={l} checked={Boolean(features[k])} onChange={(v) => setFeatures((s) => ({ ...s, [k]: v }))} />
        ))}
        <Checkbox label="الـ Leads مشمولة بدون رسوم" checked={flags.leadsIncluded} onChange={(v) => setFlags((s) => ({ ...s, leadsIncluded: v }))} />
        <Checkbox label="الباقة الافتراضية للموردين الجدد" checked={flags.isDefault} onChange={(v) => setFlags((s) => ({ ...s, isDefault: v }))} />
        <Checkbox label="متاحة" checked={flags.active} onChange={(v) => setFlags((s) => ({ ...s, active: v }))} />
      </div>
      {m.error && !Object.keys(fe).length && <Alert tone="error" className="mt-3">{m.error}</Alert>}
    </Modal>
  );
}

// ═════════ العمولات ═════════

type Rule = { id: string; name: string; categoryId: string | null; category: { name: string } | null; commissionGroup: string | null; planCode: string | null; dealType: string | null; percent: number; minAmount: number | null; maxAmount: number | null; priority: number; active: boolean };

export function MarketCommissions() {
  useDocumentTitle('العمولات');
  const q = useAdminQuery(() => api.get<{ rules: Rule[] }>('/admin/market/commissions'), []);
  const cats = useAdminQuery(() => api.get<Category[]>('/store/categories'), []);
  const [edit, setEdit] = useState<Rule | 'new' | null>(null);
  const [calc, setCalc] = useState({ amount: '20000', categoryId: '', planCode: '', dealType: 'RFQ_DEAL' });
  const [result, setResult] = useState<{ percent: number; amount: number; capped: boolean; floored: boolean; rule: { name: string } | null } | null>(null);
  const m = useMutation();
  const allCats = (cats.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...(c.children ?? []).map((k) => ({ id: k.id, name: `${c.name} / ${k.name}` }))]);
  const run = async () => {
    const r = await m.run('calc', () => api.post<typeof result>('/admin/market/commissions/preview', { amount: Number(calc.amount) || 0, categoryId: calc.categoryId || null, planCode: calc.planCode || null, dealType: calc.dealType || null }));
    if (r) setResult(r);
  };
  const cols: Column<Rule>[] = [
    { key: 'name', header: 'القاعدة', cell: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'scope', header: 'تنطبق على', cell: (r) => [r.category?.name, r.commissionGroup && groupLabel(r.commissionGroup), r.planCode, r.dealType && DEAL_TYPE_LABEL[r.dealType]].filter(Boolean).join(' · ') || 'الكل' },
    { key: 'pct', header: 'النسبة', cell: (r) => <b className="num">{Number(r.percent)}%</b> },
    { key: 'minmax', header: 'الحد الأدنى / الأقصى', cell: (r) => `${r.minAmount != null ? formatJOD(r.minAmount) : '—'} / ${r.maxAmount != null ? formatJOD(r.maxAmount) : '—'}` },
    { key: 'active', header: 'الحالة', cell: (r) => <Tag tone={r.active ? 'success' : 'neutral'}>{r.active ? 'فعّالة' : 'متوقفة'}</Tag> },
    { key: 'edit', header: '', cell: (r) => <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>تعديل</Button> },
  ];
  return (
    <AdminPage
      title="محرك العمولات"
      description="نسب مختلفة حسب التصنيف أو مجموعة التصنيفات أو باقة المورد أو نوع الصفقة، مع حد أدنى وأقصى. تُطبَّق القاعدة الأكثر تحديدًا."
      actions={
        <Button size="sm" onClick={() => setEdit('new')}>
          <Icon name="plus" className="h-4 w-4" /> قاعدة جديدة
        </Button>
      }
    >
      <Panel title="حاسبة العمولة" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <Input label="قيمة الصفقة" type="number" className="ltr text-start" value={calc.amount} onChange={(e) => setCalc({ ...calc, amount: e.target.value })} />
          <Select label="التصنيف" value={calc.categoryId} onChange={(e) => setCalc({ ...calc, categoryId: e.target.value })}>
            <option value="">—</option>
            {allCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="باقة المورد" value={calc.planCode} onChange={(e) => setCalc({ ...calc, planCode: e.target.value })}>
            <option value="">—</option>
            <option>FREE</option>
            <option>PRO</option>
            <option>BUSINESS</option>
          </Select>
          <Select label="نوع الصفقة" value={calc.dealType} onChange={(e) => setCalc({ ...calc, dealType: e.target.value })}>
            {Object.entries(DEAL_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Button onClick={run} loading={m.pending === 'calc'}>
            احسب
          </Button>
        </div>
        {result && (
          <p className="mt-4 rounded-lg bg-subtle p-3">
            العمولة <b className="tabular-nums">{formatJOD(result.amount)}</b> ({result.percent}%) — القاعدة: {result.rule?.name ?? 'لا توجد'}
            {result.capped && ' — طُبّق الحد الأقصى'}
            {result.floored && ' — طُبّق الحد الأدنى'}
          </p>
        )}
      </Panel>
      <DataTable rows={q.data?.rules} columns={cols} rowKey={(r) => r.id} loading={q.loading} error={q.error} onRetry={q.retry} empty={{ title: 'لا توجد قواعد' }} />
      {edit && <RuleDialog rule={edit === 'new' ? null : edit} cats={allCats} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), q.retry())} />}
    </AdminPage>
  );
}

function RuleDialog({ rule, cats, onClose, onSaved }: { rule: Rule | null; cats: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const [f, setF] = useState({
    name: rule?.name ?? '',
    categoryId: rule?.categoryId ?? '',
    commissionGroup: rule?.commissionGroup ?? '',
    planCode: rule?.planCode ?? '',
    dealType: rule?.dealType ?? '',
    percent: String(rule?.percent ?? ''),
    minAmount: rule?.minAmount != null ? String(rule.minAmount) : '',
    maxAmount: rule?.maxAmount != null ? String(rule.maxAmount) : '',
    priority: String(rule?.priority ?? 0),
  });
  const [active, setActive] = useState(rule?.active ?? true);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    const body = {
      name: f.name,
      categoryId: f.categoryId || null,
      commissionGroup: f.commissionGroup || null,
      planCode: f.planCode || null,
      dealType: f.dealType || null,
      percent: Number(f.percent) || 0,
      minAmount: f.minAmount === '' ? null : Number(f.minAmount),
      maxAmount: f.maxAmount === '' ? null : Number(f.maxAmount),
      priority: Number(f.priority) || 0,
      active,
    };
    if (await m.run('save', () => (rule ? api.patch(`/admin/market/commissions/${rule.id}`, body) : api.post('/admin/market/commissions', body)), 'تم الحفظ')) onSaved();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'تعديل قاعدة العمولة' : 'قاعدة عمولة جديدة'}
      size="lg"
      footer={
        <>
          {rule && (
            <Button variant="ghost" className="me-auto text-danger" loading={m.pending === 'del'} onClick={async () => (await m.run('del', () => api.del(`/admin/market/commissions/${rule.id}`), 'تم الحذف')) && onSaved()}>
              حذف
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={m.pending === 'save'} onClick={save}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم القاعدة" wrapperClassName="sm:col-span-2" value={f.name} onChange={set('name')} error={m.fieldErrors.name} placeholder="الماكينات والمعدات" />
        <Select label="تصنيف محدد" value={f.categoryId} onChange={set('categoryId')}>
          <option value="">الكل</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="أو مجموعة تصنيفات" value={f.commissionGroup} onChange={set('commissionGroup')}>
          <option value="">الكل</option>
          {COMMISSION_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
        <Select label="باقة المورد" value={f.planCode} onChange={set('planCode')}>
          <option value="">الكل</option>
          <option>FREE</option>
          <option>PRO</option>
          <option>BUSINESS</option>
        </Select>
        <Select label="نوع الصفقة" value={f.dealType} onChange={set('dealType')}>
          <option value="">الكل</option>
          {Object.entries(DEAL_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="النسبة %" type="number" min={0} max={100} step="0.1" className="ltr text-start" value={f.percent} onChange={set('percent')} error={m.fieldErrors.percent} />
        <Input label="الأولوية" type="number" className="ltr text-start" value={f.priority} onChange={set('priority')} />
        <Input label="الحد الأدنى للعمولة (د.أ)" optional type="number" min={0} className="ltr text-start" value={f.minAmount} onChange={set('minAmount')} error={m.fieldErrors.minAmount} />
        <Input label="الحد الأقصى للعمولة (د.أ)" optional type="number" min={0} className="ltr text-start" value={f.maxAmount} onChange={set('maxAmount')} hint="يمنع عمولة مرتفعة جدًا في الصفقات الكبيرة" />
        <Checkbox label="فعّالة" checked={active} onChange={setActive} />
      </div>
      {m.error && !Object.keys(m.fieldErrors).length && <Alert tone="error" className="mt-3">{m.error}</Alert>}
    </Modal>
  );
}

// ═════════ الإعلانات ═════════

type AdRow = { id: string; type: string; placement: string; status: string; startsAt: string; endsAt: string; price: number; impressions: number; clicks: number; vendor: { id: string; name: string }; product: { name: string } | null; invoice: { id: string; number: string; status: string } | null };
type Pkg = { id: string; type: string; name: string; placement: string; price: number; durationDays: number; active: boolean; sortOrder: number };

export function MarketAds() {
  useDocumentTitle('الإعلانات');
  const f = useFilters(['status'] as const);
  const q = useAdminQuery(() => api.get<{ ads: AdRow[]; packages: Pkg[] }>('/admin/market/ads', f.values), [f.values.status]);
  const suppliers = useAdminQuery(() => api.get<Paged<{ id: string; name: string }>>('/admin/market/suppliers', { status: 'APPROVED', pageSize: 100 }), []);
  const m = useMutation();
  const [pkg, setPkg] = useState<Pkg | 'new' | null>(null);
  const [create, setCreate] = useState(false);
  const setStatus = async (a: AdRow, status: string) => (await m.run(a.id, () => api.patch(`/admin/market/ads/${a.id}`, { status }), 'تم التحديث')) && q.retry();
  const cols: Column<AdRow>[] = [
    { key: 'type', header: 'الإعلان', cell: (a) => <span><b>{AD_TYPE_LABEL[a.type]}</b><span className="block text-xs text-muted">{PLACEMENT_LABEL[a.placement] ?? a.placement}</span></span> },
    { key: 'vendor', header: 'المورد / المنتج', cell: (a) => <span>{a.vendor.name}{a.product && <span className="block text-xs text-muted">{a.product.name}</span>}</span> },
    { key: 'dates', header: 'المدة', cell: (a) => `${formatDate(a.startsAt)} ← ${formatDate(a.endsAt)}`, hideOnMobile: true },
    { key: 'res', header: 'النتائج', cell: (a) => <span className="num">{a.impressions} / {a.clicks}</span>, hideOnMobile: true },
    { key: 'price', header: 'السعر', cell: (a) => <span>{formatJOD(a.price)}{a.invoice && <span className="block text-xs text-muted">{INVOICE_STATUS_LABEL[a.invoice.status]}</span>}</span> },
    { key: 'status', header: 'الحالة', cell: (a) => <Tag tone={a.status === 'ACTIVE' ? 'success' : a.status === 'REQUESTED' || a.status === 'PENDING_PAYMENT' ? 'brand' : 'neutral'}>{AD_STATUS_LABEL[a.status]}</Tag> },
    {
      key: 'act',
      header: '',
      cell: (a) => (
        <span className="flex gap-1">
          {a.status !== 'ACTIVE' && a.status !== 'ENDED' && (
            <Button size="sm" variant="outline" loading={m.pending === a.id} onClick={() => setStatus(a, 'ACTIVE')}>
              تفعيل
            </Button>
          )}
          {a.status === 'ACTIVE' && (
            <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'PAUSED')}>
              إيقاف
            </Button>
          )}
          {(a.status === 'REQUESTED' || a.status === 'PENDING_PAYMENT') && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatus(a, 'REJECTED')}>
              رفض
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <AdminPage
      title="الإعلانات"
      description="إعلانات الموردين داخل السوق: الأماكن والمدد والأسعار. تُفعَّل الإعلانات المدفوعة تلقائيًا عند تأكيد دفع فاتورتها."
      actions={
        <Button size="sm" onClick={() => setCreate(true)}>
          <Icon name="plus" className="h-4 w-4" /> إعلان جديد
        </Button>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">الكل</option>
          {Object.entries(AD_STATUS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <DataTable rows={q.data?.ads} columns={cols} rowKey={(a) => a.id} loading={q.loading} error={q.error} onRetry={q.retry} empty={{ title: 'لا توجد إعلانات' }} />
      <Panel
        title="باقات الإعلانات وأسعارها"
        className="mt-8"
        actions={
          <Button size="sm" variant="outline" onClick={() => setPkg('new')}>
            باقة جديدة
          </Button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <ul className="divide-y divide-line">
          {q.data?.packages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <span>
                <b>{p.name}</b> <span className="text-sm text-muted">— {AD_TYPE_LABEL[p.type]} · {PLACEMENT_LABEL[p.placement] ?? p.placement} · {p.durationDays} يوم</span>
              </span>
              <span className="flex items-center gap-3">
                <b className="tabular-nums">{formatJOD(p.price)}</b>
                {!p.active && <Tag>متوقفة</Tag>}
                <Button size="sm" variant="ghost" onClick={() => setPkg(p)}>
                  تعديل
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      {pkg && <PackageDialog pkg={pkg === 'new' ? null : pkg} onClose={() => setPkg(null)} onSaved={() => (setPkg(null), q.retry())} />}
      {create && <CreateAdDialog suppliers={suppliers.data?.items ?? []} onClose={() => setCreate(false)} onSaved={() => (setCreate(false), q.retry())} />}
    </AdminPage>
  );
}

function PackageDialog({ pkg, onClose, onSaved }: { pkg: Pkg | null; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const [f, setF] = useState({ type: pkg?.type ?? 'FEATURED_PRODUCT', name: pkg?.name ?? '', placement: pkg?.placement ?? 'MARKET_HOME', price: String(pkg?.price ?? ''), durationDays: String(pkg?.durationDays ?? 7), sortOrder: String(pkg?.sortOrder ?? 0) });
  const [active, setActive] = useState(pkg?.active ?? true);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    const body = { ...f, price: Number(f.price) || 0, durationDays: Number(f.durationDays) || 7, sortOrder: Number(f.sortOrder) || 0, active };
    if (await m.run('save', () => (pkg ? api.patch(`/admin/market/ad-packages/${pkg.id}`, body) : api.post('/admin/market/ad-packages', body)), 'تم الحفظ')) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={pkg ? 'تعديل باقة إعلان' : 'باقة إعلان جديدة'} footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={m.pending === 'save'} onClick={save}>حفظ</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="الاسم" wrapperClassName="sm:col-span-2" value={f.name} onChange={set('name')} error={m.fieldErrors.name} />
        <Select label="النوع" value={f.type} onChange={set('type')}>
          {Object.entries(AD_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Select label="مكان الظهور" value={f.placement} onChange={set('placement')}>
          {Object.entries(PLACEMENT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="السعر (د.أ)" type="number" min={0} className="ltr text-start" value={f.price} onChange={set('price')} error={m.fieldErrors.price} />
        <Input label="المدة (يوم)" type="number" min={1} className="ltr text-start" value={f.durationDays} onChange={set('durationDays')} />
        <Checkbox label="متاحة للموردين" checked={active} onChange={setActive} />
      </div>
    </Modal>
  );
}

function CreateAdDialog({ suppliers, onClose, onSaved }: { suppliers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ vendorId: '', productId: '', type: 'FEATURED_SUPPLIER', placement: 'MARKET_HOME', startsAt: today, endsAt: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), price: '0', title: '' });
  const [charge, setCharge] = useState(false);
  const products = useAdminQuery(() => (f.vendorId ? api.get<Paged<{ id: string; name: string }>>('/admin/store/products', { vendorId: f.vendorId, approval: 'APPROVED', pageSize: 100 }) : Promise.resolve(null)), [f.vendorId]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    const body = { ...f, productId: f.productId || null, title: f.title || null, price: Number(f.price) || 0, startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(`${f.endsAt}T23:59:00`).toISOString(), charge };
    if (await m.run('save', () => api.post('/admin/market/ads', body), 'تم إنشاء الإعلان')) onSaved();
  };
  return (
    <Modal open onClose={onClose} title="إعلان جديد" size="lg" footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={m.pending === 'save'} disabled={!f.vendorId} onClick={save}>إنشاء</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="المورد" value={f.vendorId} onChange={set('vendorId')} error={m.fieldErrors.vendorId}>
          <option value="">اختر</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="المنتج (اختياري)" value={f.productId} onChange={set('productId')} error={m.fieldErrors.productId}>
          <option value="">—</option>
          {products.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select label="النوع" value={f.type} onChange={set('type')}>
          {Object.entries(AD_TYPE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Select label="مكان الظهور" value={f.placement} onChange={set('placement')}>
          {Object.entries(PLACEMENT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="من" type="date" className="ltr text-start" value={f.startsAt} onChange={set('startsAt')} />
        <Input label="إلى" type="date" className="ltr text-start" value={f.endsAt} onChange={set('endsAt')} error={m.fieldErrors.endsAt} />
        <Input label="السعر (د.أ)" type="number" min={0} className="ltr text-start" value={f.price} onChange={set('price')} />
        <Checkbox label="إصدار فاتورة (يُفعَّل بعد الدفع)" checked={charge} onChange={setCharge} />
      </div>
      {m.error && !Object.keys(m.fieldErrors).length && <Alert tone="error" className="mt-3">{m.error}</Alert>}
    </Modal>
  );
}

// ═════════ الفواتير ═════════

type Inv = { id: string; number: string; purpose: string; description: string; amount: number; status: string; provider: string; providerRef: string | null; createdAt: string; paidAt: string | null; vendor: { id: string; name: string } | null };

export function MarketInvoices() {
  useDocumentTitle('فواتير السوق');
  const f = useFilters(['status', 'purpose'] as const);
  const q = useAdminQuery(() => api.get<Paged<Inv> & { sums: Record<string, { count: number; amount: number }> }>('/admin/market/invoices', { ...f.values, page: f.page, pageSize: 50 }), [JSON.stringify(f.values), f.page], { keep: true });
  const m = useMutation();
  const [paying, setPaying] = useState<Inv | null>(null);
  const [ref, setRef] = useState('');
  const cols: Column<Inv>[] = [
    { key: 'n', header: 'الفاتورة', cell: (i) => <span><span className="ltr block font-semibold">{i.number}</span><span className="text-xs text-muted">{formatDate(i.createdAt)}</span></span> },
    { key: 'v', header: 'المورد', cell: (i) => (i.vendor ? <Link to={`/admin/market/suppliers/${i.vendor.id}`} className="hover:underline">{i.vendor.name}</Link> : '—') },
    { key: 'p', header: 'البند', cell: (i) => <span><span className="block">{INVOICE_PURPOSE_LABEL[i.purpose] ?? i.purpose}</span><span className="line-clamp-1 text-xs text-muted">{i.description}</span></span> },
    { key: 'a', header: 'المبلغ', cell: (i) => <b className="tabular-nums">{formatJOD(i.amount)}</b> },
    { key: 's', header: 'الحالة', cell: (i) => <Tag tone={i.status === 'PAID' ? 'success' : i.status === 'PENDING' ? 'brand' : 'neutral'}>{INVOICE_STATUS_LABEL[i.status] ?? i.status}</Tag> },
    {
      key: 'act',
      header: '',
      cell: (i) =>
        i.status === 'PENDING' && (
          <span className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => (setRef(''), setPaying(i))}>
              تأكيد الدفع
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" loading={m.pending === `c${i.id}`} onClick={async () => (await m.run(`c${i.id}`, () => api.post(`/admin/market/invoices/${i.id}/cancel`), 'أُلغيت الفاتورة')) && q.retry()}>
              إلغاء
            </Button>
          </span>
        ),
    },
  ];
  const s = q.data?.sums ?? {};
  return (
    <AdminPage title="فواتير السوق" description="اشتراكات، إعلانات، رسوم Leads وعمولات. تأكيد الدفع يُفعّل الخدمة المرتبطة تلقائيًا (بوابة دفع إلكتروني لاحقًا بنفس الفواتير).">
      <p className="mb-4 text-sm text-muted">
        مدفوعة: <b className="text-ink">{formatJOD(s.PAID?.amount ?? 0)}</b> ({s.PAID?.count ?? 0}) · بانتظار الدفع: <b className="text-ink">{formatJOD(s.PENDING?.amount ?? 0)}</b> ({s.PENDING?.count ?? 0})
      </p>
      <FilterBar onClear={f.clear} active={f.active}>
        <FilterSelect label="الحالة" value={f.values.status} onChange={(e) => f.set({ status: e.target.value })}>
          <option value="">الكل</option>
          {Object.entries(INVOICE_STATUS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="البند" value={f.values.purpose} onChange={(e) => f.set({ purpose: e.target.value })}>
          <option value="">الكل</option>
          {Object.entries(INVOICE_PURPOSE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>
      <DataTable rows={q.data?.items} columns={cols} rowKey={(i) => i.id} loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.retry} total={q.data?.total} page={q.data?.page} pages={q.data?.pages} onPage={f.setPage} empty={{ title: 'لا توجد فواتير' }} />
      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={`تأكيد دفع ${paying?.number ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaying(null)}>
              إلغاء
            </Button>
            <Button loading={m.pending === 'pay'} onClick={async () => paying && (await m.run('pay', () => api.post(`/admin/market/invoices/${paying.id}/paid`, { providerRef: ref.trim() || null }), 'تم تأكيد الدفع')) && (setPaying(null), q.retry())}>
              تأكيد
            </Button>
          </>
        }
      >
        {paying && (
          <div className="space-y-3">
            <p>
              {paying.description} — <b>{formatJOD(paying.amount)}</b>
            </p>
            <Input label="مرجع الدفع (CliQ / حوالة)" optional value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        )}
      </Modal>
    </AdminPage>
  );
}

// ═════════ التقييمات ═════════

type Review = { id: string; overall: number; quality: number; delivery: number; commitment: number; communication: number; comment: string | null; visible: boolean; createdAt: string; vendor: { name: string; slug: string }; customer: { name: string; companyName: string | null }; rfq: { code: string } };

export function MarketReviews() {
  useDocumentTitle('تقييمات الموردين');
  const q = useAdminQuery(() => api.get<Review[]>('/admin/market/reviews'), []);
  const m = useMutation();
  return (
    <AdminPage title="تقييمات الموردين" description="كل تقييم مرتبط بصفقة حقيقية (طلب عرض سعر تمت ترسيته). يمكن إخفاء التقييم المخالف.">
      {q.loading ? (
        <SkeletonRows rows={3} />
      ) : !q.data?.length ? (
        <EmptyState title="لا توجد تقييمات بعد" />
      ) : (
        <ul className="space-y-3">
          {q.data.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Stars value={r.overall} />
                  <Link to={`/store/vendor/${r.vendor.slug}`} className="font-semibold hover:underline">
                    {r.vendor.name}
                  </Link>
                </span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="ltr">{r.rfq.code}</span> · {formatDate(r.createdAt)}
                  <Switch label="ظاهر" checked={r.visible} onChange={async (v) => (await m.run(r.id, () => api.patch(`/admin/market/reviews/${r.id}`, { visible: v }), v ? 'التقييم ظاهر' : 'أُخفي التقييم')) && q.retry()} />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                الجودة {r.quality} · التوريد {r.delivery} · الالتزام {r.commitment} · التواصل {r.communication} — {r.customer.companyName ?? r.customer.name}
              </p>
              {r.comment && <p className="mt-2 text-[15px]">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
