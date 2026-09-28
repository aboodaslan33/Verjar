import { useState, type FormEvent } from 'react';
import { LocationPicker } from '../forms/LocationPicker';
import { Alert, Button, Checkbox, Icon, Input, Select, Textarea } from '../ui';
import { ApiError } from '../../lib/api';
import { PAY_LABEL } from '../../lib/delivery';
import { formatJOD } from '../../lib/format';

type Item = { name: string; quantity: string; unitPrice: string };
export type DeliveryOrderPayload = Record<string, unknown>;

/**
 * نموذج طلب التوصيل (المورد والإدارة). الخريطة اختيارية: العنوان النصي يكفي.
 * المبالغ تُحسب في السيرفر؛ هنا ملخص فقط. أجرة التوصيل تُعدَّل من الإدارة فقط (feeEditable).
 */
export function DeliveryOrderForm({
  onSubmit,
  suppliers,
  feeEditable,
  defaultFee,
  submitLabel = 'إنشاء الطلب',
}: {
  onSubmit: (body: DeliveryOrderPayload) => Promise<void>;
  /** للإدارة: اختيار المورد */
  suppliers?: { id: string; name: string }[];
  feeEditable: boolean;
  defaultFee: number;
  submitLabel?: string;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [items, setItems] = useState<Item[]>([{ name: '', quantity: '1', unitPrice: '' }]);
  const [discount, setDiscount] = useState('');
  const [fee, setFee] = useState(String(defaultFee));
  const [customerPaysFee, setCustomerPaysFee] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const products = Math.round(items.reduce((s, it) => s + n(it.quantity) * n(it.unitPrice), 0) * 1000) / 1000;
  const total = Math.max(0, products - n(discount));
  const feeValue = feeEditable ? n(fee) : defaultFee;
  const toCollect = (paymentMethod === 'COD' ? total : 0) + (customerPaysFee ? feeValue : 0);

  const setItem = (i: number, k: keyof Item, v: string) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await onSubmit({
        ...(suppliers ? { supplierId } : {}),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        area: area.trim() || null,
        deliveryLat: lat,
        deliveryLng: lng,
        pickupAddress: pickupAddress.trim() || null,
        items: items.filter((it) => it.name.trim()).map((it) => ({ name: it.name.trim(), quantity: n(it.quantity), unitPrice: n(it.unitPrice) })),
        discount: n(discount),
        ...(feeEditable ? { deliveryFee: n(fee) } : {}),
        customerPaysFee,
        paymentMethod,
        notes: notes.trim() || null,
      });
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, _: Object.keys(err.fields).length ? '' : err.message });
      else setErrors({ _: 'تعذر الحفظ' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        {suppliers && (
          <section className="card p-4 sm:p-5">
            <Select label="المورد" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} error={errors.supplierId}>
              <option value="">اختر المورد</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </section>
        )}

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="text-base">العميل والتسليم</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="اسم العميل" value={customerName} onChange={(e) => setCustomerName(e.target.value)} error={errors.customerName} />
            <Input label="هاتف العميل" type="tel" inputMode="tel" dir="ltr" className="text-end" placeholder="07XXXXXXXX" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} error={errors.customerPhone} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="منطقة التوصيل" value={area} onChange={(e) => setArea(e.target.value)} placeholder="مثال: الجبيهة" error={errors.area} />
            <Input label="عنوان التسليم" wrapperClassName="sm:col-span-2" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة، المنطقة، الشارع، البناية" error={errors.address} />
          </div>
          <LocationPicker lat={lat} lng={lng} onChange={(a, b) => (setLat(a), setLng(b))} hint="اختياري: موقع التسليم على الخريطة يسهّل التنقل للموظف." />
          <Input label="عنوان الاستلام (اتركه فارغًا لاستخدام عنوان المورد)" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} />
        </section>

        <section className="card space-y-3 p-4 sm:p-5">
          <h2 className="text-base">المنتجات</h2>
          {errors.items && <p className="text-sm text-danger">{errors.items}</p>}
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem_auto] items-end gap-2">
              <Input label={i === 0 ? 'الصنف' : ''} aria-label="الصنف" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} error={errors[`items.${i}.name`]} />
              <Input label={i === 0 ? 'العدد' : ''} aria-label="العدد" type="number" min={1} className="ltr text-start" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
              <Input label={i === 0 ? 'السعر' : ''} aria-label="السعر" type="number" min={0} step="0.001" className="ltr text-start" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
              <button
                type="button"
                onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : l))}
                className="mb-1 grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-subtle disabled:opacity-30"
                disabled={items.length === 1}
                aria-label="حذف الصنف"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setItems((l) => [...l, { name: '', quantity: '1', unitPrice: '' }])}>
            <Icon name="plus" className="h-4 w-4" /> إضافة صنف
          </Button>
        </section>

        <Textarea label="ملاحظات (اختياري)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <aside className="space-y-4">
        <section className="card space-y-4 p-4 sm:p-5 lg:sticky lg:top-20">
          <Select label="طريقة الدفع" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="COD">{PAY_LABEL.COD}</option>
            <option value="CLIQ">مدفوع مسبقًا — CliQ</option>
            <option value="BANK_TRANSFER">مدفوع مسبقًا — تحويل بنكي</option>
            <option value="CASH">مدفوع مسبقًا — نقدًا</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="الخصم" type="number" min={0} step="0.001" className="ltr text-start" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            {feeEditable ? (
              <Input label="أجرة التوصيل" type="number" min={0} step="0.001" className="ltr text-start" value={fee} onChange={(e) => setFee(e.target.value)} error={errors.deliveryFee} />
            ) : (
              <div>
                <p className="mb-1.5 text-sm font-medium">أجرة التوصيل</p>
                <p className="flex h-11 items-center rounded-lg bg-subtle px-3 text-sm tabular-nums">{formatJOD(defaultFee)}</p>
              </div>
            )}
          </div>
          <Checkbox label="العميل يدفع أجرة التوصيل" checked={customerPaysFee} onChange={setCustomerPaysFee} />
          <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">قيمة المنتجات</dt>
              <dd className="tabular-nums">{formatJOD(products)}</dd>
            </div>
            {n(discount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">الخصم</dt>
                <dd className="tabular-nums">−{formatJOD(n(discount))}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">أجرة التوصيل</dt>
              <dd className="tabular-nums">{formatJOD(feeValue)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>المطلوب تحصيله</dt>
              <dd className="tabular-nums">{formatJOD(toCollect)}</dd>
            </div>
          </dl>
          <Button type="submit" block size="lg" loading={busy}>
            {submitLabel}
          </Button>
        </section>
      </aside>
    </form>
  );
}
