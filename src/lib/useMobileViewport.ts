import { useEffect } from 'react';

// iOS can keep the layout viewport taller than the visible browser area.
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--app-visible-bottom', `${bottom}px`);
    };
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--app-visible-bottom');
    };
  }, []);
}
