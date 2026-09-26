import { useState, type FormEvent } from 'react';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import type { Technician } from '../../components/admin/types';
import { AdminPage, Switch } from '../../components/admin/ui';
import { Button, Checkbox, Icon, Input, Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Technicians() {
  useDocumentTitle('الفنيون');
  const q = useAdminQuery(() => api.get<Technician[]>('/admin/technicians'), []);
  const m = useMutation();
  const [editing, setEditing] = useState<Technician | 'new' | null>(null);

  const toggleActive = async (t: Technician) => {
    const r = await m.run(`act-${t.id}`, () => api.patch<Technician>(`/admin/technicians/${t.id}`, { active: !t.active }), t.active ? 'تم إيقاف الفني' : 'تم تفعيل الفني');
    if (r) q.setData((d) => d?.map((x) => (x.id === t.id ? { ...x, active: r.active } : x)) ?? d);
  };

  const columns: Column<Technician>[] = [
    { key: 'name', header: 'الاسم', cell: (t) => <span className="font-medium">{t.name}</span> },
    { key: 'phone', header: 'الهاتف', cell: (t) => <a href={`tel:${t.phone}`} className="ltr hover:underline">{t.phone}</a> },
    { key: 'spec', header: 'التخصص', cell: (t) => t.specialty || <span className="text-muted">—</span> },
    { key: 'load', header: 'مهام جارية', cell: (t) => <span className="tabular-nums">{t.activeBookings ?? 0}</span>, align: 'center' },
    {
      key: 'active',
      header: 'فعّال',
      cell: (t) => <Switch label="فعّال" checked={t.active} disabled={m.pending === `act-${t.id}`} onChange={() => toggleActive(t)} />,
    },
    {
      key: 'edit',
      header: '',
      align: 'end',
      cell: (t) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
          تعديل
        </Button>
      ),
    },
  ];

  return (
    <AdminPage
      title="الفنيون"
      description="الفنيون الذين يُعيَّنون على الحجوزات"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Icon name="plus" className="h-4 w-4" /> فني جديد
        </Button>
      }
    >
      <DataTable
        rows={q.data}
        columns={columns}
        rowKey={(t) => t.id}
        loading={q.loading}
        error={q.error}
        onRetry={q.retry}
        rowClassName={(t) => (!t.active ? 'opacity-60' : undefined)}
        empty={{
          title: 'لا يوجد فنيون',
          action: (
            <Button size="sm" onClick={() => setEditing('new')}>
              إضافة فني
            </Button>
          ),
        }}
      />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'فني جديد' : 'تعديل الفني'} size="sm">
        {editing !== null && (
          <TechForm
            tech={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              q.reload();
            }}
          />
        )}
      </Modal>
    </AdminPage>
  );
}

function TechForm({ tech, onSaved }: { tech: Technician | null; onSaved: () => void }) {
  const m = useMutation();
  const [name, setName] = useState(tech?.name ?? '');
  const [phone, setPhone] = useState(tech?.phone ?? '');
  const [specialty, setSpecialty] = useState(tech?.specialty ?? '');
  const [active, setActive] = useState(tech?.active ?? true);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), phone: phone.trim(), specialty: specialty.trim() || null, active };
    const r = await m.run(
      'save',
      () => (tech ? api.patch(`/admin/technicians/${tech.id}`, body) : api.post('/admin/technicians', body)),
      tech ? 'تم حفظ الفني' : 'تمت إضافة الفني',
    );
    if (r) onSaved();
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} error={m.fieldErrors.name} autoFocus />
      <Input label="رقم الهاتف" type="tel" dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} error={m.fieldErrors.phone} />
      <Input label="التخصص" optional value={specialty} onChange={(e) => setSpecialty(e.target.value)} error={m.fieldErrors.specialty} placeholder="مثال: دهان وديكور" />
      <Checkbox label="فعّال" description="يظهر في قائمة التعيين على الحجوزات" checked={active} onChange={setActive} />
      <Button type="submit" block loading={m.pending === 'save'}>
        حفظ
      </Button>
    </form>
  );
}
