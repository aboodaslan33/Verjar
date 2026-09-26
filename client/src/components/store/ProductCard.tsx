import { Link } from 'react-router-dom';
import { useEnsureCustomer } from '../auth/RequireCustomer';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { cx } from '../../lib/format';
import type { Product } from '../../lib/types';
import { Button, Icon, Price, Skeleton } from '../ui';

/** أول صورة للمنتج (أو null) */
export function productImage(p: Pick<Product, 'media'>): string | null {
  return p.media.find((m) => m.kind === 'IMAGE')?.url ?? null;
}

/** صورة المنتج بنسبة ثابتة 4:3 — أو بديل هادئ إن لم توجد صورة */
export function ProductImage({
  src,
  alt,
  className,
  eager,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div className={cx('relative aspect-[4/3] overflow-hidden bg-subtle', className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          width={800}
          height={600}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-muted" role="img" aria-label={`${alt} — لا توجد صورة`}>
          <div className="flex flex-col items-center gap-2">
            <span className="block h-px w-12 bg-sand-400" aria-hidden />
            <span className="text-xs">لا توجد صورة</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductCard({ product, headingLevel = 3 }: { product: Product; headingLevel?: 2 | 3 }) {
  const { add } = useCart();
  const ensureCustomer = useEnsureCustomer();
  const { toast } = useToast();
  const out = product.stock <= 0;
  const H = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <article className="card lift group flex flex-col overflow-hidden">
      <Link to={`/store/${product.slug}`} className="relative block" tabIndex={-1} aria-hidden>
        <ProductImage
          src={productImage(product)}
          alt=""
          className="transition-opacity group-hover:opacity-95"
        />
        {product.discountPercent > 0 && (
          <span className="absolute start-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-fg">
            خصم <span className="ltr">{product.discountPercent}%</span>
          </span>
        )}
        {out && (
          <span className="absolute end-2 top-2 rounded-md bg-surface/90 px-2 py-0.5 text-xs font-semibold text-muted">
            نفد المخزون
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-xs text-muted">{product.category.name}</p>
        <H className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base">
          <Link to={`/store/${product.slug}`} className="hover:text-brand-700 dark:hover:text-brand-200">
            {product.name}
          </Link>
        </H>
        <Price
          price={product.price}
          finalPrice={product.finalPrice}
          discountPercent={product.discountPercent}
          size="sm"
          className="mt-2"
        />
        <div className="mt-auto pt-3">
          <Button
            variant={out ? 'outline' : 'primary'}
            block
            disabled={out}
            className="min-h-[44px] text-sm"
            onClick={() => {
              if (!ensureCustomer()) return;
              add(product, 1);
              toast(`أُضيف "${product.name}" إلى السلة`);
            }}
          >
            {out ? (
              'نفد المخزون'
            ) : (
              <>
                <Icon name="cart" className="h-4 w-4" /> أضف للسلة
              </>
            )}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-3 sm:p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-3 h-11 w-full rounded-xl" />
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

export const PRODUCT_GRID = 'grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4';
