import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminMap } from '../../components/admin/AdminMap';
import { ContractForm } from '../../components/admin/ContractForm';
import { FileUploadForm } from '../../components/admin/FileUploadForm';
import { useAdminQuery, useMutation } from '../../components/admin/hooks';
import {
  CONTRACT_STATUS_LABEL,
  PRODUCTION_IMPACT_LABEL,
  URGENCY_LEVEL_LABEL,
  daysUntil,
  numOrNull,
} from '../../components/admin/labels';
import { FilesList } from '../../components/admin/RecordLists';
import { StatusSelect } from '../../components/admin/StatusSelect';
import type { CorporateDetail as Req, WaResult } from '../../components/admin/types';
import { AdminPage, DefList, DetailSkeleton, Panel } from '../../components/admin/ui';
import { WhatsAppFallback } from '../../components/admin/WhatsAppFallback';
import { Button, ButtonA, Checkbox, ErrorState, Icon, Input, StatusBadge, Tag, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { CORPORATE_TYPE_LABEL, displayPhone, formatDate, formatJOD } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { useDocumentTitle } from '../../lib/useAsync';

export default function CorporateDetail() {
  const { id = '' } = useParams();
  const q = useAdminQuery(() => api.get<Req>(`/admin/corporate/requests/${id}`), [id]);
  const m = useMutation();
  const [wa, setWa] = useState<WaResult>(null);
  const [showContract, setShowContract] = useState(false);
  const r = q.data;
  useDocumentTitle(r ? `${r.companyName} — طلب #${r.number}` : 'طلب شركة');

  if (q.loading) return <DetailSkeleton />;
  if (q.error || !r)
    return (
      <AdminPage title="طلب الشركة" back={{ to: '/admin/corporate', label: 'طلبات الشركات' }}>
        <ErrorState message={q.error?.message ?? 'الطلب غير موجود'} onRetry={q.retry} />
      </AdminPage>
    );

  const resendAdmin = async () => {
    const res = await m.run('wa', () => api.post<{ link: string; sent: boolean }>(`/admin/corporate/requests/${r.id}/whatsapp`));
    if (res) setWa(res);
  };

  return (
    <AdminPage
      back={{ to: '/admin/corporate', label: 'طلبات الشركات' }}
      title={r.companyName}
      meta={
        <>
          <StatusBadge status={r.status} />
          <Tag tone={r.type === 'URGENT' ? 'danger' : 'brand'}>{CORPORATE_TYPE_LABEL[r.type]}</Tag>
          <span className="text-xs text-muted">
            طلب #{r.number} · المرجع <span className="ltr">{r.ref}</span> · {formatDate(r.createdAt, true)}
          </span>
        </>
      }
      actions={
        <>
          <ButtonA href={`tel:+${r.managerPhone}`} variant="outline" size="sm">
            <Icon name="phone" className="h-4 w-4" /> اتصال بالمدير
          </ButtonA>
          <ButtonA href={`https://wa.me/${r.managerPhone}`} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="sm">
            <Icon name="whatsapp" className="h-4 w-4" /> واتساب
          </ButtonA>
        </>
      }
    >
      {wa && (
        <div className="mb-4">
          <WhatsAppFallback result={wa} onDismiss={() => setWa(null)} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title="بيانات الشركة">
            <DefList
              items={[
                ['اسم الشركة', r.companyName],
                ['المسؤول', <Link to={`/admin/customers/${r.customerId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-200">{r.contactName}</Link>],
                ['هاتف المدير', <span className="ltr">{displayPhone(r.managerPhone)}</span>],
                ['هاتف مسؤول الصيانة', <a href={`tel:+${r.maintenancePhone}`} className="ltr hover:underline">{displayPhone(r.maintenancePhone)}</a>],
                ['المبلغ المسعّر', r.quotedAmount != null ? formatJOD(r.quotedAmount) : 'لم يُسعّر بعد'],
              ]}
            />
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-xs text-muted">الخدمات المطلوبة</p>
              {r.services.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {r.services.map((s) => (
                    <li key={s.name} className="rounded-lg bg-subtle px-2.5 py-1 text-sm">
                      {s.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">—</p>
              )}
            </div>
            {r.type === 'URGENT' && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="mb-3 text-sm font-semibold text-muted">تفاصيل الطلب العاجل</h3>
                <DefList
                  items={[
                    ['مكان العمل', r.workLocation],
                    ['درجة الاستعجال', r.urgencyLevel ? <b>{URGENCY_LEVEL_LABEL[r.urgencyLevel]}</b> : '—'],
                    ['الإنتاج', r.productionImpact ? PRODUCTION_IMPACT_LABEL[r.productionImpact] : '—'],
                    ['خط الإنتاج متأثر', r.productionLineAffected == null ? '—' : r.productionLineAffected ? 'نعم' : 'لا'],
                  ]}
                />
              </div>
            )}
            {r.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs text-muted">ملاحظات الشركة</p>
                <p className="mt-1 whitespace-pre-line">{r.notes}</p>
              </div>
            )}
            {(r.commercialRegisterUrl || r.licenseUrl) && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                {r.commercialRegisterUrl && (
                  <ButtonA href={r.commercialRegisterUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
                    <Icon name="file" className="h-4 w-4" /> السجل التجاري
                  </ButtonA>
                )}
                {r.licenseUrl && (
                  <ButtonA href={r.licenseUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
                    <Icon name="file" className="h-4 w-4" /> رخصة المهن
                  </ButtonA>
                )}
              </div>
            )}
          </Panel>

          <Panel title="الموقع">
            <AdminMap lat={r.lat} lng={r.lng} address={r.locationText} label={r.companyName} />
          </Panel>

          <Panel
            title={`العقود (${r.contracts.length})`}
            actions={
              !showContract && (
                <Button size="sm" variant={r.contracts.length ? 'outline' : 'primary'} onClick={() => setShowContract(true)}>
                  تحويل إلى عقد
                </Button>
              )
            }
          >
            {showContract && (
              <div className="mb-4 rounded-xl border border-line bg-subtle/40 p-4">
                <ContractForm
                  requestId={r.id}
                  defaultTitle={`${CORPORATE_TYPE_LABEL[r.type]} — ${r.companyName}`}
                  defaultValue={r.quotedAmount}
                  onCancel={() => setShowContract(false)}
                  onSaved={() => {
                    setShowContract(false);
                    q.reload();
                  }}
                />
              </div>
            )}
            {r.contracts.length === 0 ? (
              !showContract && <p className="text-sm text-muted">لم يتحول الطلب إلى عقد بعد.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.contracts.map((c) => {
                  const left = daysUntil(c.endDate);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {c.title} <span className="text-xs text-muted">#{c.number}</span>
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(c.startDate)} — {formatDate(c.endDate)} · {formatJOD(c.value)}
                          {c.status === 'ACTIVE' && left >= 0 && <> · متبقي {left} يوم</>}
                        </p>
                      </div>
                      <Tag tone={c.status === 'ACTIVE' ? 'brand' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Tag>
                      {c.fileUrl ? (
                        <a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
                          ملف العقد
                        </a>
                      ) : (
                        <Link to="/admin/contracts" className="text-sm text-muted hover:underline">
                          رفع ملف العقد
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="عروض الأسعار والملفات">
            <FilesList files={r.quoteFiles} onDeleted={() => q.reload()} />
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-3 text-sm font-semibold">رفع عرض سعر أو عقد</h3>
              <FileUploadForm
                target={{ corporateRequestId: r.id }}
                kinds={['QUOTE', 'EVALUATION', 'CONTRACT', 'OTHER']}
                defaultKind="QUOTE"
                onUploaded={() => q.reload()}
              />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <ManagePanel
            key={r.updatedAt}
            req={r}
            onSaved={(res) => {
              if (res) setWa(res);
              q.reload();
            }}
          />
          <Panel title="واتساب">
            <p className="mb-3 text-sm text-muted">إعادة إرسال رسالة الطلب إلى رقم الإدارة.</p>
            <Button size="sm" variant="outline" loading={m.pending === 'wa'} onClick={resendAdmin}>
              إعادة الإرسال للإدارة
            </Button>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}

function ManagePanel({ req: r, onSaved }: { req: Req; onSaved: (wa: WaResult) => void }) {
  const m = useMutation();
  const [status, setStatus] = useState<RequestStatus>(r.status);
  const [quoted, setQuoted] = useState(r.quotedAmount != null ? String(r.quotedAmount) : '');
  const [notes, setNotes] = useState(r.adminNotes ?? '');
  const [notify, setNotify] = useState(true);
  const body: Record<string, unknown> = {};
  if (status !== r.status) body.status = status;
  if (numOrNull(quoted) !== r.quotedAmount) body.quotedAmount = numOrNull(quoted);
  if ((notes.trim() || null) !== (r.adminNotes || null)) body.adminNotes = notes.trim() || null;
  const dirty = Object.keys(body).length > 0;

  const save = async () => {
    const res = await m.run('save', () => api.patch<{ whatsapp: WaResult }>(`/admin/corporate/requests/${r.id}`, { ...body, notify }), 'تم حفظ التعديلات');
    if (res) onSaved(res.whatsapp);
  };
  return (
    <Panel title="إدارة الطلب">
      <div className="space-y-4">
        <StatusSelect value={status} onChange={setStatus} />
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
        <Textarea label="ملاحظات الإدارة" optional rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} error={m.fieldErrors.adminNotes} hint="لا تظهر للعميل" />
        <Checkbox label="إشعار الشركة عبر واتساب" description="عند تغيير الحالة" checked={notify} onChange={setNotify} />
        <Button block loading={m.pending === 'save'} disabled={!dirty} onClick={save}>
          حفظ التعديلات
        </Button>
      </div>
    </Panel>
  );
}
