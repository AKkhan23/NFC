import { useCallback, useEffect, useState } from 'react';

/** Update prompt for long-lived kiosk tabs. Pairs with main.tsx registration. */
export function useSwUpdate() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const onUpdate = (): void => setAvailable(true);
    window.addEventListener('sw-update-available', onUpdate);
    return () => window.removeEventListener('sw-update-available', onUpdate);
  }, []);

  const apply = useCallback(() => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
        // Fallback: if nothing was waiting, just reload.
        window.setTimeout(() => window.location.reload(), 1500);
      })
      .catch(() => window.location.reload());
  }, []);

  return { available, apply };
}
