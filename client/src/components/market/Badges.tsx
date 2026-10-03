import { cx } from '../../lib/format';
import { Icon } from '../ui';

/** علامة المورد الموثّق من إدارة FARJAR */
export function VerifiedMark({ className, label = false }: { className?: string; label?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-[#1a7f4b] dark:text-[#4ade80]', className)} title="مورد موثّق من FARJAR">
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#1a7f4b] text-white dark:bg-[#22c55e]" aria-hidden>
        <Icon name="check" className="h-3 w-3" />
      </span>
      {label ? <span className="text-xs font-semibold">مورد موثّق</span> : <span className="sr-only">مورد موثّق</span>}
    </span>
  );
}

/** شارة باقة المورد (PRO / BUSINESS) */
export function PlanBadge({ plan, className }: { plan?: { code: string; badge?: string | null } | null; className?: string }) {
  if (!plan?.badge) return null;
  const business = plan.code === 'BUSINESS';
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wide',
        business ? 'bg-ink text-primary' : 'bg-primary/15 text-ink',
        className,
      )}
    >
      {plan.badge}
    </span>
  );
}

/** شارة التميز الفعّالة (مورد الشهر…) أو null بعد انتهاء مدتها */
export function activeAward(v: { awardTitle?: string | null; awardUntil?: string | null }) {
  return v.awardTitle && v.awardUntil && new Date(v.awardUntil).getTime() > Date.now() ? v.awardTitle : null;
}

export function AwardBadge({ title, className }: { title: string; className?: string }) {
  return (
    <span className={cx('inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-[10px] font-bold text-primary-fg', className)} title={title}>
      <Icon name="star" className="h-3 w-3" aria-hidden />
      {title}
    </span>
  );
}

/** اسم المورد مع التوثيق والباقة (منتجات FARJAR تظهر باسم FARJAR) */
export function SupplierLine({
  vendor,
  className,
}: {
  vendor: { name: string; isHouse: boolean; verified?: boolean; city?: string | null; plan?: { code: string; badge?: string | null } | null; awardTitle?: string | null; awardUntil?: string | null };
  className?: string;
}) {
  const award = vendor.isHouse ? null : activeAward(vendor);
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate">{vendor.isHouse ? 'FARJAR' : vendor.name}</span>
      {(vendor.verified || vendor.isHouse) && <VerifiedMark />}
      {award ? <AwardBadge title={award} /> : !vendor.isHouse && <PlanBadge plan={vendor.plan} />}
    </span>
  );
}
