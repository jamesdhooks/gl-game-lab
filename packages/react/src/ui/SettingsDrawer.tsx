/**
 * components/games/ui/SettingsDrawer.tsx
 *
 * Game/simulation settings panel — a compact dropdown anchored to the top-right
 * controls bar. Opens below the settings button with a slide-down animation.
 * Less blur, less dramatic than a full modal.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, Check } from 'lucide-react';
import type {
  ExperienceSetting,
  ExperienceSettingValue,
  NumberSetting,
  SelectSetting,
} from '@hooksjam/gl-game-lab-engine';
import { BottomSheet } from './BottomSheet.js';
import { useViewportContext } from '../ViewportProvider.js';

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  values: Readonly<Record<string, ExperienceSettingValue>>;
  fields: readonly ExperienceSetting[];
  onChange: (setting: ExperienceSetting, value: ExperienceSettingValue) => void;
  maxPixels?: number;
  onMaxPixelsChange?: (v: number | undefined) => void;
  ariaLabel?: string;
}

export function SettingsDrawer({ open, onClose, values, fields, onChange, maxPixels, onMaxPixelsChange, ariaLabel }: SettingsDrawerProps) {
  const { isMobile, isLandscape } = useViewportContext();
  const [vals, setVals] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      next[f.key] = values[f.key] ?? f.default;
    }
    setVals(next);
  }, [open, fields, values]);

  const apply = (key: string, value: unknown) => {
    const field = fields.find((candidate) => candidate.key === key);
    if (field) onChange(field, value as ExperienceSettingValue);
    setVals((prev) => ({ ...prev, [key]: value }));
  };

  const PIXEL_PRESETS: Array<{ label: string; sub: string; value: number | undefined }> = [
    { label: 'Off', sub: 'unlimited', value: undefined },
    { label: '360p', sub: '640×360', value: 230_400 },
    { label: '720p', sub: '1280×720', value: 921_600 },
    { label: '1080p', sub: '1920×1080', value: 2_073_600 },
  ];

  const normalFields = fields.filter((field) => !field.advanced);
  const advancedFields = fields.filter((field) => field.advanced);
  const renderFieldSection = (label: string, sectionFields: readonly ExperienceSetting[]) =>
    sectionFields.length > 0 ? (
      <>
        <div className="mx-0 my-2 h-px bg-white/8" />
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</p>
        {sectionFields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={vals[field.key]}
            onChange={(v) => apply(field.key, v)}
          />
        ))}
      </>
    ) : null;

  const content = (
    <div className="p-3 space-y-0.5">
      {/* ── Common: resolution (pixel budget) ── */}
      <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">Resolution</p>
      <div className="grid grid-cols-4 gap-1 mb-2">
        {PIXEL_PRESETS.map(({ label, sub, value }) => (
          <button
            key={label}
            onClick={() => onMaxPixelsChange?.(value)}
            className={`flex flex-col items-center py-1.5 rounded-xl transition-colors ${
              maxPixels === value
                ? 'bg-white/15 text-white'
                : 'bg-white/[0.05] text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            <span className="text-[11px] font-bold leading-none">{label}</span>
            <span className="text-[9px] mt-0.5 opacity-60">{sub}</span>
          </button>
        ))}
      </div>

      {/* ── Experience-specific settings ── */}
      {renderFieldSection('Experience', normalFields)}
      {renderFieldSection('Advanced', advancedFields)}
    </div>
  );

  // Mobile portrait — render as a BottomSheet
  if (isMobile && !isLandscape) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Settings">
        {content}
      </BottomSheet>
    );
  }

  // Desktop / landscape — existing dropdown anchored top-right
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Transparent click-catcher for outside-dismiss */}
          <div className="absolute inset-0 z-40" onClick={onClose} />

          {/* Dropdown panel — slides in from top-right */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-3 top-12 z-50 w-[min(30rem,calc(100vw-1.5rem))] max-h-[76vh] overflow-y-auto rounded-2xl bg-black/80 shadow-xl backdrop-blur-md ring-1 ring-white/12"
            aria-label={ariaLabel}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-sm font-bold text-white">Settings</h3>
              <button
                onClick={onClose}
                className="text-white/40 transition-colors hover:text-white"
                aria-label="Close settings"
              >
                <X size={14} />
              </button>
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-white/8" />

            {content}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ExperienceSetting;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div data-experience-setting className="flex items-start justify-between gap-4 rounded-xl px-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{field.label}</p>
        {field.description && (
          <p className="mt-0.5 text-xs leading-snug text-white/45">{field.description}</p>
        )}
      </div>

      <div className="shrink-0 pt-0.5">
        {field.type === 'boolean' && (
          <ToggleSwitch value={Boolean(value)} onChange={onChange} />
        )}
        {field.type === 'number' && (
          <NumberSlider field={field} value={value} onChange={onChange} />
        )}
        {field.type === 'select' && (
          <CustomSelect field={field} value={value} onChange={onChange} />
        )}
        {field.type === 'string' && (
          <StringInput value={value} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: unknown) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
        value ? 'bg-emerald-500' : 'bg-white/15'
      }`}
    >
      <motion.div
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-md"
        animate={{ x: value ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

// ── Number slider ─────────────────────────────────────────────────────────────

function NumberSlider({
  field,
  value,
  onChange,
}: {
  field: NumberSetting;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const num = typeof value === 'number' ? value : field.default;
  const powerOfTwo = field.numericScale === 'powerOfTwo';
  const sliderValue = powerOfTwo ? Math.round(Math.log2(Math.max(1, num))) : num;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={powerOfTwo ? Math.ceil(Math.log2(field.min)) : field.min}
        max={powerOfTwo ? Math.floor(Math.log2(field.max)) : field.max}
        step={powerOfTwo ? 1 : field.step}
        value={sliderValue}
        onChange={(e) => {
          const raw = Number(e.target.value);
          onChange(powerOfTwo ? 2 ** Math.round(raw) : raw);
        }}
        className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
      />
      <span className="w-9 text-right text-sm tabular-nums text-white/60">{num}</span>
    </div>
  );
}

// ── String input ──────────────────────────────────────────────────────────────

function StringInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const current = typeof value === 'string' ? value : '';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (!open) setDraft(current);
  }, [current, open]);

  const commit = () => {
    onChange(draft.trim());
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraft(current);
          setOpen(true);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraft(current);
          setOpen(true);
        }}
        className="flex w-48 max-w-[48vw] items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-left text-sm text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
      >
        <span className="truncate text-white/80">{current || 'Paste URL…'}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Edit</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Image URL"
              className="w-full max-w-xl rounded-2xl bg-zinc-950 p-4 shadow-2xl ring-1 ring-white/15"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.14 }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Image URL</h4>
                  <p className="mt-1 text-xs text-white/45">Paste a direct image URL for Fluid Tank texture initialization.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close URL editor">
                  <X size={16} />
                </button>
              </div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit();
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="https://example.com/image.png"
                className="min-h-28 w-full resize-y rounded-xl bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/15 placeholder:text-white/30 focus:outline-none focus:ring-cyan-200/50"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setDraft('')} className="rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white">Clear</button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white">Cancel</button>
                <button type="button" onClick={commit} className="rounded-xl bg-cyan-200 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-100">Apply URL</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Custom select ─────────────────────────────────────────────────────────────

function CustomSelect({
  field,
  value,
  onChange,
}: {
  field: SelectSetting;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Capture button position at open time so the fixed dropdown aligns correctly
  // even inside a scroll container (overflow-y: auto clips absolute children).
  const [btnRect, setBtnRect] = useState<{ top: number; bottom: number; right: number; width: number } | null>(null);
  const current = field.options.find((o) => o.value === String(value));

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setBtnRect({ top: r.top, bottom: r.bottom, right: window.innerWidth - r.right, width: r.width });
    }
    setOpen((o) => !o);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Determine whether to open upward if near the bottom of the viewport
  const openUpward = btnRect ? btnRect.bottom > window.innerHeight * 0.65 : false;

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex min-w-[168px] max-w-[220px] items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
      >
        <span className="truncate">{current?.label ?? String(value)}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && btnRect && (
          <motion.div
            initial={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed',
              ...(openUpward
                ? { bottom: window.innerHeight - btnRect.top + 6 }
                : { top: btnRect.bottom + 6 }),
              right: btnRect.right,
              minWidth: Math.max(btnRect.width, 190),
            }}
            className="z-[9999] overflow-hidden rounded-xl bg-black/90 p-1 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl"
          >
            {field.options.map((opt) => {
              const active = opt.value === String(value);
              const swatch = selectOptionSwatch(field.key, opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                    {swatch && (
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/30"
                        style={{ background: swatch }}
                      />
                    )}
                    <span>{opt.label}</span>
                  </span>
                  {active && <Check size={12} className="shrink-0 text-emerald-400" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function selectOptionSwatch(fieldKey: string, value: string): string | null {
  if (fieldKey !== 'injectPalette') return null;
  switch (value) {
    case 'style':
      return 'linear-gradient(135deg, rgb(53, 255, 229) 0%, rgb(77, 216, 255) 50%, rgb(255, 255, 255) 100%)';
    case 'cyan':
      return 'rgb(26, 255, 233)';
    case 'magenta':
      return 'rgb(255, 31, 223)';
    case 'amber':
      return 'rgb(255, 157, 21)';
    case 'green':
      return 'rgb(31, 255, 59)';
    case 'blue':
      return 'rgb(41, 92, 255)';
    case 'red':
      return 'rgb(255, 41, 20)';
    case 'white':
      return 'rgb(255, 255, 230)';
    case 'rainbow':
      return 'conic-gradient(from 90deg, rgb(255, 59, 48), rgb(255, 214, 10), rgb(50, 215, 75), rgb(100, 210, 255), rgb(191, 90, 242), rgb(255, 59, 48))';
    default:
      return null;
  }
}
