/**
 * components/games/ui/SettingsDrawer.tsx
 *
 * Game/simulation settings panel — a compact dropdown anchored to the top-right
 * controls bar. Opens below the settings button with a slide-down animation.
 * Less blur, less dramatic than a full modal.
 */
import { useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, Check, RotateCcw, Save, PanelRight, PanelRightOpen, Info, Lock, LockOpen } from 'lucide-react';
import type {
  ExperienceSetting as SettingsField,
  NumberSetting,
  SelectSetting,
} from '@hooksjam/gl-game-lab-engine';
import { BottomSheet } from './BottomSheet.js';
import { useViewportContext } from '../ViewportProvider.js';

export interface SettingsDefaultsSaveRequest {
  section: string | null;
  keys: string[];
  values: Record<string, unknown>;
}

export interface SettingsStore {
  get: (key: string) => unknown;
  set: (key: string, value: string | number | boolean) => void;
  reset: (keys: readonly string[]) => void;
}

export interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: SettingsStore;
  fields: readonly SettingsField[];
  settingsVersion?: number;
  maxPixels?: number;
  onMaxPixelsChange?: (v: number | undefined) => void;
  onSaveDefaults?: (request: SettingsDefaultsSaveRequest) => Promise<void> | void;
  ariaLabel?: string;
  pinned?: boolean;
  docked?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  title?: string;
  saveLabel?: string;
  headerControl?: ReactNode;
  supplementalSections?: ReactNode;
  lockedKeys?: readonly string[];
  onFieldLockChange?: (key: string, locked: boolean) => void;
  onResetAll?: () => void;
}

export function SettingsDrawer({
  open,
  onClose,
  settings,
  fields,
  settingsVersion,
  maxPixels,
  onMaxPixelsChange,
  onSaveDefaults,
  ariaLabel,
  pinned = false,
  docked = false,
  onPinnedChange,
  title = 'Settings',
  saveLabel = 'scene defaults',
  headerControl,
  supplementalSections,
  lockedKeys = [],
  onFieldLockChange,
  onResetAll,
}: SettingsDrawerProps) {
  const { isMobile, isLandscape } = useViewportContext();
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!open) return;
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      next[f.key] = settings.get(f.key);
    }
    setVals(next);
  }, [open, fields, settings, settingsVersion]);

  const apply = (key: string, value: unknown) => {
    settings.set(key, value as string | number | boolean);
    setVals((prev) => ({ ...prev, [key]: settings.get(key) }));
  };

  const resetVisibleSettings = () => {
    if (onResetAll) {
      onResetAll();
      return;
    }
    const fieldsToReset = visibleSections.flatMap((section) => section.fields);
    settings.reset(fieldsToReset.map((field) => field.key));
    const next: Record<string, unknown> = {};
    for (const f of fields) next[f.key] = settings.get(f.key);
    setVals(next);
    if (!sectionFilter) onMaxPixelsChange?.(undefined);
  };

  const resetField = (key: string) => {
    settings.reset([key]);
    setVals((prev) => ({ ...prev, [key]: settings.get(key) }));
  };

  const saveVisibleDefaults = async () => {
    if (!onSaveDefaults || saveState === 'saving') return;
    const fieldsToSave = visibleSections.flatMap((section) => section.fields);
    const values: Record<string, unknown> = {};
    for (const field of fieldsToSave) {
      values[field.key] = settings.get(field.key);
    }
    setSaveState('saving');
    try {
      await onSaveDefaults({
        section: sectionFilter,
        keys: fieldsToSave.map((field) => field.key),
        values,
      });
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch {
      setSaveState('error');
      window.setTimeout(() => setSaveState('idle'), 1800);
    }
  };

  const PIXEL_PRESETS: Array<{ label: string; sub: string; value: number | undefined }> = [
    { label: 'Off', sub: 'unlimited', value: undefined },
    { label: '360p', sub: '640×360', value: 230_400 },
    { label: '720p', sub: '1280×720', value: 921_600 },
    { label: '1080p', sub: '1920×1080', value: 2_073_600 },
  ];

  const sectionLabelFor = (field: SettingsField): string => field.section ?? (field.advanced ? 'Advanced' : 'Experience');
  const sections = fields.reduce<Array<{ label: string; fields: SettingsField[] }>>((acc, field) => {
    const label = sectionLabelFor(field);
    const existing = acc.find((section) => section.label === label);
    if (existing) existing.fields.push(field);
    else acc.push({ label, fields: [field] });
    return acc;
  }, []);
  const visibleSections = sectionFilter ? sections.filter((section) => section.label === sectionFilter) : sections;

  useEffect(() => {
    if (sectionFilter && !sections.some((section) => section.label === sectionFilter)) setSectionFilter(null);
  }, [sectionFilter, sections]);

  const sectionFilters = (
    <div className="flex flex-wrap content-start gap-1 px-1 pb-1">
      <button
        type="button"
        aria-pressed={sectionFilter === null}
        onClick={() => setSectionFilter(null)}
        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
          sectionFilter === null ? 'bg-white/18 text-white' : 'bg-white/[0.06] text-white/45 hover:bg-white/10 hover:text-white/75'
        }`}
      >
        All
      </button>
      {sections.map((section) => (
        <button
          key={section.label}
          type="button"
          aria-pressed={sectionFilter === section.label}
          onClick={() => setSectionFilter((current) => current === section.label ? null : section.label)}
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
            sectionFilter === section.label ? 'bg-cyan-200/22 text-cyan-50' : 'bg-white/[0.06] text-white/45 hover:bg-white/10 hover:text-white/75'
          }`}
        >
          {section.label}
        </button>
      ))}
    </div>
  );
  const renderFieldSection = (label: string, sectionFields: SettingsField[], index: number) =>
    sectionFields.length > 0 ? (
      <section key={label} className={`rounded-lg py-1.5 ${sectionBackgroundClass(index)}`}>
        <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</p>
        {sectionFields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={vals[field.key]}
            onChange={(v) => apply(field.key, v)}
            onReset={() => resetField(field.key)}
            locked={lockedKeys.includes(field.key)}
            {...(onFieldLockChange ? { onLockChange: (locked) => onFieldLockChange(field.key, locked) } : {})}
          />
        ))}
      </section>
    ) : null;

  const resolutionSection = (
    <section className={`rounded-lg py-1.5 ${sectionBackgroundClass(visibleSections.length)}`}>
      <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Resolution</p>
      <div className="grid grid-cols-4 gap-1 px-1 pb-0.5">
        {PIXEL_PRESETS.map(({ label, sub, value }) => (
          <button
            key={label}
            onClick={() => onMaxPixelsChange?.(value)}
            className={`flex flex-col items-center rounded-lg px-1 py-1.5 transition-colors ${
              maxPixels === value
                ? 'bg-white/15 text-white'
                : 'bg-white/[0.05] text-white/40 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            <span className="text-[10px] font-bold leading-none">{label}</span>
            <span className="mt-0.5 text-[8px] leading-none opacity-60">{sub}</span>
          </button>
        ))}
      </div>
    </section>
  );

  const content = (
    <div className="space-y-1.5 px-2.5 pb-2.5 pt-1.5">
      {isMobile && !isLandscape && (
        <div className="flex justify-end gap-1 px-1 pb-1">
          {onSaveDefaults && (
            <button
              onClick={saveVisibleDefaults}
              disabled={saveState === 'saving'}
              className={`rounded-lg p-1.5 transition-colors ${
                saveState === 'saved'
                  ? 'text-emerald-200'
                  : saveState === 'error'
                    ? 'text-rose-200'
                    : 'text-white/45 hover:bg-white/10 hover:text-white'
              } disabled:opacity-45`}
              aria-label={sectionFilter ? `Save ${sectionFilter} ${saveLabel}` : `Save ${saveLabel}`}
              title={sectionFilter ? `Save ${sectionFilter} ${saveLabel}` : `Save ${saveLabel}`}
            >
              <Save size={15} />
            </button>
          )}
          <button
            onClick={resetVisibleSettings}
            className="rounded-lg p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={sectionFilter ? `Reset ${sectionFilter} settings` : 'Reset settings'}
            title={sectionFilter ? `Reset ${sectionFilter}` : 'Reset all settings'}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      )}
      {sectionFilters}
      {visibleSections.map((section, index) => renderFieldSection(section.label, section.fields, index))}
      {supplementalSections}
      {resolutionSection}
    </div>
  );

  const header = (
    <>
      <div className="flex items-center justify-between px-3.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-sm font-bold text-white">{title}</h3>
          {headerControl}
        </div>
        <div className="flex items-center gap-1">
          {onPinnedChange && (
            <button
              onClick={() => onPinnedChange(!pinned)}
              className={`rounded-lg p-1 transition-colors ${
                pinned ? 'bg-cyan-200/14 text-cyan-100' : 'text-white/40 hover:bg-white/10 hover:text-white'
              }`}
              aria-pressed={pinned}
              aria-label={pinned ? 'Undock settings sidebar' : 'Pin settings as sidebar'}
              title={pinned ? 'Undock settings sidebar' : 'Pin settings as sidebar'}
            >
              {pinned ? <PanelRightOpen size={14} /> : <PanelRight size={14} />}
            </button>
          )}
          {onSaveDefaults && (
            <button
              onClick={saveVisibleDefaults}
              disabled={saveState === 'saving'}
              className={`rounded-lg p-1 transition-colors ${
                saveState === 'saved'
                  ? 'text-emerald-200'
                  : saveState === 'error'
                    ? 'text-rose-200'
                    : 'text-white/40 hover:bg-white/10 hover:text-white'
              } disabled:opacity-45`}
              aria-label={sectionFilter ? `Save ${sectionFilter} ${saveLabel}` : `Save ${saveLabel}`}
              title={sectionFilter ? `Save ${sectionFilter} ${saveLabel}` : `Save ${saveLabel}`}
            >
              <Save size={14} />
            </button>
          )}
          <button
            onClick={resetVisibleSettings}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={sectionFilter ? `Reset ${sectionFilter} settings` : 'Reset settings'}
            title={sectionFilter ? `Reset ${sectionFilter}` : 'Reset all settings'}
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close settings"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="mx-3.5 h-px bg-white/8" />
    </>
  );

  // Mobile portrait — render as a BottomSheet
  if (isMobile && !isLandscape) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title}>
        {content}
      </BottomSheet>
    );
  }

  // Desktop / landscape — optionally dock as a full-height scene sidebar.
  return (
    <AnimatePresence>
      {open && (
        <>
          {pinned ? (
            <motion.aside
              key="sidebar"
              initial={docked ? { opacity: 1 } : { opacity: 0, x: 18 }}
              animate={docked ? { opacity: 1 } : { opacity: 1, x: 0 }}
              exit={docked ? { opacity: 1 } : { opacity: 0, x: 18 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className={
                docked
                  ? 'relative z-0 flex h-full w-full flex-col bg-zinc-950 ring-1 ring-white/12'
                  : 'absolute bottom-0 right-0 top-0 z-50 flex w-[min(28rem,max(22rem,38vw))] max-w-[calc(100vw-1.5rem)] flex-col bg-zinc-950 shadow-xl ring-1 ring-white/12'
              }
              aria-label={ariaLabel}
            >
              {header}
              <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
            </motion.aside>
          ) : (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute right-3 top-12 z-50 w-[min(28rem,calc(100vw-1.5rem))] max-h-[76vh] overflow-y-auto rounded-2xl bg-zinc-950 shadow-xl ring-1 ring-white/12"
              aria-label={ariaLabel}
            >
              {header}
              {content}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

function sectionBackgroundClass(index: number): string {
  return index % 2 === 0 ? 'bg-white/[0.035]' : 'bg-white/[0.015]';
}

// ── Field row ──────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  onChange,
  onReset,
  locked = false,
  onLockChange,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
  onReset: () => void;
  locked?: boolean;
  onLockChange?: (locked: boolean) => void;
}) {
  return (
    <div data-experience-setting={field.key} className="group flex items-start justify-between gap-3 rounded-lg px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 text-xs font-semibold text-white">{field.label}</p>
          {field.description && (
            <FieldDescriptionTooltip label={field.label} description={field.description} />
          )}
          {onLockChange && (
            <button
              type="button"
              aria-label={`${locked ? 'Unlock' : 'Lock'} ${field.label} preview variation`}
              aria-pressed={locked}
              onClick={() => onLockChange(!locked)}
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${locked ? 'bg-cyan-200/16 text-cyan-100' : 'text-white/30 hover:bg-white/10 hover:text-white/75'}`}
            >
              {locked ? <Lock size={9} aria-hidden="true" /> : <LockOpen size={9} aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            aria-label={`Reset ${field.label}`}
            onClick={onReset}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/35 opacity-0 transition hover:bg-white/10 hover:text-white/85 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-cyan-200/50 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <RotateCcw size={10} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="shrink-0">
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

function FieldDescriptionTooltip({ label, description }: { label: string; description: string }) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [tooltip, setTooltip] = useState<{ left: number; vertical: number; placement: 'top' | 'bottom' } | null>(null);

  const showTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 256;
    const margin = 12;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), window.innerWidth - margin - width);
    const openAbove = rect.bottom > window.innerHeight * 0.72;
    setTooltip({
      left,
      vertical: openAbove ? window.innerHeight - rect.top + 8 : rect.bottom + 8,
      placement: openAbove ? 'top' : 'bottom',
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={tooltip ? tooltipId : undefined}
        onPointerEnter={showTooltip}
        onPointerLeave={() => setTooltip(null)}
        onFocus={showTooltip}
        onBlur={() => setTooltip(null)}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 focus:outline-none focus:ring-1 focus:ring-cyan-200/50"
      >
        <Info size={11} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {tooltip && (
          <motion.div
            id={tooltipId}
            role="tooltip"
            initial={{ opacity: 0, y: tooltip.placement === 'top' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: tooltip.placement === 'top' ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            style={{
              position: 'fixed',
              left: tooltip.left,
              ...(tooltip.placement === 'top' ? { bottom: tooltip.vertical } : { top: tooltip.vertical }),
              width: 256,
            }}
            className="pointer-events-none z-[10000] rounded-md border border-white/12 bg-zinc-950 px-2.5 py-2 text-[10px] leading-snug text-white/75 shadow-2xl"
          >
            {description}
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
      className={`relative h-6 w-10 rounded-full transition-colors duration-200 ${
        value ? 'bg-emerald-500' : 'bg-white/15'
      }`}
    >
      <motion.div
        className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-md"
        animate={{ x: value ? 20 : 4 }}
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
  const num = typeof value === 'number' ? value : (field.min ?? 0);
  const powerOfTwo = field.numericScale === 'powerOfTwo';
  const minExponent = Math.ceil(Math.log2(Math.max(1, field.min ?? 1)));
  const maxExponent = Math.floor(Math.log2(Math.max(1, field.max ?? 1)));
  const inputRef = useRef<HTMLInputElement>(null);
  const fineDragRef = useRef<{ pointerId: number; startX: number; startValue: number; active: boolean } | null>(null);
  const sliderValue = powerOfTwo ? snapExponent(Math.log2(Math.max(1, num)), minExponent, maxExponent) : num;
  const valueLabel = powerOfTwo ? formatPowerOfTwoSetting(num) : formatNumberSetting(num);
  const tickExponents = powerOfTwo ? powerOfTwoExponents(minExponent, maxExponent) : [];
  const sliderStep = powerOfTwo ? 1 : numericStepForField(field, num);
  const sliderMin = powerOfTwo ? minExponent : (field.min ?? 0);
  const sliderMax = powerOfTwo ? maxExponent : (field.max ?? sliderMin);
  const applySliderValue = (nextValue: number) => {
    if (powerOfTwo) {
      onChange(2 ** snapExponent(nextValue, minExponent, maxExponent));
      return;
    }
    onChange(clampSliderValue(roundToStep(nextValue, fineSliderStep(sliderMin, sliderMax)), sliderMin, sliderMax));
  };
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-32 pb-2">
        <input
          ref={inputRef}
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={sliderValue}
          aria-valuetext={powerOfTwo ? valueLabel : undefined}
          data-numeric-scale={field.numericScale}
          onChange={(e) => {
            if (fineDragRef.current?.active) return;
            if (powerOfTwo) {
              onChange(2 ** snapExponent(Number(e.target.value), minExponent, maxExponent));
            } else {
              onChange(Number(e.target.value));
            }
          }}
          onPointerDown={(event) => {
            if (!event.shiftKey) return;
            fineDragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startValue: sliderValue,
              active: true,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            let drag = fineDragRef.current;
            if (!event.shiftKey) {
              if (drag?.pointerId === event.pointerId) fineDragRef.current = null;
              return;
            }
            if (!drag) {
              if ((event.buttons & 1) === 0) return;
              drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startValue: sliderValue,
                active: true,
              };
              fineDragRef.current = drag;
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            if (drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            const trackWidth = Math.max(1, inputRef.current?.getBoundingClientRect().width ?? 1);
            const movement = (event.clientX - drag.startX) / trackWidth;
            applySliderValue(drag.startValue + movement * (sliderMax - sliderMin) * 0.1);
          }}
          onPointerUp={(event) => {
            if (fineDragRef.current?.pointerId === event.pointerId) fineDragRef.current = null;
          }}
          onPointerCancel={() => {
            fineDragRef.current = null;
          }}
          onKeyDown={(event) => {
            if (!event.shiftKey || !['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const direction = event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 1;
            applySliderValue(sliderValue + direction * fineSliderStep(sliderMin, sliderMax));
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
        />
        {powerOfTwo && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-0.5">
            {tickExponents.map((exponent) => (
              <span key={exponent} className="h-1.5 w-px rounded-full bg-white/35" />
            ))}
          </div>
        )}
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-white/60" title={powerOfTwo ? formatIntegerSetting(num) : undefined}>
        {valueLabel}
      </span>
    </div>
  );
}

function numericStepForField(field: NumberSetting, value: number): number {
  if (typeof field.step === 'number' && Number.isFinite(field.step) && field.step > 0) return field.step;
  const upperBound = typeof field.max === 'number' ? field.max : Math.abs(value);
  return upperBound < 10 ? 0.1 : 1;
}

function fineSliderStep(min: number, max: number): number {
  const range = Math.max(0, max - min);
  if (range <= 1) return 0.001;
  if (range <= 10) return 0.005;
  if (range <= 100) return 0.05;
  if (range <= 1000) return 0.5;
  if (range <= 10000) return 1;
  return 5;
}

function clampSliderValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function formatNumberSetting(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function formatPowerOfTwoSetting(value: number): string {
  const safeValue = Math.max(1, Math.round(value));
  const exponent = Math.round(Math.log2(safeValue));
  return `2^${exponent}`;
}

function formatIntegerSetting(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function snapExponent(value: number, minExponent: number, maxExponent: number): number {
  const rounded = Number.isFinite(value) ? Math.round(value) : minExponent;
  return Math.max(minExponent, Math.min(maxExponent, rounded));
}

function powerOfTwoExponents(minExponent: number, maxExponent: number): number[] {
  const ticks: number[] = [];
  for (let exponent = minExponent; exponent <= maxExponent; exponent += 1) {
    ticks.push(exponent);
  }
  return ticks;
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
        className="flex w-44 max-w-[48vw] items-center justify-between gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-left text-xs text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
      >
        <span className="truncate text-white/80">{current ? 'Image URL set' : 'No image URL set'}</span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
          current ? 'bg-emerald-300/18 text-emerald-100' : 'bg-white/10 text-white/45'
        }`}>
          {current ? 'Set' : 'Random'}
        </span>
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
                  <p className="mt-1 text-xs text-white/45">Paste a direct image URL for texture initialization. Leave it blank to use a random public image.</p>
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
  const current = field.options?.find((o) => o.value === String(value));

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
        className="flex min-w-[148px] max-w-[200px] items-center justify-between gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
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
            {field.options?.map((opt) => {
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
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
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
