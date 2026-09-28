import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useFilters, useMutation } from '../../components/admin/hooks';
import { AdminPage, FilterBar, FilterSelect, SearchInput } from '../../components/admin/ui';
import { DeliveryStatusTag } from '../../components/delivery/Tags';
import { Alert, Button, Checkbox, Icon, Input, Modal, Select, Tag } from '../../components/ui';
import { useAdmin } from '../../context/AdminAuth';
import { api } from '../../lib/api';
import type { DeliveryStatus } from '../../lib/delivery';
import { displayPhone, formatDate, formatJOD, formatTime } from '../../lib/format';
import type { Paged, StaffRole } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  role: StaffRole;
  permissions: string[];
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  driver: { id: string; status: string; areas: string | null } | null;
  activeOrders: number;
};
type Catalog = { permissions: string[]; roles: Record<StaffRole, { allowed: string[]; defaults: string[] }> };

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: 'Super Admin',
  STAFF: 'موظف إدارة',
  MANAGER: 'مدير التوصيل',
  DRIVER: 'موظف توصيل',
};

/** أسماء الصلاحيات ومجموعاتها في الواجهة */
const PERM_LABEL: Record<string, string> = {
  'dashboard.view': 'لوحة التحكم والإحصائيات',
  'users.manage': 'إدارة المستخدمين والصلاحيات',
  'orders.view': 'عرض الطلبات',
  'orders.manage': 'إدارة الطلبات وحالاتها',
  'orders.assign': 'توزيع الطلبات على موظفي التوصيل',
  'orders.editAmounts': 'تعديل المبالغ (أجرة التوصيل)',
  'delivery.manage': 'إدارة موظفي وشركات التوصيل',
  'collections.view': 'متابعة التحصيلات',
  'collections.settle': 'استلام النقد والتسويات',
  'proofs.edit': 'تعديل إثبات التسليم',
  'customers.view': 'عرض العملاء',
  'customers.manage': 'إدارة العملاء',
  'suppliers.view': 'عرض الموردين',
  'suppliers.manage': 'إدارة الموردين',
  'catalog.manage': 'المنتجات والأقسام',
  'bookings.manage': 'الحجوزات والفنيون',
  'corporate.manage': 'طلبات وعقود وعطاءات الشركات',
  'payments.view': 'عرض المالية والمدفوعات',
  'payments.manage': 'تسجيل المدفوعات',
  'reports.view': 'التقارير',
  'settings.manage': 'إعدادات النظام',
  'newsletter.manage': 'النشرة البريدية',
  'audit.view': 'سجلات العمليات',
  'driver.app': 'لوحة موظف التوصيل',
};

const roleTone = (r: StaffRole) => (r === 'ADMIN' ? 'dark' : r === 'MANAGER' ? 'brand' : r === 'DRIVER' ? 'sand' : 'neutral');

export default function Users() {
  useDocumentTitle('المستخدمون والصلاحيات');
  const { admin } = useAdmin();
  const f = useFilters(['role', 'q', 'active'] as const);
  const list = useAdminQuery(() => api.get<Paged<UserRow>>('/admin/users', { ...f.values, page: f.page, pageSize: 50 }), [JSON.stringify(f.values), f.page], { keep: true });
  const catalog = useAdminQuery(() => api.get<Catalog>('/admin/users/permissions'), []);
  const m = useMutation();
  const [edit, setEdit] = useState<UserRow | 'new' | null>(null);
  const [remove, setRemove] = useState<UserRow | null>(null);
  const [activity, setActivity] = useState<UserRow | null>(null);

  const toggleActive = async (u: UserRow) => {
    if (await m.run(`a-${u.id}`, () => api.patch(`/admin/users/${u.id}`, { active: !u.active }), u.active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')) list.reload();
  };

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'المستخدم',
      cell: (u) => (
        <span className="flex flex-col">
          <span className="font-medium">{u.name}</span>
          <span className="ltr text-start text-xs text-muted">{u.username ?? u.email ?? '—'}</span>
        </span>
      ),
    },
    { key: 'role', header: 'الدور', cell: (u) => <Tag tone={roleTone(u.role)}>{ROLE_LABEL[u.role]}</Tag> },
    { key: 'phone', header: 'الهاتف', cell: (u) => (u.phone ? <span className="ltr">{displayPhone(u.phone)}</span> : '—') },
    {
      key: 'perms',
      header: 'الصلاحيات',
      cell: (u) => <span className="text-sm text-muted">{u.role === 'ADMIN' ? 'كل الصلاحيات' : `${u.permissions.length} صلاحية`}</span>,
    },
    { key: 'load', header: 'طلبات جارية', align: 'end', cell: (u) => (u.role === 'DRIVER' ? <span className="tabular-nums">{u.activeOrders}</span> : '—') },
    { key: 'login', header: 'آخر دخول', cell: (u) => (u.lastLoginAt ? formatDate(u.lastLoginAt) : <span className="text-muted">لم يدخل</span>) },
    { key: 'status', header: 'الحالة', cell: (u) => <Tag tone={u.active ? 'success' : 'neutral'}>{u.active ? 'فعّال' : 'موقوف'}</Tag> },
    {
      key: 'act',
      header: '',
      align: 'end',
      cell: (u) => (
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setActivity(u)}>
            النشاط
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>
            تعديل
          </Button>
          {u.id !== admin?.id && (
            <>
              <Button size="sm" variant="ghost" loading={m.pending === `a-${u.id}`} onClick={() => toggleActive(u)}>
                {u.active ? 'إيقاف' : 'تفعيل'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemove(u)} aria-label={`حذف ${u.name}`}>
                <Icon name="trash" className="h-4 w-4 text-danger" />
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="المستخدمون والصلاحيات"
      description="حسابات الإدارة ومديري التوصيل وموظفي التوصيل، وصلاحيات كل حساب."
      actions={
        <Button size="sm" onClick={() => setEdit('new')}>
          <Icon name="plus" className="h-4 w-4" /> مستخدم جديد
        </Button>
      }
    >
      <FilterBar onClear={f.clear} active={f.active}>
        <SearchInput value={f.values.q} onChange={(q) => f.set({ q })} placeholder="اسم، اسم مستخدم، هاتف…" />
        <FilterSelect label="الدور" value={f.values.role} onChange={(e) => f.set({ role: e.target.value })}>
          <option value="">الكل</option>
          {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="الحالة" value={f.values.active} onChange={(e) => f.set({ active: e.target.value })}>
          <option value="">الكل</option>
          <option value="true">فعّال</option>
          <option value="false">موقوف</option>
        </FilterSelect>
      </FilterBar>
      <DataTable
        rows={list.data?.items}
        columns={columns}
        rowKey={(u) => u.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        page={list.data?.page}
        pages={list.data?.pages}
        total={list.data?.total}
        onPage={f.setPage}
        empty={{ title: 'لا يوجد مستخدمون مطابقون' }}
      />
      {edit && catalog.data && <UserForm value={edit === 'new' ? null : edit} catalog={catalog.data} self={edit !== 'new' && edit.id === admin?.id} onClose={() => setEdit(null)} onSaved={list.reload} />}
      {activity && <ActivityDialog user={activity} onClose={() => setActivity(null)} />}
      <ConfirmDialog
        open={Boolean(remove)}
        title={`حذف ${remove?.name ?? ''}؟`}
        confirmLabel="حذف"
        tone="danger"
        onClose={() => setRemove(null)}
        onConfirm={async () => {
          if (remove && (await m.run('del', () => api.del(`/admin/users/${remove.id}`), 'تم حذف الحساب'))) {
            setRemove(null);
            list.reload();
          }
        }}
        loading={m.pending === 'del'}
      >
        يتوقف الحساب فورًا ويُحرَّر اسم المستخدم. يبقى في السجلات والطلبات السابقة.
      </ConfirmDialog>
    </AdminPage>
  );
}

function UserForm({ value, catalog, self, onClose, onSaved }: { value: UserRow | null; catalog: Catalog; self: boolean; onClose: () => void; onSaved: () => void }) {
  const m = useMutation();
  const [name, setName] = useState(value?.name ?? '');
  const [username, setUsername] = useState(value?.username ?? '');
  const [phone, setPhone] = useState(value?.phone ?? '');
  const [email, setEmail] = useState(value?.email ?? '');
  const [role, setRole] = useState<StaffRole>(value?.role ?? 'DRIVER');
  const [perms, setPerms] = useState<string[]>(value?.permissions ?? catalog.roles.DRIVER.defaults);
  const [active, setActive] = useState(value?.active ?? true);
  const [password, setPassword] = useState('');
  const [areas, setAreas] = useState(value?.driver?.areas ?? '');

  const changeRole = (r: StaffRole) => {
    setRole(r);
    setPerms(catalog.roles[r].defaults);
  };
  const allowed = catalog.roles[role].allowed;

  const submit = async () => {
    const body: Record<string, unknown> = {
      name,
      username: username.trim().toLowerCase(),
      phone: phone || null,
      email: email || null,
      role,
      permissions: perms,
      active,
      areas: role === 'DRIVER' ? areas || null : undefined,
      ...(password ? { password } : {}),
    };
    const r = await m.run('save', () => (value ? api.patch(`/admin/users/${value.id}`, body) : api.post('/admin/users', body)), value ? 'تم حفظ المستخدم' : 'تم إنشاء المستخدم');
    if (r) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={value ? `تعديل ${value.name}` : 'مستخدم جديد'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={m.pending === 'save'}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {m.error && <Alert tone="error">{m.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} error={m.fieldErrors.name} />
          <Input label="اسم المستخدم (للدخول)" dir="ltr" className="text-start" value={username} onChange={(e) => setUsername(e.target.value)} error={m.fieldErrors.username} hint="أحرف إنجليزية صغيرة وأرقام، يبدأ بحرف" />
          <Input label="الهاتف" type="tel" dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} error={m.fieldErrors.phone} />
          <Input label="البريد (اختياري)" type="email" dir="ltr" className="text-start" value={email} onChange={(e) => setEmail(e.target.value)} error={m.fieldErrors.email} />
          <Input
            label={value ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'}
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className="text-start"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={m.fieldErrors.password}
            hint={value ? 'تغييرها يُنهي كل جلسات المستخدم' : '8 أحرف على الأقل'}
          />
          <Select label="الدور" value={role} onChange={(e) => changeRole(e.target.value as StaffRole)} disabled={self}>
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          {role === 'DRIVER' && <Input label="مناطق العمل" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="مثال: الجبيهة، صويلح" wrapperClassName="sm:col-span-2" />}
        </div>
        {!self && <Checkbox label="الحساب فعّال" checked={active} onChange={setActive} />}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">الصلاحيات</legend>
          {role === 'ADMIN' ? (
            <p className="text-sm text-muted">الـ Super Admin يملك كل الصلاحيات.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {allowed.map((p) => (
                <Checkbox
                  key={p}
                  label={PERM_LABEL[p] ?? p}
                  checked={perms.includes(p)}
                  onChange={(on) => setPerms((list) => (on ? [...list, p] : list.filter((x) => x !== p)))}
                />
              ))}
            </div>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}

type Activity = {
  stats: { delivered: number; failed: number; collectedOrders: number; collectedAmount: number };
  events: { id: string; toStatus: DeliveryStatus; fromStatus: DeliveryStatus | null; note: string | null; createdAt: string; order: { id: string; code: string | null; number: number; customerName: string } }[];
  logs: { id: string; action: string; entity: string; createdAt: string }[];
};

function ActivityDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const q = useAdminQuery(() => api.get<Activity>(`/admin/users/${user.id}/activity`), [user.id]);
  const a = q.data;
  return (
    <Modal open onClose={onClose} title={`نشاط ${user.name}`} size="lg">
      {!a ? (
        <p className="text-sm text-muted">جاري التحميل…</p>
      ) : (
        <div className="space-y-5">
          {user.role === 'DRIVER' && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['طلبات سُلّمت', a.stats.delivered],
                ['متعثرة', a.stats.failed],
                ['تحصيلات', a.stats.collectedOrders],
                ['المبلغ المحصّل', formatJOD(a.stats.collectedAmount)],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-subtle px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="font-display text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <section>
            <h3 className="mb-2 text-sm font-semibold">تغييرات حالات الطلبات</h3>
            {!a.events.length ? (
              <p className="text-sm text-muted">لا يوجد نشاط.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {a.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <Link to={`/admin/delivery/orders/${e.order.id}`} className="ltr font-medium hover:underline">
                      {e.order.code ?? `#${e.order.number}`}
                    </Link>
                    {e.fromStatus !== e.toStatus ? <DeliveryStatusTag status={e.toStatus} /> : <span className="text-muted">{e.note}</span>}
                    <span className="ms-auto text-xs text-muted">
                      {formatDate(e.createdAt)} <span className="ltr">{formatTime(e.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">سجل العمليات</h3>
            {!a.logs.length ? (
              <p className="text-sm text-muted">لا يوجد.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
                {a.logs.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 px-3 py-2">
                    <span className="ltr">
                      {l.action} · {l.entity}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDate(l.createdAt)} <span className="ltr">{formatTime(l.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
