import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEnsureCustomer } from '../../components/auth/RequireCustomer';
import { PRODUCT_GRID, ProductCard, ProductImage } from '../../components/store/ProductCard';
import { QtyStepper } from '../../components/store/QtyStepper';
import { Breadcrumbs, Button, ButtonLink, EmptyState, ErrorState, Icon, Price, SectionHeading, Skeleton, type Crumb } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { cx, formatJOD } from '../../lib/format';
import { variantText, type Media, type Product } from '../../lib/types';
import { useAsync, useDocumentTitle } from '../../lib/useAsync';
import { SupplierLine } from '../../components/market/Badges';
import { AVAILABILITY_LABEL, leadTimeText } from '../../lib/market';

type ProductResponse = { product: Product; related: Product[] };

export default function ProductPage() {
  const { slug = '' } = useParams();
  const { data, error, loading, reload } = useAsync(
    () => api.get<ProductResponse>(`/store/products/${encodeURIComponent(slug)}`),
    [slug],
    `product/${slug}`,
  );
  useDocumentTitle(data?.product.name ?? (error?.status === 404 ? 'المنتج غير موجود' : 'المتجر'));

  if (loading && !data) return <ProductSkeleton />;

  if (error) {
    return (
      <div className="container py-16">
        {error.status === 404 ? (
          <EmptyState
            title="المنتج غير موجود"
            description="ربما حُذف المنتج أو تغيّر رابطه. تصفح المنتجات المتوفرة في السوق."
            action={<ButtonLink to="/store">العودة إلى السوق</ButtonLink>}
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
  const [qty, setQty] = useState(Math.max(1, product.minOrderQty ?? 1));
  const [added, setAdded] = useState(false);
  const por = Boolean(product.priceOnRequest);
  const out = por || product.stock <= 0;
  const minQty = Math.max(1, product.minOrderQty ?? 1);
  const ensureCustomer = useEnsureCustomer();
  const buyRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [buyVisible, setBuyVisible] = useState(true);
  // الخيارات (اللون، المقاس…): الخيار ذو القيمة الوحيدة يُختار تلقائيًا
  const groups = product.options ?? [];
  const [sel, setSel] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.filter((g) => g.values.length === 1).map((g) => [g.name, g.values[0].label])),
  );
  const [focusMedia, setFocusMedia] = useState<string | null>(null);
  const [optionError, setOptionError] = useState(false);
  const missing = groups.find((g) => !sel[g.name]);
  const choose = (group: string, value: string, mediaId?: string | null) => {
    setSel((s) => ({ ...s, [group]: value }));
    setOptionError(false);
    if (mediaId) setFocusMedia(mediaId);
  };
  const selection = groups.map((g) => ({ name: g.name, value: sel[g.name] }));
  /** يتأكد من اختيار كل الخيارات قبل الإضافة للسلة */
  const ready = () => {
    if (!missing) return true;
    setOptionError(true);
    optionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`اختر ${missing.name} أولًا`);
    return false;
  };

  // شريط الشراء السفلي على الجوال يظهر فقط عندما يختفي زر الإضافة الأساسي عن الشاشة
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setBuyVisible(e.isIntersecting), { rootMargin: '0px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(t);
  }, [added]);

  const addToCart = () => {
    if (!ready() || !ensureCustomer()) return;
    add(product, qty, selection);
    setAdded(true);
    toast(`أُضيف «${product.name}${groups.length ? ` — ${variantText(selection)}` : ''}» إلى السلة`);
  };
  const buyNow = () => {
    if (!ready() || !ensureCustomer()) return;
    add(product, qty, selection);
    navigate('/checkout');
  };

  const crumbs: Crumb[] = [
    { to: '/store', label: 'السوق' },
    ...(product.category.parent ? [{ to: `/store?category=${product.category.parent.slug}`, label: product.category.parent.name }] : []),
    { to: `/store?category=${product.category.slug}`, label: product.category.name },
    { label: product.name },
  ];

  return (
    <>
      <div className="container py-6 md:py-10">
        <Breadcrumbs items={crumbs} className="mb-6" />

        <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <Gallery media={product.media} name={product.name} focusId={focusMedia} />
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              {product.vendor && (
                <Link
                  to={`/store/vendor/${product.vendor.slug}`}
                  className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
                >
                  <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-line bg-subtle">
                    {product.vendor.logoUrl ? (
                      <img src={product.vendor.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-ink">{product.vendor.name.slice(0, 1)}</span>
                    )}
                  </span>
                  <span className="font-medium text-ink underline-offset-4 group-hover:underline">
                    <SupplierLine vendor={product.vendor} />
                  </span>
                  <span aria-hidden>·</span>
                  <span>{product.category.name}</span>
                </Link>
              )}
              <h1 className="mt-3 text-[1.75rem] leading-[1.35] md:text-[2.125rem]">{product.name}</h1>

              {(product.brand || product.sku || product.partNumber) && (
                <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted">
                  {product.brand && <span>الماركة: <b className="font-semibold text-ink">{product.brand}</b></span>}
                  {product.sku && <span>SKU: <b className="ltr font-semibold text-ink">{product.sku}</b></span>}
                  {product.partNumber && <span>رقم القطعة: <b className="ltr font-semibold text-ink">{product.partNumber}</b></span>}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                {por ? (
                  <p className="font-display text-2xl font-semibold text-brand-700 dark:text-brand-200">السعر عند الطلب</p>
                ) : (
                  <Price price={product.price} finalPrice={product.finalPrice} discountPercent={product.discountPercent} size="lg" />
                )}
              </div>
              {por || product.availability !== 'IN_STOCK' ? (
                <p className={cx('mt-3 flex items-center gap-2 text-sm font-medium', product.availability === 'OUT_OF_STOCK' ? 'text-danger' : 'text-ink')}>
                  <span className={cx('h-2 w-2 rounded-full', product.availability === 'OUT_OF_STOCK' ? 'bg-danger' : product.availability === 'ON_ORDER' ? 'bg-primary' : 'bg-success')} aria-hidden />
                  {AVAILABILITY_LABEL[product.availability ?? 'IN_STOCK']}
                </p>
              ) : (
                <StockLine stock={product.stock} />
              )}

              <dl className="mt-6 grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    ['الشركة المصنعة', product.manufacturer],
                    ['بلد المنشأ', product.originCountry],
                    ['الحد الأدنى للطلب', minQty > 1 ? String(minQty) : null],
                    ['مدة التوريد', leadTimeText(product.leadTimeDays)],
                    ['الضمان', product.warranty],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-subtle px-3 py-2.5">
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="mt-0.5 font-semibold">{v}</dd>
                    </div>
                  ))}
              </dl>

              {product.specList && product.specList.length > 0 && (
                <section className="mt-7" aria-labelledby="specs-title">
                  <h2 id="specs-title" className="text-sm font-semibold">
                    المواصفات
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {product.specList.map((sp) => (
                      <div key={sp.key} className="rounded-lg border border-line px-3 py-2.5">
                        <dt className="text-xs text-muted">{sp.label}</dt>
                        <dd className="mt-0.5 font-semibold">{sp.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {groups.length > 0 && !por && (
                <div ref={optionsRef} className="mt-7 space-y-5 scroll-mt-32">
                  {groups.map((g) => (
                    <fieldset key={g.name}>
                      <legend className="text-sm font-semibold">
                        {g.name}
                        {sel[g.name] ? <span className="font-normal text-muted">: {sel[g.name]}</span> : null}
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={g.name}>
                        {g.values.map((v) => {
                          const img = v.mediaId ? product.media.find((m) => m.id === v.mediaId && m.kind === 'IMAGE') : undefined;
                          const on = sel[g.name] === v.label;
                          return (
                            <button
                              key={v.label}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => choose(g.name, v.label, v.mediaId)}
                              className={cx(
                                'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-[border-color,box-shadow]',
                                on ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink',
                                optionError && !sel[g.name] && 'border-danger',
                              )}
                            >
                              {img && <img src={img.url} alt="" className="h-8 w-8 rounded-md object-cover" />}
                              {v.label}
                            </button>
                          );
                        })}
                      </div>
                      {optionError && !sel[g.name] && <p className="mt-1.5 text-sm text-danger">اختر {g.name}</p>}
                    </fieldset>
                  ))}
                </div>
              )}

              <div ref={buyRef} className="mt-7 border-t border-line pt-7">
                {!out && (
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <span id="qty-label" className="text-sm font-semibold">
                      الكمية
                    </span>
                    <QtyStepper value={qty} min={minQty} max={Math.min(product.stock, 20)} onChange={setQty} labelledBy="qty-label" />
                  </div>
                )}
                {por ? (
                  <ButtonLink to={`/rfq/new?product=${product.slug}`} size="lg" block>
                    <Icon name="file" className="h-5 w-5" /> اطلب عرض سعر
                  </ButtonLink>
                ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button size="lg" block disabled={out} onClick={addToCart} className={cx(added && '!bg-ink !text-bg')}>
                    <span key={String(added)} className="anim-fade inline-flex items-center gap-2">
                      <Icon name={added ? 'check' : 'bag'} className="h-5 w-5" />
                      {out ? 'نفد المخزون' : added ? 'أُضيف للسلة' : 'أضف للسلة'}
                    </span>
                  </Button>
                  {!out && (
                    <Button size="lg" variant="outline" block onClick={buyNow}>
                      اطلب الآن
                    </Button>
                  )}
                </div>
                )}
                {!por && (
                  <Link to={`/rfq/new?product=${product.slug}`} className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-200">
                    <Icon name="file" className="h-4 w-4" /> كمية كبيرة أو مواصفات خاصة؟ اطلب عرض سعر
                  </Link>
                )}
              </div>

              {(product.documents?.length ?? 0) > 0 && (
                <section className="mt-7" aria-labelledby="docs-title">
                  <h2 id="docs-title" className="text-sm font-semibold">
                    الملفات الفنية
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {product.documents!.map((d, i) => (
                      <li key={i}>
                        <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm hover:border-ink">
                          <Icon name="download" className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 truncate">{d.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {product.videoUrl && (
                <a href={product.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                  <Icon name="play" className="h-4 w-4" /> مشاهدة فيديو المنتج
                </a>
              )}

              <ul className="mt-7 space-y-3 text-sm text-muted">
                <li className="flex items-start gap-3">
                  <Icon name="truck" className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
                  <span>{por ? 'يصل طلبك للمورد مباشرة، وتستلم عرضه وتقارنه من حسابك.' : 'نتواصل معك بعد الطلب لتأكيده وتحديد موعد التوصيل.'}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
                  <span>كل منتج في السوق تراجعه الإدارة قبل عرضه، والسعر النهائي يُحسب عند إرسال الطلب.</span>
                </li>
              </ul>

              {product.description && (
                <details className="group mt-7 border-t border-line pt-2" open>
                  <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between font-semibold">
                    الوصف
                    <Icon name="chevronDown" className="h-4 w-4 text-muted transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="anim-fade whitespace-pre-line pb-2 leading-relaxed text-muted">{product.description}</p>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section border-t border-line">
          <div className="container">
            <SectionHeading eyebrow="من نفس القسم" title="قد يعجبك أيضًا" link={{ to: `/store?category=${product.category.slug}`, label: `كل ${product.category.name}` }} />
            <div className={cx(PRODUCT_GRID, 'mt-10')} data-reveal-group>
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* شريط الشراء على الجوال */}
      {!out && (
        <div
          className={cx(
            'fixed inset-x-0 z-30 border-t border-line bg-surface px-4 py-3 transition-transform duration-300 ease-out lg:hidden',
            buyVisible ? 'pointer-events-none translate-y-[calc(100%+var(--tabbar-h))]' : 'translate-y-0',
          )}
          style={{ bottom: 'var(--tabbar-h)' }}
          aria-hidden={buyVisible}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted">{product.name}{groups.length && !missing ? ` — ${variantText(selection)}` : ''}</p>
              <p className="font-display text-lg font-semibold">{formatJOD(product.finalPrice * qty)}</p>
            </div>
            <Button onClick={addToCart} tabIndex={buyVisible ? -1 : 0}>
              <Icon name={added ? 'check' : 'bag'} className="h-5 w-5" /> {added ? 'أُضيف' : 'أضف للسلة'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function StockLine({ stock }: { stock: number }) {
  const out = stock <= 0;
  return (
    <p className={cx('mt-3 flex items-center gap-2 text-sm font-medium', out ? 'text-danger' : stock <= 5 ? 'text-warn' : 'text-success')}>
      <span className={cx('h-2 w-2 rounded-full', out ? 'bg-danger' : stock <= 5 ? 'bg-warn' : 'bg-success')} aria-hidden />
      {out ? (
        'نفد المخزون حاليًا'
      ) : stock <= 5 ? (
        <>
          متوفر — بقي <span className="num">{stock}</span> فقط
        </>
      ) : (
        'متوفر'
      )}
    </p>
  );
}

function Gallery({ media, name, focusId }: { media: Media[]; name: string; focusId?: string | null }) {
  const items = media.filter((m) => m.kind === 'IMAGE' || m.kind === 'VIDEO');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [media]);
  // اختيار لون له صورة يعرض صورته
  useEffect(() => {
    if (!focusId) return;
    const i = items.findIndex((m) => m.id === focusId);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
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
      <div className="overflow-hidden rounded-xl bg-subtle">
        {!current ? (
          <ProductImage src={null} alt={name} ratio="aspect-square" />
        ) : current.kind === 'VIDEO' ? (
          <div className="aspect-square bg-black">
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
          <div key={current.id} className="anim-fade">
            <ProductImage src={current.url} alt={name} eager ratio="aspect-square" />
          </div>
        )}
      </div>

      {items.length > 1 && (
        <div role="group" aria-label="صور المنتج" className="scroll-x mt-3 flex gap-2 pb-1" onKeyDown={onKey}>
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={m.kind === 'VIDEO' ? `عرض الفيديو ${i + 1}` : `عرض الصورة ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className={cx(
                'relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-subtle ring-offset-2 ring-offset-bg transition-[box-shadow,opacity] sm:h-20 sm:w-20',
                i === index ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100',
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
          <Skeleton className="aspect-square w-full rounded-xl" />
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
