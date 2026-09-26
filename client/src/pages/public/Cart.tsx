import { Link } from 'react-router-dom';
import { ProductImage } from '../../components/store/ProductCard';
import { QtyStepper } from '../../components/store/QtyStepper';
import { ButtonLink, EmptyState, Icon, PageHeader } from '../../components/ui';
import { useCart } from '../../context/CartContext';
import { formatJOD } from '../../lib/format';
import { useDocumentTitle } from '../../lib/useAsync';

export default function Cart() {
  useDocumentTitle('السلة');
  const { items, count, subtotal, discount, total, setQty, remove } = useCart();

  if (items.length === 0) {
    return (
      <>
        <PageHeader title="السلة" />
        <div className="container py-12">
          <EmptyState
            title="السلة فارغة"
            description="لم تضف أي منتج بعد. تصفح المتجر وأضف ما تحتاجه."
            action={<ButtonLink to="/store">تصفح المتجر</ButtonLink>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="السلة"
        description={
          <>
            <span className="ltr">{count}</span> {count === 1 ? 'قطعة' : 'قطع'} في السلة
          </>
        }
      />
      <div className="container grid gap-8 py-8 md:py-10 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-label="المنتجات في السلة">
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.map((i) => {
              const discounted = i.discountPercent > 0 && i.finalPrice < i.price;
              return (
                <li key={i.productId} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <Link to={`/store/${i.slug}`} className="w-24 shrink-0 overflow-hidden rounded-xl sm:w-32" tabIndex={-1} aria-hidden>
                    <ProductImage src={i.image} alt="" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[15px] font-semibold leading-snug sm:text-base">
                        <Link to={`/store/${i.slug}`} className="hover:text-brand-600 dark:hover:text-brand-200">
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
                      <QtyStepper value={i.quantity} max={i.stock || 99} onChange={(v) => setQty(i.productId, v)} size="sm" />
                      <p className="text-end">
                        <span className="sr-only">المجموع: </span>
                        <span className="font-bold">{formatJOD(i.finalPrice * i.quantity)}</span>
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
          <Link to="/store" className="mt-4 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-200">
            <Icon name="chevronRight" className="h-4 w-4" /> متابعة التسوق
          </Link>
        </section>

        <aside className="lg:col-span-4" aria-label="ملخص السلة">
          <div className="card p-5 lg:sticky lg:top-24">
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
              <div className="flex justify-between border-t border-line pt-3 text-lg font-bold">
                <dt>الإجمالي</dt>
                <dd>{formatJOD(total)}</dd>
              </div>
            </dl>
            <ButtonLink to="/checkout" size="lg" block className="mt-5">
              إتمام الطلب
            </ButtonLink>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              الأسعار تُحسب من جديد عند إرسال الطلب حسب السعر والمخزون الحالي. نتواصل معك بعدها لتأكيد الطلب وموعد التوصيل.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
