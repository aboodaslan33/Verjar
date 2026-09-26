import { useCallback, useEffect, useState } from 'react';
import { Icon, Modal } from '../ui';
import type { BookingMedia } from './types';

const PURPOSE_LABEL: Record<string, string> = { photo: 'صور الموقع', design: 'ملفات التصميم' };

/** معرض مرفقات الحجز: صور بعارض مكبّر، فيديو، وملفات للتحميل */
export function MediaGallery({ media }: { media: BookingMedia[] }) {
  const images = media.filter((m) => m.kind === 'IMAGE');
  const videos = media.filter((m) => m.kind === 'VIDEO');
  const docs = media.filter((m) => m.kind === 'DOCUMENT');
  const [index, setIndex] = useState<number | null>(null);

  const go = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + images.length) % images.length)),
    [images.length],
  );
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      // RTL: السهم الأيسر = التالي
      if (e.key === 'ArrowLeft') go(1);
      if (e.key === 'ArrowRight') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, go]);

  if (!media.length) return <p className="text-sm text-muted">لا توجد مرفقات.</p>;
  const current = index !== null ? images[index] : null;

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {images.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-line bg-subtle"
                aria-label={`عرض الصورة ${i + 1}`}
              >
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                {m.purpose === 'design' && (
                  <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1.5 text-[10px] text-white">تصميم</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {videos.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {videos.map((v) => (
            <video key={v.id} src={v.url} controls preload="metadata" className="w-full rounded-lg border border-line bg-black" />
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id}>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-subtle"
              >
                <Icon name="file" className="h-4 w-4 text-muted" />
                <span className="flex-1 truncate">{d.originalName || 'ملف مرفق'}</span>
                <span className="text-xs text-muted">{PURPOSE_LABEL[d.purpose] ?? ''}</span>
                <Icon name="download" className="h-4 w-4 text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Modal open={current !== null} onClose={() => setIndex(null)} title={`صورة ${(index ?? 0) + 1} من ${images.length}`} size="lg">
        {current && (
          <div className="space-y-3">
            <div className="relative flex items-center justify-center rounded-lg bg-black/90">
              <img src={current.url} alt="" className="max-h-[70vh] w-auto object-contain" />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="absolute end-auto start-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink"
                    aria-label="السابق"
                  >
                    <Icon name="chevronRight" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink"
                    aria-label="التالي"
                  >
                    <Icon name="chevronLeft" />
                  </button>
                </>
              )}
            </div>
            <a href={current.url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-200">
              <Icon name="download" className="h-4 w-4" /> تحميل الصورة الأصلية
            </a>
          </div>
        )}
      </Modal>
    </div>
  );
}
