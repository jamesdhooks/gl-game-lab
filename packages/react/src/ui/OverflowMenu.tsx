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
import { useState } from 'react';
import { motion } from 'framer-motion';
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
}

export interface OverflowMenuProps {
  items: OverflowItem[];
}

export function OverflowMenu({ items }: OverflowMenuProps) {
  const { isMobile, isLandscape, safeArea } = useViewportContext();
  const [open, setOpen] = useState(false);

  const visible = items.filter((i) => !i.hidden);
  const topOffset = `${(safeArea.top || 0) + 12}px`;

  if (!isMobile || isLandscape) {
    // Desktop / landscape: render the row directly.
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
        className="pointer-events-none absolute right-3 z-[60] flex items-center gap-1.5"
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

  // Mobile portrait: single ••• button.
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
        className="pointer-events-none absolute right-3 z-[60]"
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
          {visible.map((item) =>
            item.fullWidth ? (
              <div key={item.key} className="py-1">
                {item.sectionLabel && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                    {item.sectionLabel}
                  </p>
                )}
                {item.node}
              </div>
            ) : (
              <div
                key={item.key}
                className="flex min-h-touch items-center justify-between gap-3 rounded-xl px-2 py-2"
              >
                <span className="text-sm font-medium text-white/70">{item.label}</span>
                <div className="flex shrink-0 items-center">{item.node}</div>
              </div>
            )
          )}
        </div>
      </BottomSheet>
    </>
  );
}
