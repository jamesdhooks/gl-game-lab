/**
 * SimControlPanel — stacked horizontal sliders at the bottom of the screen.
 * No card backgrounds, just transparent floating controls.
 */
import { type CSSProperties, type ReactNode, useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ExperienceSetting,
  ExperienceSettingValue,
  NumberSetting,
  SelectSetting,
} from '@hooksjam/gl-game-lab-engine';
import { useViewportContext } from '../ViewportProvider.js';

export interface SimControlPanelProps {
  values: Readonly<Record<string, ExperienceSettingValue>>;
  fields: readonly ExperienceSetting[];
  onChange: (setting: ExperienceSetting, value: ExperienceSettingValue) => void;
  /** Bumped when the demo AI changes a setting — triggers a re-sync from app.settings. */
  settingsVersion?: number;
  /** Optional content shown at the top of the panel (e.g. StylePicker + ModeToggle on mobile). */
  headerSlot?: ReactNode;
}

function formatValue(value: number, field: NumberSetting): string {
  if (field.numericScale === 'powerOfTwo') return `2^${Math.round(Math.log2(Math.max(1, Math.round(value))))}`;
  const step = field.step;
  const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 1 : 0;
  return value.toFixed(decimals);
}

function clampExponent(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min));
}

export function SimControlPanel({ values: sourceValues, fields, onChange, settingsVersion, headerSlot }: SimControlPanelProps) {
  const { safeArea, isMobile, isLandscape } = useViewportContext();
  const numericFields = fields.filter((field): field is NumberSetting => field.type === 'number');
  const selectFields = fields.filter((field): field is SelectSetting => field.type === 'select');
  const [values, setValues] = useState<Record<string, number>>({});
  const [selectValues, setSelectValues] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const init: Record<string, number> = {};
    const initSelect: Record<string, string> = {};
    for (const f of numericFields) {
      const v = sourceValues[f.key];
      init[f.key] = typeof v === 'number' ? v : f.default;
    }
    for (const f of selectFields) {
      const v = sourceValues[f.key];
      initSelect[f.key] = typeof v === 'string' ? v : String(f.default);
    }
    setValues(init);
    setSelectValues(initSelect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, settingsVersion, sourceValues]);

  const handleChange = useCallback(
    (key: string, value: number) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      const field = numericFields.find((candidate) => candidate.key === key);
      if (field) onChange(field, value);
    },
    [numericFields, onChange],
  );

  const handleSelectChange = useCallback(
    (key: string, value: string) => {
      setSelectValues((prev) => ({ ...prev, [key]: value }));
      const field = selectFields.find((candidate) => candidate.key === key);
      if (field) onChange(field, value);
    },
    [onChange, selectFields],
  );

  if (numericFields.length === 0 && selectFields.length === 0 && !headerSlot) return null;

  // On desktop/landscape, push controls below the HUD. On mobile portrait, align
  // the settings block to the top safe area so the first color-scheme row does
  // not float below a blank band.
  const hudHeight = 44;
  const isMobilePortrait = isMobile && !isLandscape;
  const topOffset = isMobilePortrait
    ? `${(safeArea.top || 0) + 8}px`
    : `${(safeArea.top || 0) + 12 + hudHeight + 8}px`;
  const scrollMaxHeight = isMobilePortrait
    ? `calc(100dvh - ${(safeArea.top || 0) + (safeArea.bottom || 0) + 72}px)`
    : 'min(64vh, 34rem)';
  // Narrow labels on mobile portrait to avoid overflow at 375 px.
  const labelClass = isMobile && !isLandscape
    ? 'w-16 shrink-0 pt-1 text-right text-[10px] font-semibold uppercase tracking-widest text-white/70'
    : 'w-24 shrink-0 pt-1 text-right text-[10px] font-semibold uppercase tracking-widest text-white/70';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: 0.06 }}
      className="pointer-events-none absolute left-0 right-0 z-50 flex flex-col items-center gap-2 pl-12 pr-12"
      style={{ top: topOffset }}
    >
      {/* Header row: optional slot (style/mode) */}
      <div className="pointer-events-none relative z-50 flex w-full max-w-xs items-center justify-center gap-2 overflow-visible">
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 overflow-visible">
          {headerSlot}
        </div>
      </div>

      {/* Slider rows — animate in/out on collapse */}
      <div
        className="pointer-events-none flex w-full flex-col items-center gap-2 overflow-y-auto overscroll-contain pr-1"
        style={{ maxHeight: scrollMaxHeight }}
      >
        <AnimatePresence initial={false}>
          {!collapsed && numericFields.map((field) => {
            const val = values[field.key] ?? field.default;
            const powerOfTwo = field.numericScale === 'powerOfTwo';
            const minExponent = Math.ceil(Math.log2(Math.max(1, field.min)));
            const maxExponent = Math.floor(Math.log2(Math.max(1, field.max)));
            const sliderValue = powerOfTwo ? clampExponent(Math.log2(Math.max(1, val)), minExponent, maxExponent) : val;
            const tickExponents = powerOfTwo ? Array.from({ length: maxExponent - minExponent + 1 }, (_, index) => minExponent + index) : [];
            return (
              <motion.div
                key={field.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="pointer-events-auto flex w-full max-w-md items-center gap-3 overflow-hidden rounded-full bg-black/25 px-3 py-1 backdrop-blur-sm"
              >
                {/* Label */}
                <span className={labelClass}>
                  {field.label}
                </span>
                {/* Slider */}
                <div className="relative flex-1 pb-2">
                <input
                  type="range"
                  min={powerOfTwo ? minExponent : field.min}
                  max={powerOfTwo ? maxExponent : field.max}
                  step={powerOfTwo ? 1 : field.step}
                  value={sliderValue}
                  aria-valuetext={powerOfTwo ? formatValue(val, field) : undefined}
                  data-numeric-scale={field.numericScale}
                  onChange={(e) => { const next = Number(e.target.value); handleChange(field.key, powerOfTwo ? 2 ** clampExponent(next, minExponent, maxExponent) : next); }}
                  className={[
                    'h-1 w-full cursor-pointer appearance-none rounded-full bg-white/35',
                    '[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
                    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
                    '[&::-webkit-slider-thumb]:bg-white/90',
                    '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5',
                    '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0',
                    '[&::-moz-range-thumb]:bg-white/90',
                  ].join(' ')}
                />
                {powerOfTwo && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-0.5">{tickExponents.map((exponent) => <span key={exponent} className="h-1.5 w-px rounded-full bg-white/35" />)}</div>}
                </div>
                {/* Value */}
                <span className="w-12 text-left font-mono text-[11px] font-semibold text-white/80" title={powerOfTwo ? Math.round(val).toLocaleString('en-US') : undefined}>
                  {formatValue(val, field)}
                </span>
              </motion.div>
            );
          })}
          {!collapsed && selectFields.map((field) => {
            const current = selectValues[field.key] ?? String(field.default);
            const options = field.options;
            const isInjectPalette = field.key === 'injectPalette';
            return (
              <motion.div
                key={field.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="pointer-events-auto flex w-full max-w-md items-start gap-3 overflow-visible rounded-2xl bg-black/25 px-3 py-2"
              >
                <span className={labelClass}>{field.label}</span>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 overflow-visible">
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectChange(field.key, opt.value)}
                      title={opt.label}
                      aria-label={opt.label}
                      className={[
                        isInjectPalette
                          ? 'h-5 w-5 rounded-full border transition-transform'
                          : 'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                        isInjectPalette
                          ? (current === opt.value
                              ? 'border-white ring-2 ring-white/55 scale-105'
                              : 'border-white/35 hover:border-white/75')
                          : (current === opt.value
                              ? 'bg-white text-black'
                              : 'bg-white/10 text-white/80 hover:bg-white/20'),
                      ].join(' ')}
                      style={isInjectPalette ? chipStyleForInjectOption(opt.value) : undefined}
                    >
                      {!isInjectPalette ? opt.label : ''}
                    </button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Collapse/expand chevron — positioned below all controls */}
      {(numericFields.length > 0 || selectFields.length > 0 || headerSlot) && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand controls' : 'Collapse controls'}
          className="pointer-events-auto flex shrink-0 items-center justify-center py-1 text-white/25 transition-colors hover:text-white/60"
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      )}
    </motion.div>
  );
}

function chipStyleForInjectOption(value: string): CSSProperties {
  if (value === 'cyan') return { background: 'rgb(26, 255, 233)' };
  if (value === 'magenta') return { background: 'rgb(255, 31, 223)' };
  if (value === 'amber') return { background: 'rgb(255, 157, 21)' };
  if (value === 'green') return { background: 'rgb(31, 255, 59)' };
  if (value === 'blue') return { background: 'rgb(41, 92, 255)' };
  if (value === 'red') return { background: 'rgb(255, 41, 20)' };
  if (value === 'white') return { background: 'rgb(255, 255, 230)' };
  if (value === 'rainbow') {
    return {
      background:
        'conic-gradient(from 210deg, rgb(255, 77, 77), rgb(255, 184, 77), rgb(248, 255, 77), rgb(77, 255, 142), rgb(77, 216, 255), rgb(130, 77, 255), rgb(255, 77, 227), rgb(255, 77, 77))',
    };
  }
  return {
    background:
      'linear-gradient(135deg, rgb(53, 255, 229) 0%, rgb(77, 216, 255) 33%, rgb(255, 65, 220) 66%, rgb(255, 190, 74) 100%)',
  };
}
