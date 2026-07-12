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

export interface IntroAttribution {
  label: string;
  href: string;
  author?: string;
  license?: string;
}

interface IntroCardProps {
  icon: string;
  name: string;
  short: string;
  hints?: IntroHint[];
  attributions?: IntroAttribution[];
  onDismiss: () => void;
}

export function IntroCard({ icon, name, short, hints = [], attributions = [], onDismiss }: IntroCardProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 6000);
    return () => clearTimeout(id);
  }, [onDismiss]);

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

        {attributions.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Inspired by / adapted from</p>
            <p className="mb-1.5 max-w-[24rem] text-[10px] leading-snug text-white/35">
              GLGameLab adapts reference ideas with original creative choices, controls, rendering, and engine integration.
            </p>
            <div className="grid grid-cols-1 gap-1">
              {attributions.map((attribution) => (
                <a
                  key={`${attribution.label}:${attribution.href}`}
                  href={attribution.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs leading-snug text-cyan-100/70 underline decoration-cyan-100/25 underline-offset-2 transition-colors hover:text-cyan-50"
                  onClick={(event) => event.stopPropagation()}
                >
                  {attribution.label}
                  {attribution.author ? ` by ${attribution.author}` : ''}
                  {attribution.license ? ` (${attribution.license})` : ''}
                </a>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-white/25">Tap anywhere to dismiss</p>
      </div>
    </motion.div>
  );
}
