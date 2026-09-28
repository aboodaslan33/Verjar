import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cx } from '../../lib/format';
import { EmptyState, ErrorState, Pagination, Skeleton } from '../ui';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** إخفاء العمود في بطاقة الجوال */
  hideOnMobile?: boolean;
  align?: 'start' | 'end' | 'center';
};

/**
 * جدول بيانات متجاوب:
 * - على الشاشات المتوسطة فأكبر: جدول
 * - على الجوال: بطاقات مكدسة (العمود الأول عنوان البطاقة)
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  loading,
  error,
  onRetry,
  empty,
  page,
  pages,
  onPage,
  total,
  refreshing,
  rowClassName,
}: {
  rows: T[] | undefined | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  page?: number;
  pages?: number;
  onPage?: (p: number) => void;
  total?: number;
  refreshing?: boolean;
  rowClassName?: (row: T) => string | undefined;
}) {
  const navigate = useNavigate();

  if (error && !rows?.length) return <ErrorState message={error.message} onRetry={onRetry} />;

  if (loading && !rows) {
    return (
      <div className="card overflow-hidden" role="status" aria-label="جاري التحميل">
        <div className="hidden border-b border-line bg-subtle/60 px-4 py-3 md:flex md:gap-6">
          {columns.slice(0, 6).map((c) => (
            <Skeleton key={c.key} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-line px-4 py-4 last:border-0">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="hidden h-4 w-1/6 md:block" />
            <Skeleton className="ms-auto h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={empty?.title ?? 'لا توجد بيانات'} description={empty?.description} action={empty?.action} />;
  }

  const alignCls = (a?: Column<T>['align']) => (a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start');
  const [first, ...rest] = columns;

  return (
    <div className={cx('transition-opacity', refreshing && 'opacity-70')}>
      {total !== undefined && (
        <p className="mb-2 text-xs text-muted">
          <span className="num font-semibold text-ink">{total.toLocaleString('en-US')}</span> نتيجة
        </p>
      )}

      {/* جدول — شاشات متوسطة فأكبر */}
      <div className="card hidden overflow-x-auto md:block print:block print:overflow-visible">
        <table className="w-full text-sm print:text-[9px]">
          <thead>
            <tr className="border-b border-line bg-subtle text-xs text-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cx('whitespace-nowrap px-4 py-3 font-semibold print:px-1.5 print:py-1', alignCls(c.align), c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  onClick={
                    href
                      ? (e) => {
                          const t = e.target as HTMLElement;
                          if (t.closest('a,button,input,select,label,textarea')) return;
                          navigate(href);
                        }
                      : undefined
                  }
                  className={cx(
                    'border-b border-line align-middle transition-colors last:border-0',
                    href && 'cursor-pointer hover:bg-subtle/70',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx('px-4 py-3.5 print:px-1.5 print:py-1', alignCls(c.align), c.className)}>
                      {i === 0 && href ? (
                        <Link to={href} className="font-medium text-ink underline-offset-4 hover:underline">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* بطاقات — الجوال */}
      <ul className="space-y-2.5 md:hidden print:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const body = (
            <>
              <div className="font-semibold">{first.cell(row)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {rest
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] text-muted">{c.header}</dt>
                      <dd className="truncate">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </>
          );
          return (
            <li key={rowKey(row)} className={cx('card p-4 transition-colors active:bg-subtle', rowClassName?.(row))}>
              {href ? (
                <Link to={href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>

      {page !== undefined && pages !== undefined && onPage && <Pagination page={page} pages={pages} onChange={onPage} />}
    </div>
  );
}
