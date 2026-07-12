/**
 * packages/react/src/ViewportProvider.tsx
 *
 * React context that exposes viewport state (isMobile, isLandscape, safeArea)
 * to all descendant UI components. Mounted once inside GameLauncher.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useViewport, type ViewportState } from './hooks/useViewport.js';

const ViewportContext = createContext<ViewportState>({
  isMobile: false,
  isLandscape: false,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
});

export function ViewportProvider({ children }: { children: ReactNode }) {
  const viewport = useViewport();
  return <ViewportContext.Provider value={viewport}>{children}</ViewportContext.Provider>;
}

/** Consume viewport state anywhere inside GameLauncher. */
export function useViewportContext(): ViewportState {
  return useContext(ViewportContext);
}
