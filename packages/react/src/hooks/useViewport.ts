/**
 * packages/react/src/hooks/useViewport.ts
 *
 * Reactive viewport state: mobile breakpoint, orientation, and CSS safe-area insets.
 * Mount once via ViewportProvider — never call window.innerWidth directly elsewhere.
 */
import { useState, useEffect, useRef } from 'react';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportState {
  /** true when viewport width ≤ 639 px (below Tailwind sm: breakpoint) */
  isMobile: boolean;
  /** true when device is in landscape orientation */
  isLandscape: boolean;
  /** CSS env(safe-area-inset-*) values in pixels */
  safeArea: SafeAreaInsets;
}

/** Read a single `env(safe-area-inset-*)` value from a probe element (px integer). */
function readInset(el: HTMLElement, prop: string): number {
  el.style.setProperty('padding', `env(${prop})`);
  return parseFloat(getComputedStyle(el).paddingTop) || 0;
}

function readSafeArea(probe: HTMLElement): SafeAreaInsets {
  return {
    top:    readInset(probe, 'safe-area-inset-top'),
    right:  readInset(probe, 'safe-area-inset-right'),
    bottom: readInset(probe, 'safe-area-inset-bottom'),
    left:   readInset(probe, 'safe-area-inset-left'),
  };
}

const MOBILE_MQ = '(max-width: 639px)';
const LANDSCAPE_MQ = '(orientation: landscape)';

export function useViewport(): ViewportState {
  const probeRef = useRef<HTMLElement | null>(null);

  const [state, setState] = useState<ViewportState>(() => ({
    isMobile: typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
    isLandscape: typeof window !== 'undefined' && window.matchMedia(LANDSCAPE_MQ).matches,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  }));

  useEffect(() => {
    // Create a hidden probe element to read safe-area insets via computed style.
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    probeRef.current = probe;

    const mobileMQ = window.matchMedia(MOBILE_MQ);
    const landscapeMQ = window.matchMedia(LANDSCAPE_MQ);

    const update = () => {
      setState({
        isMobile: mobileMQ.matches,
        isLandscape: landscapeMQ.matches,
        safeArea: readSafeArea(probe),
      });
    };

    // Read initial values after probe is in DOM.
    update();

    mobileMQ.addEventListener('change', update);
    landscapeMQ.addEventListener('change', update);
    // Safe-area insets can change on orientation change.
    window.addEventListener('resize', update);

    return () => {
      mobileMQ.removeEventListener('change', update);
      landscapeMQ.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      probe.remove();
      probeRef.current = null;
    };
  }, []);

  return state;
}
