import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { ExperienceStyle, ExperienceStyleManifest } from '@hooksjam/gl-game-lab-engine';

export interface StylePickerProps {
  manifest: ExperienceStyleManifest;
  value: string;
  onChange: (styleId: string) => void;
  /**
   * When true, renders a flat inline style list (no trigger button, no sheet).
   * Use when embedding inside another sheet such as OverflowMenu.
   */
  listMode?: boolean;
}

/** Small horizontal swatch strip showing up to 4 palette colours. */
function PaletteSwatch({ style }: { style: ExperienceStyle }) {
  const colours = style.palette.slice(0, 4);
  return (
    <div className="flex h-3 w-8 shrink-0 overflow-hidden rounded-sm">
      {colours.map((c) => (
        <div
          key={c}
          className="flex-1"
          style={{ backgroundColor: `#${c.toString(16).padStart(6, '0')}` }}
        />
      ))}
    </div>
  );
}

export function StylePicker({ manifest, value, onChange, listMode = false }: StylePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [btnRect, setBtnRect] = useState<{ top: number; bottom: number; left: number; right: number; width: number } | null>(null);

  const realStyles = manifest.styles.filter((s) => s.id !== '__random__');
  const current = realStyles.find((s) => s.id === value) ?? realStyles[0];

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setBtnRect({ top: r.top, bottom: r.bottom, left: r.left, right: window.innerWidth - r.right, width: r.width });
    }
    setOpen((o) => !o);
  };

  const handleSelect = (styleId: string) => {
    if (styleId === '__random__') {
      const pick = realStyles[Math.floor(Math.random() * realStyles.length)];
      if (pick) onChange(pick.id);
    } else {
      onChange(styleId);
    }
    setOpen(false);
  };

  const cycleNext = () => {
    const idx = realStyles.findIndex((s) => s.id === current?.id);
    const next = realStyles[(idx + 1) % realStyles.length];
    if (next) onChange(next.id);
  };

  // Close on outside click — must check both the pill and the portal dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Desktop: open upward when button is in lower 35% of screen
  const openUpward = btnRect ? btnRect.bottom > window.innerHeight * 0.65 : false;

  const styleList = manifest.styles.map((style) => {
    const active = style.id === value;
    const isRandom = style.id === '__random__';
    return (
      <button
        key={style.id}
        type="button"
        onClick={() => handleSelect(style.id)}
        className={`flex w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
          active ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'
        }`}
      >
        {!isRandom && <PaletteSwatch style={style} />}
        {isRandom && (
          <div className="flex h-3 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white/10 text-[7px] font-bold tracking-wider text-white/50">
            ?
          </div>
        )}
        <span className="flex-1 text-left">{style.name}</span>
        {active && <Check size={11} className="shrink-0 text-emerald-400" />}
      </button>
    );
  });

  // Inline list mode — renders flat inside a parent container (e.g. OverflowMenu sheet)
  if (listMode) {
    return <div className="px-1 pb-1">{styleList}</div>;
  }

  return (
    <div ref={ref} className="relative flex items-center overflow-hidden rounded-xl bg-black/30 backdrop-blur-md">
      {/* Main dropdown trigger */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        aria-label="Style"
        className="flex h-8 items-center gap-1.5 pl-2.5 pr-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
      >
        {current && <PaletteSwatch style={current} />}
        <span className="max-w-[80px] truncate">{current?.name ?? 'Style'}</span>
        <ChevronDown
          size={11}
          className={`shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Divider */}
      <div className="h-4 w-px bg-white/15" />

      {/* Cycle-to-next button */}
      <button
        type="button"
        onClick={cycleNext}
        aria-label="Next style"
        className="flex h-8 w-7 items-center justify-center text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        <ChevronRight size={13} />
      </button>

      {/* Floating dropdown panel — rendered via portal to escape backdrop-filter containing block */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && btnRect && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'fixed',
                ...(openUpward
                  ? { bottom: window.innerHeight - btnRect.top + 6 }
                  : { top: btnRect.bottom + 6 }),
                left: Math.max(8, Math.min(
                  btnRect.left + btnRect.width / 2 - Math.max(btnRect.width, 160) / 2,
                  window.innerWidth - Math.max(btnRect.width, 160) - 8,
                )),
                minWidth: Math.max(btnRect.width, 160),
              }}
              className="z-[9999] overflow-hidden rounded-xl bg-black/30 p-1 backdrop-blur-md"
            >
              {styleList}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
