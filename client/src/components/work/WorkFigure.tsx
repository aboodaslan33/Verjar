import { cx } from '../../lib/format';
import type { Work } from '../../lib/works';

/** صورة عمل مع التصنيف والعنوان — نسبة ثابتة حتى لا تتحرك الصفحة أثناء التحميل */
export function WorkFigure({ work, className, ratio = 'aspect-[4/5]', eager = false, showText = true }: {
  work: Work;
  className?: string;
  ratio?: string;
  eager?: boolean;
  showText?: boolean;
}) {
  return (
    <figure className={cx('group', className)}>
      <div className={cx('overflow-hidden rounded-xl bg-subtle', ratio)}>
        <img
          src={work.src}
          width={work.width}
          height={work.height}
          alt={work.title}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
      <figcaption className="mt-4">
        <span className="text-xs font-semibold text-accent">{work.category}</span>
        <span className="mt-1 block text-lg font-semibold text-ink">{work.title}</span>
        {showText && <span className="mt-1 block text-[15px] leading-relaxed text-muted">{work.text}</span>}
      </figcaption>
    </figure>
  );
}
