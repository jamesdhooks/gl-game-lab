/**
 * components/games/ui/IntroCard.tsx
 *
 * Large centred info card shown when a game/sim starts.
 * Shows icon, name, short description, and a compact gesture → action cheat-sheet.
 * Auto-dismisses after 6 s or on tap.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';

export interface IntroHint {
  label: string;   // gesture label e.g. "Tap"
  action: string;  // action description e.g. "place wave source"
}

interface IntroCardProps {
  icon: string;
  name: string;
  short: string;
  hints?: IntroHint[];
  /** When false the card stays until the user taps. Defaults to true. */
  autoDismiss?: boolean;
  onDismiss: () => void;
}

export function IntroCard({ icon, name, short, hints = [], autoDismiss = true, onDismiss }: IntroCardProps) {
  useEffect(() => {
    if (!autoDismiss) return;
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [onDismiss, autoDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, x: '-50%', y: 'calc(-50% + 12px)' }}
      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
      exit={{ opacity: 0, scale: 0.94, x: '-50%', y: 'calc(-50% + 6px)' }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      className="gl-experience-intro-card fixed left-1/2 top-1/2 z-[9999] w-max min-w-[260px] max-w-[min(460px,calc(100vw-32px))] cursor-pointer pointer-events-auto"
      onClick={onDismiss}
    >
      <div className="rounded-2xl bg-black/75 px-7 py-6 shadow-2xl backdrop-blur-xl">
        {/* Header row */}
        <div className="flex items-center gap-4 mb-1">
          <span className="shrink-0 text-5xl leading-none text-white">{icon}</span>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight text-white">{name}</p>
            <p className="mt-0.5 text-sm leading-snug text-white/50">{short}</p>
          </div>
        </div>

        {/* Gesture cheat-sheet */}
        {hints.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4 grid grid-cols-1 gap-1.5">
            {hints.map((h) => (
              <div key={h.label} className="flex items-baseline gap-2.5 text-sm">
                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-white/60">
                  {h.label}
                </span>
                <span className="text-white/70">{h.action}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-white/25">{autoDismiss ? 'Tap anywhere to dismiss' : 'Tap to close'}</p>
      </div>
    </motion.div>
  );
}
