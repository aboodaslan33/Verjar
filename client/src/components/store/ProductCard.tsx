import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEnsureCustomer } from '../auth/RequireCustomer';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { cx, formatJOD } from '../../lib/format';
import type { Product } from '../../lib/types';
import { Icon, Skeleton } from '../ui';
import { SupplierLine } from '../market/Badges';

/** أول صورة للمنتج (أو null) */
export function productImage(p: Pick<Product, 'media'>): string | null {
  return p.media.find((m) => m.kind === 'IMAGE')?.url ?? null;
}

/** صورة المنتج بنسبة ثابتة — أو بديل هادئ إن لم توجد صورة */
export function ProductImage({
  src,
  alt,
  className,
  eager,
  ratio = 'aspect-[4/3]',
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  ratio?: string;
}) {
  return (
    <div className={cx('relative overflow-hidden bg-subtle', ratio, className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          width={800}
          height={600}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted" role="img" aria-label={`${alt} — لا توجد صورة`}>
          <div className="flex flex-col items-center gap-2">
            <Icon name="image" className="h-6 w-6 opacity-60" />
            <span className="text-xs">لا توجد صورة</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * بطاقة المنتج:
 * - الصورة هي البطل (4:5)، والصورة الثانية تظهر عند المرور إن وُجدت
 * - الشارات: الخصم، الكمية القليلة، النفاد
 * - زر إضافة سريع على الصورة يتحول لعلامة صح بعد الإضافة
 * - تحت الصورة: القسم/المتجر، الاسم، والسعر — بدون إطار بطاقة
 */
export function ProductCard({ product, headingLevel = 3 }: { product: Product; headingLevel?: 2 | 3 }) {
  const { add } = useCart();
  const navigate = useNavigate();
  const ensureCustomer = useEnsureCustomer();
  const { toast } = useToast();
  const [added, setAdded] = useState(false);
  const por = Boolean(product.priceOnRequest);
  const out = !por && product.stock <= 0;
  const low = !out && product.stock <= 3;
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const images = product.media.filter((m) => m.kind === 'IMAGE');
  const hasDiscount = product.discountPercent > 0 && product.finalPrice < product.price;
  const href = `/store/${product.slug}`;

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1400);
    return () => window.clearTimeout(t);
  }, [added]);

  const onAdd = () => {
    // منتج بخيارات (لون، مقاس…): يُختار الخيار من صفحة المنتج
    const choose = product.options?.find((g) => g.values.length > 1);
    if (choose) {
      navigate(href);
      toast(`اختر ${choose.name} لـ «${product.name}»`);
      return;
    }
    if (!ensureCustomer()) return;
    const single = product.options?.map((g) => ({ name: g.name, value: g.values[0].label }));
    add(product, 1, single);
    setAdded(true);
    toast(`أُضيف «${product.name}» إلى السلة`);
  };

  return (
    <article className="group relative flex flex-col">
      <div className="relative overflow-hidden rounded-xl bg-subtle">
        <Link to={href} tabIndex={-1} aria-hidden className="block">
          <div className="relative aspect-[4/5]">
            {images[0] ? (
              <>
                <img
                  src={images[0].url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={cx(
                    'absolute inset-0 h-full w-full object-cover transition-[transform,opacity] duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none',
                    images[1] && 'group-hover:opacity-0',
                    out && 'opacity-60 grayscale-[40%]',
                  )}
                />
                {images[1] && (
                  <img
                    src={images[1].url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  />
                )}
              </>
            ) : (
              <span className="absolute inset-0 grid place-items-center text-muted">
                <Icon name="image" className="h-7 w-7 opacity-50" />
              </span>
            )}
          </div>
        </Link>

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          {hasDiscount ? (
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-fg">
              <span className="num">−{product.discountPercent}%</span>
            </span>
          ) : (
            <span />
          )}
          {product.availability === 'ON_ORDER' && !out ? (
            <span className="rounded-md bg-surface/95 px-2 py-0.5 text-xs font-semibold text-ink">حسب الطلب</span>
          ) : out ? (
            <span className="rounded-md bg-surface/95 px-2 py-0.5 text-xs font-semibold text-muted">نفد</span>
          ) : low ? (
            <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-semibold text-bg">
              بقي <span className="num">{product.stock}</span>
            </span>
          ) : null}
        </div>

        {por && (
          <Link
            to={`/rfq/new?product=${product.slug}`}
            aria-label={`اطلب عرض سعر لـ ${product.name}`}
            title="اطلب عرض سعر"
            className="absolute bottom-2.5 end-2.5 z-10 grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-fg shadow-lift transition-transform active:scale-90 md:translate-y-2 md:opacity-0 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:opacity-100"
          >
            <Icon name="file" className="h-5 w-5" />
          </Link>
        )}
        {!out && !por && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={added ? `تمت إضافة ${product.name}` : `أضف ${product.name} للسلة`}
            className={cx(
              'absolute bottom-2.5 end-2.5 z-10 grid h-11 w-11 place-items-center rounded-full shadow-lift transition-all duration-300 ease-out active:scale-90',
              added ? 'bg-primary text-primary-fg' : 'bg-surface text-ink hover:bg-ink hover:text-bg',
              'md:translate-y-2 md:opacity-0 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:opacity-100',
              added && 'md:translate-y-0 md:opacity-100',
            )}
          >
            <span key={String(added)} className="anim-fade">
              <Icon name={added ? 'check' : 'plus'} className="h-5 w-5" />
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <p className="flex min-w-0 items-center text-xs text-muted">
          {product.vendor ? <SupplierLine vendor={product.vendor} /> : product.category.name}
        </p>
        <H className="mt-1 line-clamp-2 font-sans text-[15px] font-semibold leading-snug text-ink">
          <Link to={href} className="after:absolute after:inset-0 after:content-[''] hover:underline hover:underline-offset-4">
            {product.name}
          </Link>
        </H>
        {(product.brand || product.sku) && (
          <p className="mt-1 line-clamp-1 text-xs text-muted">
            {product.brand}
            {product.brand && product.sku && ' · '}
            {product.sku && <span className="ltr">{product.sku}</span>}
          </p>
        )}
        {por ? (
          <p className="mt-2 text-[15px] font-semibold text-brand-700 dark:text-brand-200">السعر عند الطلب</p>
        ) : (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[17px] font-semibold text-ink">{formatJOD(product.finalPrice)}</span>
            {hasDiscount && (
              <s className="text-sm text-muted" aria-label={`قبل الخصم ${formatJOD(product.price)}`}>
                {formatJOD(product.price)}
              </s>
            )}
          </p>
        )}
        {(product.minOrderQty ?? 1) > 1 && <p className="mt-0.5 text-xs text-muted">الحد الأدنى للطلب: <span className="num">{product.minOrderQty}</span></p>}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="aspect-[4/5] rounded-xl" />
      <div className="space-y-2 pt-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="جاري تحميل المنتجات">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export const PRODUCT_GRID = 'grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4';
