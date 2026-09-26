import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminMap } from '../../components/admin/AdminMap';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { FileUploadForm } from '../../components/admin/FileUploadForm';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import { URGENCY_LABEL, ZONE_LABEL, numOrNull } from '../../components/admin/labels';
import { MediaGallery } from '../../components/admin/MediaGallery';
import { PaymentForm } from '../../components/admin/PaymentForm';
import { FilesList, PaymentsList, WhatsAppLogList } from '../../components/admin/RecordLists';
import { StatusSelect } from '../../components/admin/StatusSelect';
import type { BookingDetail as Booking, Technician, WaResult } from '../../components/admin/types';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { WhatsAppFallback } from '../../components/admin/WhatsAppFallback';
import { Button, ButtonA, Checkbox, ErrorState, Icon, Input, Select, Skeleton, StatusBadge, Tag, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import {
  BOOKING_TYPE_LABEL,
  DETAIL_LABELS,
  cx,
  displayPhone,
  formatDate,
  formatDetail,
  formatJOD,
  formatSlot,
  todayAmman,
} from '../../lib/format';
import type { DaySlots, RequestStatus } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function BookingDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useAdminQuery(() => api.get<Booking>(`/admin/bookings/${id}`), [id]);
  const techs = useAdminQuery(() => api.get<Technician[]>('/admin/technicians'), []);
  const [wa, setWa] = useState<{ result: WaResult; label: string } | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const m = useMutation();
  const b = q.data;
  useDocumentTitle(b ? `حجز #${b.number}` : 'حجز');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !b)
    return (
      <AdminPage title="الحجز" back={{ to: '/admin/bookings', label: 'الحجوزات' }}>
        <ErrorState message={q.error?.message ?? 'الحجز غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const resend = async (to: 'admin' | 'customer') => {
    const r = await m.run(`wa-${to}`, () => api.post<{ link: string; sent: boolean }>(`/admin/bookings/${b.id}/whatsapp`, { to }));
    if (r) {
      setWa({ result: r, label: to === 'admin' ? 'فتح رسالة الإدارة في واتساب' : 'إرسال للعميل عبر واتساب' });
      q.reload();
    }
  };

  const del = async () => {
    const r = await m.run('delete', () => api.del(`/admin/bookings/${b.id}`), 'تم حذف الحجز');
    if (r) navigate('/admin/bookings', { replace: true });
  };

  const details = Object.entries(b.details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <AdminPage
      back={{ to: '/admin/bookings', label: 'الحجوزات' }}
      title={
        <>
          حجز #{b.number} <span className="text-lg font-normal text-muted">· {BOOKING_TYPE_LABEL[b.type]}</span>
        </>
      }
      meta={
        <>
          <StatusBadge status={b.status} />
          {b.urgency === 'EMERGENCY' && <Tag tone="danger">طارئ</Tag>}
          {b.urgency === 'URGENT' && <Tag tone="brand">عاجل</Tag>}
          <span className="text-xs text-muted">
            المرجع <span className="ltr">{b.ref}</span> · أُنشئ {formatDate(b.createdAt, true)}
          </span>
        </>
      }
      actions={
        <>
          <ButtonA href={`tel:+${b.phone}`} variant="outline" size="sm">
            <Icon name="phone" className="h-4 w-4" /> اتصال
          </ButtonA>
          <ButtonA href={`https://wa.me/${b.phone}`} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm">
            <Icon name="whatsapp" className="h-4 w-4" /> واتساب
          </ButtonA>
        </>
      }
    >
      {wa && (
        <div className="mb-4">
          <WhatsAppFallback result={wa.result} label={wa.label} onDismiss={() => setWa(null)} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="بيانات الحجز">
            <DefList
              items={[
                ['الاسم', <Link to={`/admin/customers/${b.customerId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200">{b.name}</Link>],
                ['الهاتف', <span className="ltr">{displayPhone(b.phone)}</span>],
                ['الموعد', <span className="font-semibold">{formatDate(b.scheduledAt, true)}</span>],
                ['الفني', b.technician ? `${b.technician.name}${b.technician.specialty ? ` — ${b.technician.specialty}` : ''}` : 'غير معيّن'],
                ['الأولوية', URGENCY_LABEL[b.urgency]],
                b.zone && ['المنطقة', ZONE_LABEL[b.zone]],
                b.floor && ['الطابق', b.floor],
                b.inspectionFee != null && ['رسوم الكشف', formatJOD(b.inspectionFee)],
                ['المبلغ المسعّر', b.quotedAmount != null ? <span className="font-semibold">{formatJOD(b.quotedAmount)}</span> : 'لم يُسعّر بعد'],
              ]}
            />
            {details.length > 0 && (
              <>
                <h3 className="mb-3 mt-6 border-t border-line pt-4 text-sm font-semibold text-muted">تفاصيل {BOOKING_TYPE_LABEL[b.type]}</h3>
                <DefList
                  items={details.map(([k, v]) => [
                    DETAIL_LABELS[k] ?? k,
                    <span className={cx(String(v).length > 60 && 'whitespace-pre-line')}>{formatDetail(k, v)}</span>,
                  ])}
                />
              </>
            )}
            {b.notes && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-xs text-muted">ملاحظات العميل</p>
                <p className="mt-1 whitespace-pre-line">{b.notes}</p>
              </div>
            )}
          </Panel>

          <Panel title={`المرفقات (${b.media.length})`}>
            <MediaGallery media={b.media} />
          </Panel>

          <Panel title="الموقع">
            <AdminMap lat={b.lat} lng={b.lng} address={b.locationText} label={b.name} />
          </Panel>

          <Panel title="ملفات التقييم وعروض الأسعار">
            <FilesList files={b.quoteFiles} onDeleted={() => q.reload()} />
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-semibold">رفع ملف جديد</h3>
              <FileUploadForm
                target={{ bookingId: b.id }}
                kinds={['EVALUATION', 'QUOTE', 'INVOICE', 'OTHER']}
                defaultKind={b.type === 'INSPECTION' ? 'EVALUATION' : 'QUOTE'}
                onUploaded={() => q.reload()}
              />
            </div>
          </Panel>

          <Panel
            title="الدفعات"
            actions={
              !showPay && (
                <Button size="sm" variant="outline" onClick={() => setShowPay(true)}>
                  <Icon name="plus" className="h-4 w-4" /> إضافة دفعة
                </Button>
              )
            }
          >
            {showPay && (
              <div className="mb-4 rounded-xl border border-line bg-subtle/40 p-4">
                <PaymentForm
                  customerId={b.customerId}
                  bookingId={b.id}
                  onCancel={() => setShowPay(false)}
                  onSaved={() => {
                    setShowPay(false);
                    q.reload();
                  }}
                />
              </div>
            )}
            <PaymentsList payments={b.payments} onDeleted={() => q.reload()} />
            {b.payments.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-sm">
                مجموع المدفوع لهذا الحجز: <b>{formatJOD(b.payments.reduce((s, p) => s + p.amount, 0))}</b>
              </p>
            )}
          </Panel>

          <Panel title="سجل واتساب">
            <WhatsAppLogList logs={b.whatsappLogs} />
          </Panel>
        </div>

        <div className="space-y-6">
          <ManagePanel
            key={b.updatedAt}
            booking={b}
            techs={techs.data ?? []}
            onSaved={(r) => {
              if (r) setWa({ result: r, label: 'إرسال للعميل عبر واتساب' });
              q.reload();
            }}
          />
          <ReschedulePanel
            key={`r-${b.updatedAt}`}
            booking={b}
            onSaved={(r) => {
              if (r) setWa({ result: r, label: 'إرسال للعميل عبر واتساب' });
              q.reload();
            }}
          />
          <Panel title="واتساب">
            <p className="mb-3 text-sm text-muted">إعادة إرسال رسالة الحجز الأصلية.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={m.pending === 'wa-admin'} onClick={() => resend('admin')}>
                للإدارة
              </Button>
              <Button size="sm" variant="outline" loading={m.pending === 'wa-customer'} onClick={() => resend('customer')}>
                للعميل
              </Button>
            </div>
          </Panel>
          <Panel title="حذف الحجز">
            <p className="mb-3 text-sm text-muted">يُخفى الحجز من القوائم ويمكن استرجاعه من قاعدة البيانات عند الحاجة.</p>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" className="h-4 w-4" /> حذف الحجز
            </Button>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`حذف الحجز #${b.number}`}
        confirmLabel="حذف"
        loading={m.pending === 'delete'}
        onClose={() => setConfirmDelete(false)}
        onConfirm={del}
      >
        هل تريد حذف حجز {b.name}؟ لن يظهر بعد الآن في القوائم أو التقويم.
      </ConfirmDialog>
    </AdminPage>
  );
}

function ManagePanel({ booking: b, techs, onSaved }: { booking: Booking; techs: Technician[]; onSaved: (wa: WaResult) => void }) {
  const m = useMutation();
  const [status, setStatus] = useState<RequestStatus>(b.status);
  const [technicianId, setTechnicianId] = useState(b.technicianId ?? '');
  const [quoted, setQuoted] = useState(b.quotedAmount != null ? String(b.quotedAmount) : '');
  const [notes, setNotes] = useState(b.adminNotes ?? '');
  const [urgency, setUrgency] = useState(b.urgency);
  const [notify, setNotify] = useState(true);

  const body: Record<string, unknown> = {};
  if (status !== b.status) body.status = status;
  if ((technicianId || null) !== b.technicianId) body.technicianId = technicianId || null;
  if (numOrNull(quoted) !== b.quotedAmount) body.quotedAmount = numOrNull(quoted);
  if ((notes.trim() || null) !== (b.adminNotes || null)) body.adminNotes = notes.trim() || null;
  if (urgency !== b.urgency) body.urgency = urgency;
  const dirty = Object.keys(body).length > 0;

  const save = async () => {
    const r = await m.run(
      'save',
      () => api.patch<{ whatsapp: WaResult }>(`/admin/bookings/${b.id}`, { ...body, notify }),
      'تم حفظ التعديلات',
    );
    if (r) onSaved(r.whatsapp);
  };

  const activeTechs = techs.filter((t) => t.active || t.id === b.technicianId);

  return (
    <Panel title="إدارة الحجز">
      <div className="space-y-4">
        <StatusSelect value={status} onChange={setStatus} />
        <Select label="الفني" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} error={m.fieldErrors.technicianId}>
          <option value="">غير معيّن</option>
          {activeTechs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.specialty ? ` — ${t.specialty}` : ''}
            </option>
          ))}
        </Select>
        <Select label="الأولوية" value={urgency} onChange={(e) => setUrgency(e.target.value as Booking['urgency'])}>
          <option value="NORMAL">عادي</option>
          <option value="URGENT">عاجل</option>
          <option value="EMERGENCY">طارئ</option>
        </Select>
        <Input
          label="المبلغ المسعّر (د.أ)"
          optional
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          className="ltr text-start"
          value={quoted}
          onChange={(e) => setQuoted(e.target.value)}
          error={m.fieldErrors.quotedAmount}
        />
        <Textarea
          label="ملاحظات الإدارة"
          optional
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={m.fieldErrors.adminNotes}
          hint="لا تظهر للعميل"
        />
        <Checkbox label="إشعار العميل عبر واتساب" description="عند تغيير الحالة" checked={notify} onChange={setNotify} />
        <Button block loading={m.pending === 'save'} disabled={!dirty} onClick={save}>
          حفظ التعديلات
        </Button>
      </div>
    </Panel>
  );
}

function ReschedulePanel({ booking: b, onSaved }: { booking: Booking; onSaved: (wa: WaResult) => void }) {
  const m = useMutation();
  const [date, setDate] = useState(b.localDate);
  const [time, setTime] = useState('');
  const [override, setOverride] = useState(false);
  const [notify, setNotify] = useState(true);
  const slots = useAdminQuery(
    () => (date ? api.get<DaySlots>('/admin/bookings/slots', { date, exclude: b.id }) : Promise.resolve(null)),
    [date],
  );
  useEffect(() => setTime(''), [date]);

  const save = async () => {
    const r = await m.run(
      'resched',
      () =>
        api.patch<{ whatsapp: WaResult }>(`/admin/bookings/${b.id}`, { date, time, overrideHours: override, notify }),
      'تم تعديل الموعد',
    );
    if (r) onSaved(r.whatsapp);
  };

  const s = slots.data;
  return (
    <Panel title="إعادة جدولة">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          الموعد الحالي: <b className="text-ink">{b.localDate}</b> الساعة <b className="text-ink ltr">{b.localTime}</b>
        </p>
        <Input label="التاريخ" type="date" className="ltr text-start" value={date} min={todayAmman()} onChange={(e) => setDate(e.target.value)} error={m.fieldErrors.date} />
        <div>
          <p className="label">الوقت</p>
          {slots.loading ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : slots.error ? (
            <p className="text-sm text-danger">{slots.error.message}</p>
          ) : s && !s.open && !override ? (
            <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
              {s.reason === 'closed' ? 'هذا اليوم خارج أيام العمل.' : 'التاريخ خارج نطاق الحجز المسموح.'} فعّل "تجاوز ساعات العمل" لاختيار وقت مخصص.
            </p>
          ) : (
            s &&
            s.slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {s.slots.map((sl) => (
                  <button
                    key={sl.time}
                    type="button"
                    disabled={!sl.available && !override}
                    onClick={() => setTime(sl.time)}
                    title={sl.reason === 'booked' ? 'محجوز/قريب من موعد آخر' : sl.reason === 'past' ? 'وقت مضى' : undefined}
                    className={cx(
                      'h-9 rounded-lg border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      time === sl.time ? 'border-primary bg-primary font-semibold text-primary-fg' : 'border-line bg-surface hover:border-brand-300',
                      !sl.available && 'line-through',
                    )}
                  >
                    {formatSlot(sl.time)}
                  </button>
                ))}
              </div>
            )
          )}
          {s && <p className="mt-1.5 text-xs text-muted">يُشترط فارق {s.gapHours} ساعات بين المواعيد.</p>}
        </div>
        <Checkbox
          label="تجاوز ساعات العمل"
          description="يسمح بأي وقت (يبقى شرط الفارق بين المواعيد)"
          checked={override}
          onChange={setOverride}
        />
        {override && (
          <Input label="وقت مخصص" type="time" className="ltr text-start" value={time} onChange={(e) => setTime(e.target.value)} error={m.fieldErrors.time} />
        )}
        <Checkbox label="إشعار العميل بالموعد الجديد" checked={notify} onChange={setNotify} />
        {m.error && <p className="text-sm text-danger">{m.error}</p>}
        <Button block variant="secondary" disabled={!date || !time} loading={m.pending === 'resched'} onClick={save}>
          حفظ الموعد الجديد
        </Button>
      </div>
    </Panel>
  );
}
