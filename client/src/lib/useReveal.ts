import { useEffect } from 'react';

/**
 * ظهور هادئ للعناصر عند التمرير إليها:
 * - data-reveal: العنصر نفسه يظهر (تلاشٍ + صعود خفيف)
 * - data-reveal-group: أبناؤه المباشرون يظهرون بالتتابع
 * العناصر تبقى ظاهرة إن لم يعمل JavaScript، ولا حركة مع "تقليل الحركة".
 */
const STAGGER_MS = 70;
const MAX_STAGGER = 6;

export function useReveal(root: HTMLElement | null, key: string) {
  useEffect(() => {
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // العناصر التي جهّزها هذا المراقب ولم تظهر بعد: تُعاد للمراقب التالي عند تغيّر الصفحة
    const pending = new Set<HTMLElement>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          pending.delete(el);
          const show = () => el.classList.add('is-revealed');
          // أثناء شاشة البداية ننتظر انتهاءها حتى لا تضيع الحركة تحتها
          if (document.documentElement.classList.contains('splash-active')) {
            window.addEventListener('vj:splash-done', show, { once: true });
            window.setTimeout(show, 2500); // احتياط إن لم يصل الحدث
          } else show();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    const prepare = (el: HTMLElement, delay = 0) => {
      if (el.dataset.revealReady) return;
      el.dataset.revealReady = '1';
      el.classList.add('reveal');
      if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`);
      pending.add(el);
      io.observe(el);
    };

    const scan = () => {
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => prepare(el));
      root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
        Array.from(group.children).forEach((child, i) => prepare(child as HTMLElement, Math.min(i, MAX_STAGGER) * STAGGER_MS));
      });
    };

    scan();
    // المحتوى الذي يُحمّل لاحقًا (صفحات lazy، منتجات من الخادم)
    const mo = new MutationObserver(() => scan());
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      // عند الانتقال لصفحة جديدة قد يلتقط هذا المراقب (قبل إيقافه) عناصر الصفحة الجديدة،
      // فنزيل علامة الجاهزية عنها ليجهّزها المراقب الجديد — وإلا بقيت مخفية حتى تحديث الصفحة
      for (const el of pending) delete el.dataset.revealReady;
      pending.clear();
    };
  }, [root, key]);
}
