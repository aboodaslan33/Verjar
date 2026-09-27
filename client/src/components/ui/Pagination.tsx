import { cx } from '../../lib/format';
import { Icon } from './Icon';

/** أرقام الصفحات حول الصفحة الحالية مع فواصل */
function pageList(page: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = 'grid h-10 min-w-10 place-items-center rounded-lg px-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40';
  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="الصفحات">
      <button type="button" className={cx(btn, 'hover:bg-subtle')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة">
        <Icon name="chevronRight" className="h-4 w-4" />
      </button>
      {pageList(page, pages).map((p, i) =>
        p === '…' ? (
          <span key={`g${i}`} className="px-1 text-muted" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cx(btn, 'num', p === page ? 'bg-ink font-semibold text-bg' : 'text-ink hover:bg-subtle')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={cx(btn, 'hover:bg-subtle')} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية">
        <Icon name="chevronLeft" className="h-4 w-4" />
      </button>
    </nav>
  );
}
