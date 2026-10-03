import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Icon, SkeletonRows } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatJOD } from '../../lib/format';
import { periodLabel } from '../../lib/insights';
import { useAsync } from '../../lib/useAsync';

type Data = {
  recognitions: { id: string; period: string; title: string }[];
  coupons: { id: string; code: string; name: string; type: 'PERCENT' | 'FIXED'; value: number; maxDiscount: number | null; minOrder: number | null; endsAt: string | null; categoryIds: string[]; productIds: string[] }[];
  rewards: { id: string; type: string; title: string; status: string; endsAt: string | null; createdAt: string }[];
};

/** مكافآت العميل: تميزه الشهري وكوبوناته الخاصة (بياناته فقط) */
export function RewardsTab() {
  const { data, loading } = useAsync(() => api.get<Data>('/account/rewards'), [], 'account/rewards');
  const [copied, setCopied] = useState<string | null>(null);
  if (loading && !data) return <SkeletonRows rows={2} />;
  if (!data || (!data.recognitions.length && !data.coupons.length && !data.rewards.length)) {
    return <EmptyState title="لا توجد مكافآت بعد" description="نكرّم عملاءنا الأكثر نشاطًا كل شهر بمكافآت وكوبونات خصم خاصة." />;
  }
  return (
    <div className="space-y-6">
      {data.recognitions.length > 0 && (
        <div className="rounded-2xl bg-ink p-5 text-white">
          <p className="flex items-center gap-2 text-sm text-white/70">
            <Icon name="star" className="h-4 w-4 text-primary" /> شكرًا لثقتك بـ FARJAR
          </p>
          <ul className="mt-2 space-y-1">
            {data.recognitions.map((r) => (
              <li key={r.id} className="font-display text-xl font-bold">
                {r.title} — {periodLabel(r.period)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.coupons.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg">كوبوناتك</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.coupons.map((c) => (
              <li key={c.id} className="rounded-2xl border-2 border-dashed border-primary bg-primary/5 p-4">
                <p className="text-sm text-muted">{c.name}</p>
                <p className="mt-1 font-display text-2xl font-bold">
                  {c.type === 'PERCENT' ? `خصم ${Number(c.value)}%` : `خصم ${formatJOD(c.value)}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {c.maxDiscount != null && <>بحد أقصى {formatJOD(c.maxDiscount)} · </>}
                  {c.minOrder != null && <>للطلبات من {formatJOD(c.minOrder)} · </>}
                  {c.categoryIds.length || c.productIds.length ? 'على منتجات محددة' : 'على كل المنتجات'}
                  {c.endsAt && <> · حتى {formatDate(c.endsAt)}</>}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="ltr rounded-lg bg-surface px-3 py-1.5 font-bold tracking-wider">{c.code}</span>
                  <button
                    type="button"
                    className="text-sm font-semibold underline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(c.code).catch(() => undefined);
                      setCopied(c.code);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === c.code ? 'تم النسخ' : 'نسخ الكود'}
                  </button>
                  <Link to="/store" className="ms-auto text-sm font-semibold text-primary-ink underline">
                    تسوّق الآن
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">اكتب الكود في صفحة إتمام الطلب ليُخصم من إجمالي طلبك.</p>
        </section>
      )}
      {data.rewards.length > 0 && (
        <section>
          <h3 className="mb-2 text-lg">سجل المكافآت</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.rewards.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{r.title}</span>
                <span className="text-xs text-muted">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
