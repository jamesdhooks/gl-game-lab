import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

export interface TopbarSelectOption {
  id: string;
  label: string;
  chipStyle?: CSSProperties;
  chipColors?: number[];
}

export interface TopbarSelectProps {
  label: string;
  value: string;
  options: TopbarSelectOption[];
  onChange: (value: string) => void;
  listMode?: boolean;
  hideLabel?: boolean;
  icon?: LucideIcon;
}

export function TopbarSelect({ label, value, options, onChange, listMode = false, hideLabel = false, icon: Icon }: TopbarSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [buttonRect, setButtonRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const current = options.find((option) => option.id === value) ?? options[0];

  const toggle = (): void => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
    }
    setOpen((next) => !next);
  };
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !dropdownRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => { document.removeEventListener('mousedown', close); };
  }, [open]);
  const select = (nextValue: string): void => { onChange(nextValue); setOpen(false); };
  const cycleNext = (): void => {
    const index = Math.max(0, options.findIndex((option) => option.id === value));
    const next = options[(index + 1) % options.length];
    if (next) onChange(next.id);
  };
  const openUpward = buttonRect ? buttonRect.bottom > window.innerHeight * 0.65 : false;
  const dropdownWidth = Math.max(buttonRect?.width ?? 0, 160);
  const optionRows = options.map((option) => {
    const active = option.id === value;
    return <button key={option.id} type="button" onClick={() => { select(option.id); }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}>
      <span className="flex items-center gap-2 whitespace-nowrap"><OptionChip option={option} />{option.label}</span>
      {active && <Check size={11} className="shrink-0 text-emerald-400" />}
    </button>;
  });
  if (listMode) return <div className="px-1 pb-1">{optionRows}</div>;
  return <div ref={ref} className="relative flex items-center overflow-hidden rounded-xl bg-black/30 backdrop-blur-md">
    <button ref={buttonRef} type="button" onClick={toggle} aria-label={label} title={label} className="flex h-8 min-w-[8rem] items-center gap-1.5 pl-2.5 pr-2 text-xs font-semibold text-white transition-colors hover:bg-white/10">
      {!hideLabel && <span className="text-[9px] font-bold uppercase tracking-widest text-white/45">{label}</span>}
      {Icon && <Icon size={13} aria-hidden="true" className="shrink-0 text-white/55" />}
      <span className="flex min-w-0 items-center gap-1.5">{current && <OptionChip option={current} />}<span className="whitespace-nowrap">{current?.label ?? value}</span></span>
      <ChevronDown size={11} className={`shrink-0 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <div className="h-4 w-px bg-white/15" />
    <button type="button" onClick={cycleNext} aria-label={`Next ${label.toLowerCase()}`} className="flex h-8 w-7 items-center justify-center pr-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"><ChevronRight size={13} /></button>
    {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {open && buttonRect && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUpward ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            style={{ position: 'fixed', ...(openUpward ? { bottom: window.innerHeight - buttonRect.top + 6 } : { top: buttonRect.bottom + 6 }), left: Math.max(8, Math.min(buttonRect.left, window.innerWidth - dropdownWidth - 8)), minWidth: dropdownWidth }}
            className="z-[9999] overflow-hidden rounded-xl bg-black/30 p-1 backdrop-blur-md"
          >
            {optionRows}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )}
  </div>;
}

function OptionChip({ option }: { option: TopbarSelectOption }): JSX.Element | null {
  if (option.chipColors?.length) return <span className="flex h-3 w-8 shrink-0 overflow-hidden rounded-sm">{option.chipColors.slice(0, 4).map((color, index) => <span key={`${color}-${index}`} className="flex-1" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }} />)}</span>;
  if (option.chipStyle) return <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/35" style={option.chipStyle} />;
  if (option.id === '__random__' || option.id === 'random') return <span className="flex h-3 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white/10 text-[7px] font-bold tracking-wider text-white/50">?</span>;
  return null;
}
