import * as React from 'react';

export function useScrollDirection(autoHideEnabled: boolean): {
  headerHidden: boolean;
  atTop: boolean;
} {
  const [scrollState, setScrollState] = React.useState({ headerHidden: false, atTop: true });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const atTop = y <= 24;
        const delta = y - lastY;

        setScrollState((prev) => {
          if (!autoHideEnabled || atTop) {
            if (!prev.headerHidden && prev.atTop === atTop) return prev;
            return { headerHidden: false, atTop };
          }
          if (delta > 12 && y > 64) {
            return prev.headerHidden && prev.atTop === atTop
              ? prev
              : { headerHidden: true, atTop };
          }
          if (delta < -8) {
            return !prev.headerHidden && prev.atTop === atTop
              ? prev
              : { headerHidden: false, atTop };
          }
          return prev.atTop === atTop ? prev : { ...prev, atTop };
        });

        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [autoHideEnabled]);

  if (!autoHideEnabled) {
    return { headerHidden: false, atTop: scrollState.atTop };
  }
  return scrollState;
}
