import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tokenColor } from '../../lib/tokens';

/** خريطة OSM للعرض فقط — تُحمّل عند الطلب (حزمة منفصلة) */
export default function LeafletMap({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    // دائرة بدل أيقونة الدبوس الافتراضية (تتجنب مشاكل مسارات الصور مع Vite)
    const marker = L.circleMarker([lat, lng], {
      radius: 9,
      color: tokenColor('c-ink'),
      weight: 3,
      fillColor: tokenColor('c-primary'),
      fillOpacity: 1,
    }).addTo(map);
    if (label) marker.bindTooltip(label);
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      map.remove();
    };
  }, [lat, lng, label]);

  return <div ref={ref} className="h-full w-full" />;
}
