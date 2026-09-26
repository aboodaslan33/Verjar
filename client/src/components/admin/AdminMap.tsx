import { Component, lazy, Suspense, type ReactNode } from 'react';
import { ButtonA, Icon, Skeleton } from '../ui';

const LeafletMap = lazy(() => import('./LeafletMap'));

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return <div className="grid h-full place-items-center text-sm text-muted">تعذر تحميل الخريطة</div>;
    return this.props.children;
  }
}

/** موقع على الخريطة + رابط خرائط جوجل */
export function AdminMap({ lat, lng, label, address }: { lat: number | null; lng: number | null; label?: string; address?: string }) {
  if (lat == null || lng == null) {
    return (
      <div className="space-y-2">
        {address && <p className="text-[15px]">{address}</p>}
        <p className="text-sm text-muted">لم يحدد العميل الموقع على الخريطة.</p>
        {address && (
          <ButtonA href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
            <Icon name="pin" className="h-4 w-4" /> بحث عن العنوان في خرائط جوجل
          </ButtonA>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {address && <p className="text-[15px]">{address}</p>}
      <div className="h-60 overflow-hidden rounded-xl border border-line bg-subtle">
        <MapBoundary>
          <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
            <LeafletMap lat={lat} lng={lng} label={label} />
          </Suspense>
        </MapBoundary>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonA href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
          <Icon name="external" className="h-4 w-4" /> فتح في خرائط جوجل
        </ButtonA>
        <span className="ltr text-xs text-muted">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
