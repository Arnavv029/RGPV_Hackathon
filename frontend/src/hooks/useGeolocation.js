import { useCallback, useEffect, useState } from 'react';

/**
 * Browser geolocation with graceful degradation: the app stays fully usable
 * without a fix, distances simply disappear.
 */
export function useGeolocation({ auto = true } = {}) {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | locating | granted | denied | unsupported

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
    );
  }, []);

  useEffect(() => {
    if (auto) locate();
  }, [auto, locate]);

  return { coords, status, locate };
}
