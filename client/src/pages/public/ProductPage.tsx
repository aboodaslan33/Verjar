import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEnsureCustomer } from '../../components/auth/RequireCustomer';
import { PRODUCT_GRID, ProductCard, ProductImage } from '../../components/store/ProductCard';
import { QtyStepper } from '../../components/store/QtyStepper';
import { Button, ButtonLink, EmptyState, ErrorState, Icon, Price, Skeleton } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import type { Media, Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';

type ProductResponse = { product: Product; related: Product[] };

export default function ProductPage() {
  const { slug = '' } = useParams();
  const { data, error, loading, reload } = useAsync(
    () => api.get<ProductResponse>(`/store/products/${encodeURIComponent(slug)}`),
    [slug],
  );
  useDocumentTitle(data?.product.name ?? (error?.status === 404 ? 'المنتج غير موجود' : 'المتجر'));

  if (loading && !data) return <ProductSkeleton />;

  if (error) {
    return (
      <div className="container py-16">
        {error.status === 404 ? (
          <EmptyState
            title="المنتج غير موجود"
            description="ربما حُذف المنتج أو تغيّر رابطه. تصفح المنتجات المتوفرة في المتجر."
            action={<ButtonLink to="/store">العودة إلى المتجر</ButtonLink>}
          />
        ) : (
          <ErrorState message={error.message} onRetry={reload} />
        )}
      </div>
    );
  }
  if (!data) return null;

  return <ProductView key={data.product.id} product={data.product} related={data.related} />;
}

function ProductView({ product, related }: ProductResponse) {
  const { add } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const out = product.stock <= 0;

  const ensureCustomer = useEnsureCustomer();

  const addToCart = () => {
    if (!ensureCustomer()) return;
    add(product, qty);
    toast(`أُضيف "${product.name}" إلى السلة`);
  };

  return (
    <>
      <div className="container py-6 md:py-10">
        <nav aria-label="مسار التصفح" className="mb-5 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/store" className="hover:text-ink">
                المتجر
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link to={`/store?category=${product.category.slug}`} className="hover:text-ink">
                {product.category.name}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="truncate text-ink">
              {product.name}
            </li>
          </ol>
        </nav>

        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <Gallery media={product.media} name={product.name} />
          </div>

          <div className="lg:col-span-5">
            <p className="eyebrow">{product.category.name}</p>
            <h1 className="mt-1 text-2xl md:text-3xl">{product.name}</h1>

            <Price
              price={product.price}
              finalPrice={product.finalPrice}
              discountPercent={product.discountPercent}
              size="lg"
              className="mt-4"
            />

            <p className={cx('mt-3 flex items-center gap-2 text-sm font-medium', out ? 'text-danger' : 'text-success')}>
              <span className={cx('h-2 w-2 rounded-full', out ? 'bg-danger' : 'bg-success')} aria-hidden />
              {out ? (
                'نفد المخزون حاليًا'
              ) : product.stock <= 5 ? (
                <>
                  متوفر — بقي <span className="ltr">{product.stock}</span> فقط
                </>
              ) : (
                'متوفر'
              )}
            </p>

            {!out && (
              <div className="mt-6">
                <span id="qty-label" className="label">
                  الكمية
                </span>
                <QtyStepper value={qty} max={Math.min(product.stock, 20)} onChange={setQty} labelledBy="qty-label" />
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" block disabled={out} onClick={addToCart}>
                <Icon name="cart" /> {out ? 'نفد المخزون' : 'أضف للسلة'}
              </Button>
              {!out && (
                <Button
                  size="lg"
                  variant="secondary"
                  block
                  onClick={() => {
                    if (!ensureCustomer()) return;
                    add(product, qty);
                    navigate('/checkout');
                  }}
                >
                  اطلب الآن
                </Button>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">
              السعر النهائي يُؤكَّد عند إرسال الطلب، ونتواصل معك لتحديد موعد التوصيل.
            </p>

            {product.description && (
              <section className="mt-8 border-t border-line pt-6">
                <h2 className="text-lg">الوصف</h2>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-muted">{product.description}</p>
              </section>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="container py-10 md:py-14">
            <h2 className="text-xl md:text-2xl">منتجات من نفس التصنيف</h2>
            <div className={cx(PRODUCT_GRID, 'mt-6')} data-reveal-group>
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Gallery({ media, name }: { media: Media[]; name: string }) {
  const items = media.filter((m) => m.kind === 'IMAGE' || m.kind === 'VIDEO');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [media]);
  const current = items[index];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // RTL: السهم الأيسر = التالي
    if (e.key === 'ArrowLeft') setIndex((i) => Math.min(items.length - 1, i + 1));
    else if (e.key === 'ArrowRight') setIndex((i) => Math.max(0, i - 1));
    else return;
    e.preventDefault();
  };

  return (
    <div>
      <div className="card overflow-hidden">
        {!current ? (
          <ProductImage src={null} alt={name} />
        ) : current.kind === 'VIDEO' ? (
          <div className="aspect-[4/3] bg-black">
            <video
              key={current.id}
              src={current.url}
              controls
              preload="metadata"
              playsInline
              className="h-full w-full object-contain"
              aria-label={`فيديو ${name}`}
            />
          </div>
        ) : (
          <ProductImage src={current.url} alt={name} eager />
        )}
      </div>

      {items.length > 1 && (
        <div role="group" aria-label="صور المنتج" className="mt-3 flex gap-2 overflow-x-auto pb-1" onKeyDown={onKey}>
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={m.kind === 'VIDEO' ? `عرض الفيديو ${i + 1}` : `عرض الصورة ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className={cx(
                'relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-subtle transition-colors sm:h-20 sm:w-24',
                i === index ? 'border-brand-600 dark:border-brand-300' : 'border-transparent hover:border-line',
              )}
            >
              {m.kind === 'VIDEO' ? (
                <span className="grid h-full w-full place-items-center bg-inverse text-inverse-fg">
                  <Icon name="play" className="h-6 w-6" />
                </span>
              ) : (
                <img src={m.url} alt="" width={96} height={72} loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="container py-6 md:py-10" role="status" aria-label="جاري تحميل المنتج">
      <Skeleton className="mb-5 h-4 w-48" />
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-20 rounded-lg sm:h-20 sm:w-24" />
            ))}
          </div>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-12 w-40 rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
