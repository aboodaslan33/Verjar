import { BRAND } from '../../lib/brand';
import { Link } from 'react-router-dom';
import { ProductImage } from '../../components/store/ProductCard';
import { QtyStepper } from '../../components/store/QtyStepper';
import { CheckoutHeader } from '../../components/store/CheckoutSteps';
import { ButtonLink, EmptyState, Icon } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Cart() {
  useDocumentTitle('السلة');
  const { items, count, subtotal, discount, total, setQty, remove } = useCart();
  // تجميع المنتجات حسب المتجر
  const groups = items.reduce<{ key: string; name: string; slug?: string; items: typeof items }[]>((acc, i) => {
    const key = i.vendorSlug ?? '_';
    const g = acc.find((x) => x.key === key);
    if (g) g.items.push(i);
    else acc.push({ key, name: i.vendorName ?? BRAND.ar, slug: i.vendorSlug, items: [i] });
    return acc;
  }, []);
  const multiVendor = groups.length > 1;

  if (items.length === 0) {
    return (
      <>
        <CheckoutHeader title="السلة" current={0} />
        <div className="container py-12">
          <EmptyState
            icon="bag"
            title="السلة فارغة"
            description="لم تضف أي منتج بعد. تصفح السوق وأضف ما تحتاجه."
            action={<ButtonLink to="/store">تصفح السوق</ButtonLink>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <CheckoutHeader title="السلة" current={0} description={`${count} ${count === 1 ? 'قطعة' : 'قطع'} في السلة`} />
      <div className="container grid gap-8 py-8 md:py-10 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-label="المنتجات في السلة">
          {multiVendor && (
            <p className="mb-3 text-sm text-muted">
              السلة فيها منتجات من {groups.length} متاجر. يصلك كل جزء من متجره، وتتابع الطلب كاملًا من حسابك.
            </p>
          )}
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-xl border border-line bg-surface">
                {multiVendor && (
                  <p className="border-b border-line bg-subtle/60 px-4 py-2.5 text-sm">
                    من متجر{' '}
                    {group.slug ? (
                      <Link to={`/store/vendor/${group.slug}`} className="font-semibold hover:underline">
                        {group.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{group.name}</span>
                    )}
                  </p>
                )}
              <ul className="divide-y divide-line">
                {group.items.map((i) => {
              const discounted = i.discountPercent > 0 && i.finalPrice < i.price;
              return (
                <li key={i.productId} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link to={`/store/${i.slug}`} className="w-24 shrink-0 overflow-hidden rounded-lg sm:w-28" tabIndex={-1} aria-hidden>
                    <ProductImage src={i.image} alt="" ratio="aspect-square" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[15px] font-semibold leading-snug sm:text-base">
                        <Link to={`/store/${i.slug}`} className="underline-offset-4 hover:underline">
                          {i.name}
                        </Link>
                      </h2>
                      <button
                        type="button"
                        onClick={() => remove(i.productId)}
                        className="-me-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-danger"
                        aria-label={`حذف ${i.name} من السلة`}
                      >
                        <Icon name="trash" className="h-5 w-5" />
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      سعر القطعة: <span className="font-medium text-ink">{formatJOD(i.finalPrice)}</span>
                      {discounted && (
                        <>
                          {' '}
                          <s aria-label={`قبل الخصم ${formatJOD(i.price)}`}>{formatJOD(i.price)}</s>
                        </>
                      )}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                      <QtyStepper value={i.quantity} max={Math.min(i.stock || 20, 20)} onChange={(v) => setQty(i.productId, v)} size="sm" />
                      <p className="text-end">
                        <span className="sr-only">المجموع: </span>
                        <span className="font-display font-semibold">{formatJOD(i.finalPrice * i.quantity)}</span>
                      </p>
                    </div>
                    {i.stock > 0 && i.quantity >= i.stock && (
                      <p className="mt-2 text-xs text-muted">
                        هذه كل الكمية المتوفرة (<span className="ltr">{i.stock}</span>).
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
              </div>
            ))}
          </div>
          <Link to="/store" className="group mt-5 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            <span className="underline-offset-4 group-hover:underline">متابعة التسوق</span>
          </Link>
        </section>

        <aside className="lg:col-span-4" aria-label="ملخص السلة">
          <div className="rounded-xl bg-subtle p-5 sm:p-6 lg:sticky lg:top-32">
            <h2 className="text-lg">ملخص الطلب</h2>
            <dl className="mt-4 space-y-2.5 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-muted">المجموع قبل الخصم</dt>
                <dd>{formatJOD(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">الخصم</dt>
                <dd className={discount > 0 ? 'text-success' : undefined}>{discount > 0 ? `− ${formatJOD(discount)}` : formatJOD(0)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line-strong pt-3">
                <dt className="font-semibold">الإجمالي</dt>
                <dd className="font-display text-2xl font-semibold">{formatJOD(total)}</dd>
              </div>
            </dl>
            <ButtonLink to="/checkout" size="lg" block className="mt-5 hidden lg:flex">
              إتمام الطلب <Icon name="arrowLeft" className="h-4 w-4" />
            </ButtonLink>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              الأسعار تُحسب من جديد عند إرسال الطلب حسب السعر والمخزون الحالي. نتواصل معك بعدها لتأكيد الطلب وموعد التوصيل.
            </p>
          </div>
        </aside>
      </div>
      {/* شريط الإتمام على الجوال */}
      <div className="sticky z-30 border-t border-line bg-surface px-4 py-3 lg:hidden" style={{ bottom: 'var(--tabbar-h)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted">الإجمالي</p>
            <p className="font-display text-lg font-semibold">{formatJOD(total)}</p>
          </div>
          <ButtonLink to="/checkout" size="lg">
            إتمام الطلب <Icon name="arrowLeft" className="h-4 w-4" />
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
