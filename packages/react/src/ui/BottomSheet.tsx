/**
 * packages/react/src/ui/BottomSheet.tsx
 *
 * Mobile-first sheet that slides up from the bottom.
 * Used by OverflowMenu, SettingsDrawer, StylePicker on mobile.
 *
 * Props:
 *   open      — controlled visibility
 *   onClose   — called on backdrop tap or drag-down
 *   title     — optional header text
 *   children  — sheet content
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useViewportContext } from '../ViewportProvider.js';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const { safeArea } = useViewportContext();

  // Prevent body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="bs-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/30"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            key="bs-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.3 }}
            onDragEnd={(_e, info) => {
              if (info.velocity.y > 300 || info.offset.y > 120) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[81] flex max-h-[80dvh] flex-col rounded-t-2xl bg-black/90 ring-1 ring-white/10 shadow-2xl"
            style={{ paddingBottom: safeArea.bottom || undefined }}
          >
            {/* Drag handle */}
            <div className="flex shrink-0 justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex shrink-0 items-center justify-between px-5 py-3">
                <span className="text-sm font-bold text-white">{title}</span>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
