import { cx } from '../lib/format';

/** بنود السياسة: كل سطر بند، و"العنوان: النص" يظهر فيه العنوان بخط عريض */
export function PolicyList({ text, className, compact = false }: { text: string; className?: string; compact?: boolean }) {
  const items = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!items.length) return null;
  return (
    <ol className={cx('space-y-3', className)}>
      {items.map((line, i) => {
        const m = /^([^:：]{2,40})[:：]\s*(.+)$/.exec(line);
        return (
          <li key={i} className="flex gap-3">
            <span className={cx('num grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-ink', compact ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-sm')}>{i + 1}</span>
            <p className={cx('leading-relaxed', compact ? 'text-sm' : 'text-[15px]')}>
              {m ? (
                <>
                  <b className="font-semibold">{`${m[1]}:`}</b> <span className="text-muted">{m[2]}</span>
                </>
              ) : (
                <span className="text-muted">{line}</span>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
