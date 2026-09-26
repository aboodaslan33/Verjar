/**
 * خريطة اختيار الموقع — تُحمّل عند الطلب فقط (React.lazy) حتى لا تدخل Leaflet في الحزمة الرئيسية.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const AMMAN: [number, number] = [31.9539, 35.9106];

// دبوس بسيط بألوان الهوية بدل صور Leaflet الافتراضية (لا تعمل مع الحزم)
const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#E8B40B;border:3px solid #1F2937;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export default function MapView({
  lat,
  lng,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!el.current) return;
    const hasPoint = lat != null && lng != null;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
      hasPoint ? [lat!, lng!] : AMMAN,
      hasPoint ? 16 : 12,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);

    const place = (p: L.LatLng) => {
      const round = (v: number) => Math.round(v * 1e6) / 1e6;
      pickRef.current(round(p.lat), round(p.lng));
    };
    m.on('click', (e: L.LeafletMouseEvent) => place(e.latlng));
    map.current = m;
    // إعادة حساب الحجم بعد ظهور الحاوية
    const t = window.setTimeout(() => m.invalidateSize(), 150);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مزامنة الدبوس مع القيم (من الخريطة أو من زر GPS)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (lat == null || lng == null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const mk = L.marker([lat, lng], { draggable: true, icon: pinIcon, keyboard: true, title: 'موقع العمل' }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        pickRef.current(Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6);
      });
      marker.current = mk;
    } else {
      marker.current.setLatLng([lat, lng]);
    }
    if (!m.getBounds().pad(-0.1).contains([lat, lng])) m.setView([lat, lng], Math.max(m.getZoom(), 15));
  }, [lat, lng]);

  return <div ref={el} className="h-72 w-full sm:h-80" role="application" aria-label="خريطة لاختيار موقع العمل" />;
}
