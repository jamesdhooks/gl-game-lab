/**
 * packages/react/src/ui/OverflowMenu.tsx
 *
 * Adaptive control cluster for the top-right corner of GameLauncher.
 *
 * Desktop / landscape: renders children directly (current pill-button row).
 * Mobile portrait:      renders a single ••• button that opens a BottomSheet
 *                       with each child action as a full-width list row.
 *
 * Consumers pass named `items` rather than raw children so the sheet can
 * render labelled rows with proper 44px touch targets.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { BottomSheet } from './BottomSheet.js';
import { useViewportContext } from '../ViewportProvider.js';

export interface OverflowItem {
  /** Unique key */
  key: string;
  /** Label shown in the mobile sheet row */
  label: string;
  /** Rendered as the pill control on desktop, or as the right-side control in a sheet row */
  node: React.ReactNode;
  /** If true, the item is hidden entirely (e.g. no quality modes defined) */
  hidden?: boolean;
  /**
   * When true, renders the node full-width with no label/justify-between split.
   * Used for multi-button controls like ModeToggle and StylePicker list.
   */
  fullWidth?: boolean;
  /** Section label shown above a fullWidth item */
  sectionLabel?: string;
  /** Close the collapsed menu before this control opens another surface. */
  closeOnActivate?: boolean;
}

export interface OverflowMenuProps {
  items: OverflowItem[];
  /** Collapse the desktop action row into an ellipsis dropdown. */
  compact?: boolean;
}

export function OverflowMenu({ items, compact = false }: OverflowMenuProps) {
  const { isMobile, isLandscape, safeArea } = useViewportContext();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [buttonRect, setButtonRect] = useState<{ bottom: number; right: number } | null>(null);

  const visible = items.filter((i) => !i.hidden);
  const topOffset = `${(safeArea.top || 0) + 12}px`;
  const mobileSheet = isMobile && !isLandscape;

  useEffect(() => {
    if (!open || mobileSheet) return;
    const closeOnOutsidePointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePointer);
    return () => { document.removeEventListener('mousedown', closeOnOutsidePointer); };
  }, [mobileSheet, open]);

  if (!mobileSheet && !compact) {
    // Desktop / landscape: render the row directly.
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
        className="pointer-events-none absolute right-3 z-30 flex items-center gap-1.5"
        style={{ top: topOffset }}
      >
        {visible.map((item) => (
          <div key={item.key} className="pointer-events-auto">
            {item.node}
          </div>
        ))}
      </motion.div>
    );
  }

  const rows = visible.map((item) => item.fullWidth ? (
    <div key={item.key} className="py-1" onClickCapture={item.closeOnActivate ? () => { setOpen(false); } : undefined}>
      {item.sectionLabel && <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">{item.sectionLabel}</p>}
      {item.node}
    </div>
  ) : (
    <div key={item.key} className="flex min-h-touch items-center justify-between gap-3 rounded-xl px-2 py-2" onClickCapture={item.closeOnActivate ? () => { setOpen(false); } : undefined}>
      <span className="text-sm font-medium text-white/70">{item.label}</span>
      <div className="flex shrink-0 items-center">{item.node}</div>
    </div>
  ));

  if (!mobileSheet) {
    const toggleMenu = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setButtonRect({ bottom: rect.bottom, right: rect.right });
      setOpen((current) => !current);
    };
    return (
      <>
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }} className="pointer-events-none absolute right-3 z-30" style={{ top: topOffset }}>
          <button ref={buttonRef} className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" onClick={toggleMenu} aria-label="More controls" aria-expanded={open}>
            <MoreHorizontal size={15} />
          </button>
        </motion.div>
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {open && buttonRect && (
              <motion.div ref={menuRef} initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.12 }} style={{ position: 'fixed', top: buttonRect.bottom + 6, right: Math.max(8, window.innerWidth - buttonRect.right) }} className="z-[9999] w-64 overflow-hidden rounded-xl bg-zinc-950 p-1 shadow-2xl ring-1 ring-white/15">
                <div className="flex max-h-[min(30rem,calc(100vh-4rem))] flex-col overflow-y-auto px-1 py-1">{rows}</div>
              </motion.div>
            )}
          </AnimatePresence>, document.body,
        )}
      </>
    );
  }

  // Mobile portrait: single ••• button.
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
        className="pointer-events-none absolute right-3 z-30"
        style={{ top: topOffset }}
      >
        <button
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"
          onClick={() => setOpen(true)}
          aria-label="More controls"
          aria-expanded={open}
        >
          <MoreHorizontal size={15} />
        </button>
      </motion.div>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Controls">
        <div className="flex flex-col px-3 pb-3">
          {rows}
        </div>
      </BottomSheet>
    </>
  );
}
