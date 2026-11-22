import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let cancelled = false;

    const requestLock = async () => {
      if (!active || cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Ignore if battery saver / browser disallows wake lock
      }
    };

    const releaseLock = async () => {
      const current = sentinelRef.current;
      sentinelRef.current = null;
      if (current && !current.released) {
        try {
          await current.release();
        } catch {
          // Ignore release failure
        }
      }
    };

    if (active) {
      void requestLock();
    } else {
      void releaseLock();
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) {
        void requestLock();
      } else if (document.visibilityState === 'hidden') {
        void releaseLock();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void releaseLock();
    };
  }, [active]);
}
