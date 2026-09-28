import { useEffect, useRef, useState } from 'react';

/**
 * توقيع العميل على الشاشة (لمس أو فأرة). يعيد صورة PNG كـ data URL عند كل تغيير، أو null إن كان فارغًا.
 */
export function SignaturePad({ onChange, height = 180 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // مقاس اللوحة حسب عرض الحاوية وكثافة الشاشة
  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.parentElement!.clientWidth;
      c.width = w * ratio;
      c.height = height * ratio;
      c.style.width = `${w}px`;
      c.style.height = `${height}px`;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      setEmpty(true);
      onChange(null);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvas.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (!empty) onChange(canvas.current!.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-white">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="block touch-none"
          aria-label="توقيع العميل"
        />
        {empty && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-gray-400">وقّع هنا</span>}
      </div>
      <button type="button" onClick={clear} className="mt-1.5 text-sm text-muted underline-offset-4 hover:underline">
        مسح التوقيع
      </button>
    </div>
  );
}
