import { cx, formatJOD } from '../../lib/format';

/** السعر: إن وُجد خصم يظهر السعر الأصلي مشطوبًا + النهائي + نسبة الخصم */
export function Price({
  price,
  finalPrice,
  discountPercent,
  size = 'md',
  className,
}: {
  price: number;
  finalPrice: number;
  discountPercent: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const hasDiscount = discountPercent > 0 && finalPrice < price;
  return (
    <div className={cx('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span
        className={cx(
          'font-bold text-ink',
          size === 'sm' && 'text-base',
          size === 'md' && 'text-lg',
          size === 'lg' && 'text-3xl',
        )}
      >
        {formatJOD(finalPrice)}
      </span>
      {hasDiscount && (
        <>
          <s className={cx('text-muted', size === 'lg' ? 'text-lg' : 'text-sm')} aria-label={`السعر قبل الخصم ${formatJOD(price)}`}>
            {formatJOD(price)}
          </s>
          <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-fg">خصم {discountPercent}%</span>
        </>
      )}
    </div>
  );
}
