import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { NotificationsBell } from '../../components/NotificationsBell';
import { Logo } from '../../components/layout/Logo';
import { DeliveryStatusTag } from '../../components/delivery/Tags';
import { SignaturePad } from '../../components/delivery/SignaturePad';
import { Alert, Button, ButtonA, EmptyState, ErrorState, Icon, Input, Modal, PageLoader, Select, Skeleton, Textarea } from '../../components/ui';
import { isDriverUser, useAuth } from '../../context/Auth';
import { useToast } from '../../context/ToastContext';
import { ApiError, api, toFormData } from '../../lib/api';
import { FAILURES, STATUS_LABEL, currentPosition, navigateUrl, type DeliveryStatus } from '../../lib/delivery';
import { cx, displayPhone, formatDate, formatJOD, formatTime } from '../../lib/format';
import { LangSwitch } from '../../lib/i18n';
import { useDocumentTitle } from '../../lib/useAsync';

/**
 * لوحة موظف التوصيل: مصممة للجوال أولًا — قائمة طلباته، وفي كل طلب زر واحد كبير للخطوة التالية.
 * تستخدم نفس واجهة /api/v1/driver التي يستطيع تطبيق الجوال استخدامها لاحقًا.
 */

type DriverOrder = {
  id: string;
  code: string | null;
  number: number;
  deliveryStatus: DeliveryStatus;
  customerName: string;
  phone: string | null;
  address: string | null;
  area: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  pickupAddress: string | null;
  pickupPhone: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  supplierName: string | null;
  notes: string | null;
  deliveryNote: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  deliveryFee: number;
  customerPaysFee: boolean;
  paymentMethod: string | null;
  amountToCollect: number;
  codCollected: number | null;
  codStatus: 'PENDING' | 'COLLECTED' | 'SETTLED' | null;
  createdAt: string;
  deliveredAt: string | null;
  accepted: boolean;
  items: { name: string; variant?: string | null; quantity: number }[];
  proof: { recipientName: string; deliveredAt: string } | null;
};

type Me = { driver: { id: string; name: string }; active: number; deliveredToday: number; cashInHand: number; cashOrders: number; rules: { otpRequired: boolean; photoRequired: boolean } };

export default function DriverApp() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login?next=/driver" replace />;
  if (!isDriverUser(user)) return <Navigate to={user.role === 'CUSTOMER' ? '/account' : '/admin'} replace />;
  return (
    <div className="min-h-screen bg-subtle/50 pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3">
          <Logo to="/driver" className="[&_svg]:h-7" />
          <span className="ms-auto hidden max-w-[9rem] truncate text-sm font-medium sm:block">{user.name}</span>
          <NotificationsBell hrefFor={(n) => (n.orderId ? `/driver/orders/${n.orderId}` : null)} />
          <LangSwitch className="grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold text-muted hover:bg-subtle" />
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-subtle"
            aria-label="خروج"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
        <nav className="mx-auto flex max-w-2xl gap-1 px-3" aria-label="أقسام لوحة التوصيل">
          {[
            { to: '/driver', label: 'طلباتي', end: true },
            { to: '/driver/history', label: 'السجل' },
          ].map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('flex h-11 flex-1 items-center justify-center border-b-2 text-[15px] font-medium', isActive ? 'border-primary text-ink' : 'border-transparent text-muted')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-3 py-4">
        <Routes>
          <Route index element={<OrdersList scope="active" />} />
          <Route path="history" element={<OrdersList scope="history" />} />
          <Route path="orders/:id" element={<OrderScreen />} />
          <Route path="*" element={<Navigate to="/driver" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ───────────── قائمة الطلبات ─────────────

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'تعذر التحميل'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
    // تحديث تلقائي كل دقيقة وعند العودة للتطبيق (طلبات جديدة تُسند)
    const t = setInterval(load, 60_000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);
  return { data, error, reload: load, setData };
}

function OrdersList({ scope }: { scope: 'active' | 'history' }) {
  useDocumentTitle(scope === 'active' ? 'طلباتي' : 'سجل التوصيل');
  const me = useLoad(() => api.get<Me>('/driver/me'), []);
  const list = useLoad(() => api.get<DriverOrder[]>('/driver/orders', { scope }), [scope]);

  return (
    <div className="space-y-4">
      {scope === 'active' && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="طلبات جارية" value={me.data?.active} />
          <Stat label="سُلّمت اليوم" value={me.data?.deliveredToday} />
          <Stat label="نقد بحوزتي" value={me.data ? formatJOD(me.data.cashInHand) : undefined} />
        </div>
      )}
      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : !list.data.length ? (
        <EmptyState title={scope === 'active' ? 'لا توجد طلبات مسندة إليك الآن' : 'لا يوجد سجل بعد'} description={scope === 'active' ? 'تصلك الطلبات هنا فور إسنادها، مع إشعار.' : undefined} />
      ) : (
        <ul className="space-y-3">
          {list.data.map((o) => (
            <li key={o.id}>
              <OrderCard o={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value ?? '…'}</p>
    </div>
  );
}

function OrderCard({ o }: { o: DriverOrder }) {
  const beforePickup = ['PICKUP_ASSIGNED', 'RESCHEDULED'].includes(o.deliveryStatus);
  return (
    <Link to={`/driver/orders/${o.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-colors active:bg-subtle">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold ltr text-start">{o.code ?? `#${o.number}`}</p>
          <p className="text-xs text-muted">{formatDate(o.createdAt)}</p>
        </div>
        <DeliveryStatusTag status={o.deliveryStatus} />
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {beforePickup && (
          <Row icon="store" label="الاستلام من">
            {o.supplierName ?? '—'}
            {o.pickupAddress ? ` — ${o.pickupAddress}` : ''}
          </Row>
        )}
        <Row icon="user" label="العميل">
          {o.customerName}
        </Row>
        {o.address && (
          <Row icon="pin" label="التسليم">
            {o.area ? `${o.area} — ` : ''}
            {o.address}
          </Row>
        )}
      </dl>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-subtle px-3 py-2">
        <span className="text-sm text-muted">المطلوب تحصيله</span>
        <b className="font-display text-lg tabular-nums">{formatJOD(o.amountToCollect)}</b>
      </div>
    </Link>
  );
}

function Row({ icon, label, children }: { icon: 'store' | 'user' | 'pin' | 'phone'; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// ───────────── شاشة الطلب ─────────────

type Sheet = null | 'deliver' | 'collect' | 'fail';

function OrderScreen() {
  const { id } = useParams();
  const toast = useToast();
  const { data: o, error, reload, setData } = useLoad(() => api.get<DriverOrder>(`/driver/orders/${id}`), [id]);
  const me = useLoad(() => api.get<Me>('/driver/me'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  useDocumentTitle(o?.code ?? 'طلب');

  if (error && !o) return <ErrorState message={error} onRetry={reload} />;
  if (!o) return <Skeleton className="h-96 rounded-2xl" />;

  const act = async (label: string, fn: () => Promise<DriverOrder>) => {
    setBusy(label);
    try {
      setData(await fn());
      toast.toast('تم التحديث');
    } catch (e) {
      toast.toast(e instanceof Error ? e.message : 'تعذر التحديث', 'error');
    } finally {
      setBusy(null);
    }
  };
  const move = async (status: DeliveryStatus, note?: string) => {
    const pos = await currentPosition(4000);
    return api.post<DriverOrder>(`/driver/orders/${o.id}/status`, { status, note: note ?? null, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
  };

  const s = o.deliveryStatus;
  const canFail = ['PICKUP_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'].includes(s);
  const needsCollect = s === 'DELIVERED' && o.amountToCollect > 0 && o.codStatus === 'PENDING';
  const primary: { label: string; onClick: () => void } | null =
    s === 'PICKUP_ASSIGNED'
      ? { label: 'استلمت الطلب', onClick: () => act('pick', () => move('PICKED_UP')) }
      : s === 'PICKED_UP' || s === 'RESCHEDULED'
        ? { label: 'بدأت التوصيل', onClick: () => act('go', () => move('IN_TRANSIT')) }
        : s === 'IN_TRANSIT'
          ? { label: 'وصلت للعميل', onClick: () => act('arrive', () => move('ARRIVED')) }
          : s === 'ARRIVED'
            ? { label: 'تم التسليم', onClick: () => setSheet('deliver') }
            : needsCollect
              ? { label: 'تم تحصيل المبلغ', onClick: () => setSheet('collect') }
              : null;

  const pickupNav = navigateUrl({ lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress });
  const deliveryNav = navigateUrl({ lat: o.deliveryLat, lng: o.deliveryLng, address: o.address });

  return (
    <div className="space-y-3 pb-28">
      <Link to="/driver" className="inline-flex items-center gap-1 text-sm text-muted">
        <Icon name="chevronRight" className="h-4 w-4" /> طلباتي
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="ltr text-start text-xl">{o.code ?? `#${o.number}`}</h1>
          <p className="text-sm text-muted">
            {formatDate(o.createdAt)} · <span className="ltr">{formatTime(o.createdAt)}</span>
          </p>
        </div>
        <DeliveryStatusTag status={s} />
      </div>

      {s === 'PICKUP_ASSIGNED' && !o.accepted && (
        <Alert tone="info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>طلب جديد مسند إليك.</span>
            <Button size="sm" loading={busy === 'accept'} onClick={() => act('accept', () => api.post<DriverOrder>(`/driver/orders/${o.id}/accept`))}>
              قبول الطلب
            </Button>
          </div>
        </Alert>
      )}

      {/* المبلغ المطلوب — أوضح شيء في الشاشة */}
      <section className="rounded-2xl bg-ink p-4 text-bg">
        <p className="text-sm opacity-75">المبلغ المطلوب تحصيله</p>
        <p className="font-display text-3xl font-bold tabular-nums">{formatJOD(o.amountToCollect)}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs opacity-80">
          <div>
            <dt>المنتجات</dt>
            <dd className="tabular-nums">{formatJOD(o.total)}</dd>
          </div>
          <div>
            <dt>أجرة التوصيل</dt>
            <dd className="tabular-nums">{formatJOD(o.deliveryFee)}</dd>
          </div>
          <div>
            <dt>الخصم</dt>
            <dd className="tabular-nums">{formatJOD(o.discountTotal)}</dd>
          </div>
        </dl>
        {o.codCollected != null && (
          <p className="mt-2 text-sm">
            المحصّل: <b className="tabular-nums">{formatJOD(o.codCollected)}</b>
          </p>
        )}
      </section>

      <Card title="الاستلام من المورد" icon="store">
        <p className="font-medium">{o.supplierName ?? '—'}</p>
        {o.pickupAddress && <p className="mt-0.5 text-sm text-muted">{o.pickupAddress}</p>}
        <Actions phone={o.pickupPhone} nav={pickupNav} />
      </Card>

      <Card title="التسليم للعميل" icon="user">
        <p className="font-medium">{o.customerName}</p>
        {o.address && (
          <p className="mt-0.5 text-sm text-muted">
            {o.area ? `${o.area} — ` : ''}
            {o.address}
          </p>
        )}
        <Actions phone={o.phone} nav={deliveryNav} />
      </Card>

      <Card title={`المنتجات (${o.items.reduce((n, i) => n + i.quantity, 0)})`} icon="bag">
        <ul className="space-y-1 text-sm">
          {o.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.name}
                {it.variant && <span className="text-muted"> ({it.variant})</span>}
              </span>
              <span className="tabular-nums text-muted">× {it.quantity}</span>
            </li>
          ))}
        </ul>
      </Card>

      {(o.notes || o.deliveryNote) && (
        <Card title="ملاحظات" icon="info">
          {o.notes && <p className="whitespace-pre-line text-sm">{o.notes}</p>}
          {o.deliveryNote && <p className="mt-1 whitespace-pre-line text-sm text-muted">{o.deliveryNote}</p>}
        </Card>
      )}

      {o.proof && (
        <Card title="إثبات التسليم" icon="check">
          <p className="text-sm">
            المستلم: <b>{o.proof.recipientName}</b> · {formatDate(o.proof.deliveredAt)} <span className="ltr">{formatTime(o.proof.deliveredAt)}</span>
          </p>
        </Card>
      )}

      {/* أزرار الإجراء ثابتة أسفل الشاشة */}
      {(primary || canFail) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            {primary && (
              <Button size="lg" className="flex-1" loading={busy !== null && busy !== 'accept'} onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
            {canFail && (
              <Button size="lg" variant="outline" className={primary ? '' : 'flex-1'} onClick={() => setSheet('fail')}>
                تعذر التسليم
              </Button>
            )}
          </div>
        </div>
      )}

      {sheet === 'deliver' && <DeliverSheet order={o} rules={me.data?.rules} onClose={() => setSheet(null)} onDone={(u) => (setData(u), setSheet(null))} />}
      {sheet === 'collect' && <CollectSheet order={o} onClose={() => setSheet(null)} onDone={(u) => (setData(u), setSheet(null))} />}
      {sheet === 'fail' && (
        <FailSheet
          onClose={() => setSheet(null)}
          onSubmit={(status, note) =>
            act('fail', async () => {
              const u = await move(status, note);
              setSheet(null);
              return u;
            })
          }
          busy={busy === 'fail'}
        />
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: 'store' | 'user' | 'bag' | 'info' | 'check'; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
        <Icon name={icon} className="h-4 w-4" /> {title}
      </h2>
      {children}
    </section>
  );
}

/** اتصال وتنقل بضغطة واحدة */
function Actions({ phone, nav }: { phone: string | null; nav: string | null }) {
  if (!phone && !nav) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {phone && (
        <ButtonA href={`tel:${phone.startsWith('962') ? `+${phone}` : phone}`} variant="outline" size="md">
          <Icon name="phone" className="h-4 w-4" /> <span className="ltr">{displayPhone(phone)}</span>
        </ButtonA>
      )}
      {nav && (
        <ButtonA href={nav} target="_blank" rel="noopener noreferrer" variant="outline" size="md">
          <Icon name="navigation" className="h-4 w-4" /> التنقل
        </ButtonA>
      )}
    </div>
  );
}

// ───────────── تم التسليم (إثبات التسليم) ─────────────

function DeliverSheet({ order, rules, onClose, onDone }: { order: DriverOrder; rules?: Me['rules']; onClose: () => void; onDone: (o: DriverOrder) => void }) {
  const toast = useToast();
  const [recipient, setRecipient] = useState(order.customerName);
  const [amount, setAmount] = useState(String(order.amountToCollect));
  const [method, setMethod] = useState('CASH');
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState<string[] | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    currentPosition().then(setPos);
  }, []);

  const sendOtp = async () => {
    try {
      const r = await api.post<{ channels: string[] }>(`/driver/orders/${order.id}/otp`);
      setOtpSent(r.channels);
      toast.toast(r.channels.length ? 'أُرسل الرمز للعميل' : 'لا توجد قناة لإرسال الرمز لهذا العميل', r.channels.length ? 'success' : 'error');
    } catch (e) {
      toast.toast(e instanceof Error ? e.message : 'تعذر الإرسال', 'error');
    }
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    const p = pos && pos !== 'loading' ? pos : null;
    const data = {
      recipientName: recipient.trim(),
      signature,
      otp: otp.trim() || null,
      amountCollected: order.amountToCollect > 0 ? Number(amount) : null,
      method,
      lat: p?.lat ?? null,
      lng: p?.lng ?? null,
      accuracy: p?.accuracy ?? null,
    };
    try {
      onDone(await api.post<DriverOrder>(`/driver/orders/${order.id}/deliver`, toFormData(data, { photo })));
      toast.toast('تم تسجيل التسليم');
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: Object.keys(e.fields).length ? '' : e.message });
      else setErrors({ _: 'تعذر الحفظ' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تم التسليم — إثبات التسليم"
      size="lg"
      footer={
        <Button size="lg" block loading={busy} onClick={submit}>
          تأكيد التسليم
        </Button>
      }
    >
      <div className="space-y-4">
        {errors._ && <Alert tone="error">{errors._}</Alert>}
        <Input label="اسم مستلم الطلب" value={recipient} onChange={(e) => setRecipient(e.target.value)} error={errors.recipientName} />

        {order.amountToCollect > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`المبلغ المحصّل (المطلوب ${formatJOD(order.amountToCollect)})`}
              type="number"
              inputMode="decimal"
              min={0}
              max={order.amountToCollect}
              step="0.001"
              className="ltr text-start"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={errors.amountCollected}
            />
            <Select label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">نقدًا</option>
              <option value="CLIQ">CliQ</option>
              <option value="CARD">بطاقة</option>
            </Select>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium">توقيع العميل</p>
          <SignaturePad onChange={setSignature} />
          {errors.signature && <p className="mt-1 text-sm text-danger">{errors.signature}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">
            رمز التحقق (OTP){rules?.otpRequired ? '' : ' — اختياري'}
          </p>
          <div className="flex gap-2">
            <Input
              label="الرمز من العميل"
              inputMode="numeric"
              maxLength={4}
              className="ltr text-start"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              error={errors.otp}
            />
            <Button variant="outline" className="mt-6 shrink-0" onClick={sendOtp}>
              إرسال رمز للعميل
            </Button>
          </div>
          {otpSent && otpSent.length === 0 && <p className="mt-1 text-sm text-muted">العميل ليس لديه حساب ولا واتساب مفعّل — استخدم التوقيع أو الصورة.</p>}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">صورة إثبات التسليم{rules?.photoRequired ? '' : ' — اختياري'}</span>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          {errors.photo && <span className="mt-1 block text-sm text-danger">{errors.photo}</span>}
        </label>

        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="gps" className="h-4 w-4" />
          {pos === 'loading' ? 'جاري تحديد الموقع…' : pos ? `تم تسجيل الموقع (دقة ${pos.accuracy} م)` : 'الموقع غير متاح — سيُحفظ التسليم بدونه'}
        </p>
      </div>
    </Modal>
  );
}

function CollectSheet({ order, onClose, onDone }: { order: DriverOrder; onClose: () => void; onDone: (o: DriverOrder) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(order.amountToCollect));
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    try {
      onDone(await api.post<DriverOrder>(`/driver/orders/${order.id}/collect`, { amount: Number(amount), method }));
      toast.toast('تم تسجيل التحصيل');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="تم تحصيل المبلغ"
      footer={
        <Button size="lg" block loading={busy} onClick={submit}>
          تأكيد التحصيل
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Input label={`المبلغ (المطلوب ${formatJOD(order.amountToCollect)})`} type="number" inputMode="decimal" className="ltr text-start" value={amount} onChange={(e) => setAmount(e.target.value)} error={error} />
        <Select label="طريقة الدفع" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="CASH">نقدًا</option>
          <option value="CLIQ">CliQ</option>
          <option value="CARD">بطاقة</option>
        </Select>
      </div>
      <p className="mt-3 text-sm text-muted">يُسجَّل التحصيل مرة واحدة؛ أي تصحيح بعدها يتم من الإدارة.</p>
    </Modal>
  );
}

function FailSheet({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (s: DeliveryStatus, note: string) => void; busy: boolean }) {
  const [status, setStatus] = useState<DeliveryStatus>('CUSTOMER_NOT_AVAILABLE');
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title="تعذر التسليم"
      footer={
        <Button size="lg" block variant="danger" loading={busy} disabled={note.trim().length < 3} onClick={() => onSubmit(status, note.trim())}>
          تسجيل
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {FAILURES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={cx('rounded-xl border px-3 py-3 text-sm font-medium', status === f ? 'border-ink bg-ink text-bg' : 'border-line bg-surface')}
            >
              {STATUS_LABEL[f]}
            </button>
          ))}
        </div>
        <Textarea label="السبب / ملاحظة" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: الهاتف مغلق، حاولت 3 مرات" />
      </div>
    </Modal>
  );
}
