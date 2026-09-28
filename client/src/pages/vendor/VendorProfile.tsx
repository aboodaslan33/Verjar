import { useRef, useState, type FormEvent } from 'react';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { AdminPage, DetailSkeleton, Panel } from '../../components/admin/ui';
import { LocationPicker } from '../../components/forms/LocationPicker';
import { Button, ErrorState, Icon, Input, Textarea } from '../../components/ui';
import { useAuth } from '../../context/Auth';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';
import type { VendorMe, VendorProfile as Profile } from './types';

export default function VendorProfile() {
  useDocumentTitle('ملف المتجر');
  const q = useAdminQuery(() => api.get<VendorMe>('/vendor/me'), []);
  if (q.loading) return <DetailSkeleton />;
  if (q.error || !q.data) return <ErrorState message={q.error?.message ?? ''} onRetry={q.retry} />;
  return <Form key={q.data.vendor.id} profile={q.data.vendor} />;
}

function Form({ profile }: { profile: Profile }) {
  const { refresh } = useAuth();
  const m = useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description);
  const [logo, setLogo] = useState(profile.logoUrl);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [pickupAddress, setPickupAddress] = useState(profile.pickupAddress ?? '');
  const [lat, setLat] = useState<number | null>(profile.pickupLat);
  const [lng, setLng] = useState<number | null>(profile.pickupLng);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      description: description.trim(),
      phone: phone.trim() || null,
      pickupAddress: pickupAddress.trim() || null,
      pickupLat: lat,
      pickupLng: lng,
    };
    const r = await m.run('save', () => api.patch<Profile>('/vendor/me', body), 'تم حفظ ملف المتجر');
    if (r) refresh();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await m.run('logo', () => api.post<Profile>('/vendor/me/logo', fd), 'تم تحديث الشعار');
    if (r) setLogo(r.logoUrl);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeLogo = async () => {
    const r = await m.run('logo', () => api.del<Profile>('/vendor/me/logo'), 'تم حذف الشعار');
    if (r) setLogo(null);
  };

  return (
    <AdminPage
      title="ملف المتجر"
      description="يظهر للزوار في صفحة متجرك وتحت كل منتج"
      actions={
        <a href={`/store/vendor/${profile.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <Icon name="external" className="h-4 w-4" /> عرض صفحة المتجر
        </a>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="البيانات" className="lg:col-span-2">
          <form onSubmit={save} className="space-y-4" noValidate>
            <Input label="اسم المتجر" value={name} onChange={(e) => setName(e.target.value)} error={m.fieldErrors.name} />
            <Textarea
              label="وصف المتجر"
              optional
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={m.fieldErrors.description}
              hint="عرّف الزوار بمتجرك: ماذا تبيع، ومن أين، ومدة التوصيل."
            />
            <div className="space-y-4 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">بيانات الاستلام لطلبات التوصيل</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="هاتف المتجر" optional type="tel" inputMode="tel" dir="ltr" className="text-end" value={phone} onChange={(e) => setPhone(e.target.value)} error={m.fieldErrors.phone} />
                <Input label="عنوان الاستلام" optional value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} error={m.fieldErrors.pickupAddress} />
              </div>
              <LocationPicker lat={lat} lng={lng} onChange={(a, b) => (setLat(a), setLng(b))} hint="اختياري: يساعد موظف التوصيل على الوصول لمتجرك." />
            </div>
            <Button type="submit" loading={m.pending === 'save'} disabled={name.trim().length < 2}>
              حفظ
            </Button>
          </form>
        </Panel>
        <Panel title="الشعار">
          <div className="flex flex-col items-center gap-4">
            <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-2xl border border-line bg-subtle">
              {logo ? <img src={logo} alt="شعار المتجر" className="h-full w-full object-cover" /> : <Icon name="image" className="h-8 w-8 text-muted" />}
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-subtle">
                {m.pending === 'logo' ? 'جاري الرفع…' : logo ? 'تغيير الشعار' : 'رفع شعار'}
              </span>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" disabled={m.busy} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {logo && (
              <button type="button" onClick={removeLogo} disabled={m.busy} className="text-sm text-danger hover:underline">
                حذف الشعار
              </button>
            )}
            <p className="text-center text-xs text-muted">صورة مربعة JPG أو PNG حتى 5MB</p>
          </div>
        </Panel>
      </div>
    </AdminPage>
  );
}
