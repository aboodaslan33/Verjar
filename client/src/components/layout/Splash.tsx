import { useLayoutEffect, useRef } from 'react';
import { LogoContent } from './Logo';

const SEEN_KEY = 'vj-splash-seen';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** حجم الشعار في منتصف الشاشة مقارنة بحجمه في الهيدر */
const BIG = 2;
const ENTER_MS = 500;
const HOLD_MS = 400;
const MOVE_MS = 750;

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // التخزين غير متاح
  }
}

/** تظهر مرة واحدة في الجلسة، لا تظهر في لوحة التحكم، ولا مع تقليل الحركة */
export function shouldShowSplash(pathname: string) {
  if (typeof window === 'undefined' || pathname.startsWith('/admin') || pathname.startsWith('/vendor')) return false;
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
  } catch {
    return false;
  }
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof Element.prototype.animate !== 'function') {
    markSeen();
    return false;
  }
  return true;
}

/**
 * شاشة البداية: الشعار يظهر في المنتصف (fade + scale) ثم ينزلق بتقنية FLIP
 * إلى مكانه الحقيقي في الهيدر، بينما تظهر الصفحة تدريجيًا خلفه.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const bgRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bg = bgRef.current;
    const logo = logoRef.current;
    if (!bg || !logo) return;
    const root = document.documentElement;
    root.classList.add('splash-active');
    let alive = true;
    let timer = 0;
    const running: Animation[] = [];
    const play = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      const a = el.animate(frames, { fill: 'forwards', ...opts });
      running.push(a);
      return a.finished;
    };
    const finish = () => {
      if (!alive) return;
      markSeen();
      root.classList.remove('splash-active');
      window.dispatchEvent(new Event('vj:splash-done'));
      onDone();
    };

    (async () => {
      try {
        // 1) الظهور في المنتصف
        await play(logo, [
          { opacity: 0, transform: `scale(${BIG * 0.9})` },
          { opacity: 1, transform: `scale(${BIG})` },
        ], { duration: ENTER_MS, easing: EASE });
        // 2) الثبات
        await new Promise<void>((r) => (timer = window.setTimeout(r, HOLD_MS)));
        if (!alive) return;

        // 3) FLIP: من المنتصف (First) إلى مكان الشعار في الهيدر (Last)
        const anchor = document.querySelector<HTMLElement>('[data-splash-anchor]');
        const target = anchor?.getBoundingClientRect();
        const from = logo.getBoundingClientRect();
        bg.style.pointerEvents = 'none';
        const fade = play(bg, [{ opacity: 1 }, { opacity: 0 }], { duration: MOVE_MS, easing: 'ease-out' });
        if (target && target.width > 0 && target.bottom > 0) {
          const dx = target.left + target.width / 2 - (from.left + from.width / 2);
          const dy = target.top + target.height / 2 - (from.top + from.height / 2);
          const scale = target.width / logo.offsetWidth;
          await Promise.all([
            fade,
            play(logo, [
              { transform: `translate(0px, 0px) scale(${BIG})` },
              { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
            ], { duration: MOVE_MS, easing: EASE }),
          ]);
        } else {
          await Promise.all([fade, play(logo, [{ opacity: 1 }, { opacity: 0 }], { duration: MOVE_MS / 2, easing: 'ease-out' })]);
        }
      } catch {
        // أُلغيت الحركة (تغيير الصفحة أو إعادة التركيب)
      }
      finish();
    })();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      running.forEach((a) => a.cancel());
      root.classList.remove('splash-active');
    };
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100]" aria-hidden>
      <div ref={bgRef} className="absolute inset-0 bg-bg" />
      <div className="absolute inset-0 grid place-items-center">
        <div ref={logoRef} className="flex items-center opacity-0 will-change-transform">
          <LogoContent />
        </div>
      </div>
    </div>
  );
}
