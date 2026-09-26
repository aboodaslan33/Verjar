import { Button } from './Button';
import { Icon } from './Icon';

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="الصفحات">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="الصفحة السابقة">
        <Icon name="chevronRight" className="h-4 w-4" /> السابق
      </Button>
      <span className="text-sm text-muted">
        صفحة <b className="text-ink">{page}</b> من {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="الصفحة التالية">
        التالي <Icon name="chevronLeft" className="h-4 w-4" />
      </Button>
    </nav>
  );
}
