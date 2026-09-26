import { lazy, Suspense, useState } from 'react';
import { cx } from '../../lib/format';
import { Button, Icon, Skeleton } from '../ui';

// Leaflet وملف CSS الخاص بها يُحمّلان فقط عند فتح الخريطة
const MapView = lazy(() => import('./MapView'));

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  required?: boolean;
  error?: string;
  /** نص توضيحي فوق الأزرار */
  hint?: string;
  field?: string;
};

function geoErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'رفضت الإذن بالوصول إلى موقعك. فعّل صلاحية الموقع للموقع الإلكتروني من إعدادات المتصفح، أو اختر الموقع من الخريطة.';
    case err.POSITION_UNAVAILABLE:
      return 'تعذر تحديد موقعك الآن. تأكد من تشغيل GPS في الجوال، أو اختر الموقع من الخريطة.';
    case err.TIMEOUT:
      return 'استغرق تحديد الموقع وقتًا طويلًا. حاول مرة أخرى في مكان مكشوف، أو اختر الموقع من الخريطة.';
    default:
      return 'تعذر تحديد الموقع. اختر الموقع من الخريطة.';
  }
}

/** تحديد الإحداثيات: زر GPS + خريطة اختيارية (Leaflet عند الطلب) */
export function LocationPicker({ lat, lng, onChange, required, error, hint, field = 'lat' }: Props) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const has = lat != null && lng != null;

  function locate() {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('متصفحك لا يدعم تحديد الموقع. اختر الموقع من الخريطة.');
      setShowMap(true);
      return;
    }
    if (!window.isSecureContext) {
      setGeoError('تحديد الموقع يتطلب اتصالًا آمنًا (https). اختر الموقع من الخريطة.');
      setShowMap(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setAccuracy(Math.round(pos.coords.accuracy));
        onChange(Math.round(pos.coords.latitude * 1e6) / 1e6, Math.round(pos.coords.longitude * 1e6) / 1e6);
      },
      (err) => {
        setLocating(false);
        setGeoError(geoErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div data-field={field}>
      <p className="label">
        إحداثيات الموقع
        {!required && <span className="ms-1 text-xs font-normal text-muted">(اختياري)</span>}
      </p>
      {hint && <p className="-mt-1 mb-2 text-sm text-muted">{hint}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant={has ? 'outline' : 'secondary'} size="lg" onClick={locate} loading={locating} block aria-invalid={Boolean(error) || undefined}>
          {!locating && <Icon name="gps" />}
          {locating ? 'جاري تحديد موقعك…' : has ? 'تحديث موقعي الحالي' : 'استخدم موقعي الحالي'}
        </Button>
        <Button variant="outline" size="lg" onClick={() => setShowMap((s) => !s)} block aria-expanded={showMap}>
          <Icon name="pin" />
          {showMap ? 'إخفاء الخريطة' : 'اختيار من الخريطة'}
        </Button>
      </div>

      {geoError && (
        <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink" role="alert">
          {geoError}
        </p>
      )}

      {showMap && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-none sm:h-80" />}>
            <MapView lat={lat} lng={lng} onPick={(a, b) => onChange(a, b)} />
          </Suspense>
          <p className="border-t border-line bg-subtle px-3 py-2 text-xs text-muted">
            اضغط على الخريطة لوضع الدبوس، واسحبه لتعديل المكان بدقة.
          </p>
        </div>
      )}

      <div
        className={cx(
          'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-3',
          has ? 'border-brand-300 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30' : 'border-dashed border-line',
          error && !has && 'border-danger/60',
        )}
      >
        {has ? (
          <>
            <div className="text-sm">
              <span className="font-semibold text-brand-800 dark:text-brand-100">تم تحديد الموقع</span>
              <span className="ms-2 text-muted">
                <span className="ltr">
                  {lat!.toFixed(5)}, {lng!.toFixed(5)}
                </span>
              </span>
              {accuracy != null && (
                <span className="ms-2 text-xs text-muted">
                  (دقة تقريبية <span className="ltr">{accuracy}</span> م)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-200"
              >
                عرض على الخريطة <Icon name="external" className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setAccuracy(null);
                  onChange(null, null);
                }}
                className="min-h-[44px] rounded-lg px-2 text-sm text-muted hover:text-danger"
              >
                مسح
              </button>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted">لم تُحدَّد الإحداثيات بعد.</span>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
