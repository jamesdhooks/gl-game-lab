import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, PanelBottom, PanelLeft, PanelRight, Pin, PinOff, Play } from 'lucide-react';
import { ExperienceRuntime, GameCanvas, useViewport } from '@hooksjam/gl-game-lab-react';
import type { ExperienceDefinition, ExperienceSettingValue, GameEngine } from '@hooksjam/gl-game-lab-engine';
import { WebGL2RendererService, type ContextCycleDiagnostics } from '@hooksjam/gl-game-lab-render-webgl2';
import bundledSceneDefaults from 'virtual:gl-game-lab-scene-defaults';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';
import { loadDemoCatalog, loadDemoExperience, loadLifecycleAlternate } from './experienceLoader.js';
import { MobileCertificationRunner } from './MobileCertificationRunner.js';

type FilterKind = 'all' | 'game' | 'simulation';
type SceneDefaultValue = string | number | boolean;
type SceneDefaultsMap = Readonly<Record<string, Readonly<Record<string, SceneDefaultValue>>>>;
interface SettingsDefaultsSaveRequest {
  readonly section: string | null;
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
}

const SCENE_DEFAULTS_ENDPOINT = '/__gl-game-lab-scene-defaults';
const INITIAL_SCENE_DEFAULTS = normalizeSceneDefaults(bundledSceneDefaults);

function normalizeSceneDefaults(payload: unknown): SceneDefaultsMap {
  if (!isRecord(payload) || !isRecord(payload.scenes)) return {};
  const scenes: Record<string, Record<string, SceneDefaultValue>> = {};
  for (const [id, value] of Object.entries(payload.scenes)) {
    if (!isRecord(value)) continue;
    const defaults: Record<string, SceneDefaultValue> = {};
    for (const [key, setting] of Object.entries(value)) {
      if (typeof setting === 'string' || typeof setting === 'number' || typeof setting === 'boolean') defaults[key] = setting;
    }
    scenes[id] = defaults;
  }
  return scenes;
}

function applySceneDefaults(definition: ExperienceDefinition, defaults: Readonly<Record<string, SceneDefaultValue>> | undefined): ExperienceDefinition {
  if (!defaults) return definition;
  const sanitizedDefaults: Record<string, SceneDefaultValue> = {};
  const settings = definition.settings?.map((setting) => {
    const value = defaults[setting.key];
    if (value === undefined) return setting;
    if (setting.type === 'number') {
      const numeric = typeof value === 'number' && Number.isFinite(value) ? value : setting.default;
      const sanitized = Math.max(setting.min, Math.min(setting.max, numeric));
      sanitizedDefaults[setting.key] = sanitized;
      return { ...setting, default: sanitized };
    }
    if (setting.type === 'boolean') {
      const sanitized = typeof value === 'boolean' ? value : setting.default;
      sanitizedDefaults[setting.key] = sanitized;
      return { ...setting, default: sanitized };
    }
    if (setting.type === 'select') {
      const selected = typeof value === 'string' && setting.options.some((option) => option.value === value) ? value : setting.default;
      sanitizedDefaults[setting.key] = selected;
      return { ...setting, default: selected };
    }
    const sanitized = typeof value === 'string' ? value : setting.default;
    sanitizedDefaults[setting.key] = sanitized;
    return { ...setting, default: sanitized };
  });
  const savedStyle = defaults.style;
  const styleManifest = typeof savedStyle === 'string' && definition.styleManifest?.styles.some((style) => style.id === savedStyle)
    ? { ...definition.styleManifest, defaultStyleId: savedStyle }
    : definition.styleManifest;
  return {
    ...definition,
    ...(settings ? { settings } : {}),
    configDefaults: { ...definition.configDefaults, ...sanitizedDefaults } as Readonly<Record<string, ExperienceSettingValue>>,
    ...(styleManifest ? { styleManifest } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface PendingLaunch {
  readonly definition: ExperienceDefinition;
  readonly demo: boolean;
}

const KIND_LABELS: Readonly<Record<FilterKind, string>> = Object.freeze({
  all: 'All',
  game: 'Games',
  simulation: 'Simulations',
});

const LOGO_PARTICLES: ReadonlyArray<readonly [number, string, string, string, number, number, number]> = [
  [0.55, '#a78bfa', '15%', '30%', 10, 3.2, 0],
  [0.38, '#38bdf8', '85%', '25%', 8, 2.8, 0.6],
  [0.60, '#818cf8', '18%', '72%', 12, 3.5, 1.1],
  [0.32, '#f472b6', '82%', '68%', 9, 2.6, 0.3],
  [0.44, '#34d399', '20%', '15%', 7, 3, 1.7],
  [0.34, '#60a5fa', '80%', '20%', 9, 2.9, 0.9],
  [0.28, '#c084fc', '22%', '80%', 8, 3.3, 1.4],
  [0.42, '#fb923c', '78%', '65%', 6, 3.6, 0.5],
];

export function App(): JSX.Element {
  const query = new URLSearchParams(window.location.search);
  if (query.get('mobileCertification') === '1') return <MobileCertificationRunner />;
  const capture = parseDemoCaptureOptions(window.location.search);
  const diagnosticHost = capture.enabled
    || query.get('diagnostics') === '1'
    || query.get('contextTest') === '1'
    || query.get('lifecycleTest') === '1'
    || query.get('inputTest') === '1';
  return diagnosticHost ? <DiagnosticExperienceHost /> : <DemoGallery />;
}

function DemoGallery(): JSX.Element {
  const { isMobile, isLandscape } = useViewport();
  const [catalog, setCatalog] = useState<readonly ExperienceDefinition[]>([]);
  const [sceneDefaults, setSceneDefaults] = useState<SceneDefaultsMap>(INITIAL_SCENE_DEFAULTS);
  const [active, setActive] = useState<ExperienceDefinition>();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [dark, setDark] = useState(true);
  const [previewFpsVisible, setPreviewFpsVisible] = useState(() => {
    try { return localStorage.getItem('gl-game-lab:previewFps') !== 'false'; } catch { return true; }
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<FilterKind>('all');
  const [pickerSide, setPickerSide] = useState<'bottom' | 'left' | 'right'>('bottom');
  const [pickerDocked, setPickerDocked] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [localDemoMode, setLocalDemoMode] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const portraitMobile = isMobile && !isLandscape;
  const effectivePickerSide = portraitMobile ? 'bottom' : pickerSide;
  const pickerBottom = effectivePickerSide === 'bottom';
  const pickerLeft = effectivePickerSide === 'left';
  const dockedInset = pickerOpen && pickerDocked
    ? pickerBottom ? { bottom: 164 } : pickerLeft ? { left: 196 } : { right: 196 }
    : undefined;

  useEffect(() => {
    let mounted = true;
    void loadDemoCatalog().then((definitions) => {
      if (!mounted) return;
      const configured = definitions.map((definition) => applySceneDefaults(definition, INITIAL_SCENE_DEFAULTS[definition.id]));
      setCatalog(configured);
      const requested = new URLSearchParams(window.location.search).get('experience');
      if (requested) setActive(configured.find((definition) => definition.id === requested) ?? configured[0]);
    });
    return () => { mounted = false; };
  }, []);

  const saveSceneDefaults = useCallback(async (request: SettingsDefaultsSaveRequest): Promise<void> => {
    if (!active) return;
    const definitionId = active.id;
    const current = sceneDefaults[definitionId] ?? {};
    const nextScene = request.section === null
      ? request.values
      : { ...current, ...request.values };
    const clean: Record<string, SceneDefaultValue> = {};
    for (const [key, value] of Object.entries(nextScene)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') clean[key] = value;
    }
    let nextDefaults: SceneDefaultsMap = { ...sceneDefaults, [definitionId]: clean };
    try {
      const response = await fetch(SCENE_DEFAULTS_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitionId, section: request.section, defaults: clean }),
      });
      if (response.ok) nextDefaults = normalizeSceneDefaults(await response.json() as unknown);
      else throw new Error('Disk-backed scene defaults are unavailable');
    } catch {
      localStorage.setItem(`gl-game-lab:scene-defaults:${definitionId}`, JSON.stringify(clean));
    }
    setSceneDefaults(nextDefaults);
    setCatalog((definitions) => definitions.map((definition) => applySceneDefaults(definition, nextDefaults[definition.id])));
  }, [active, sceneDefaults]);

  useEffect(() => {
    try { localStorage.setItem('gl-game-lab:previewFps', String(previewFpsVisible)); } catch { /* Storage may be unavailable. */ }
  }, [previewFpsVisible]);

  const filtered = useMemo(() => filter === 'all' ? catalog : catalog.filter((definition) => definition.kind === filter), [catalog, filter]);
  const pickerItems = useMemo(() => pickerFilter === 'all' ? catalog : catalog.filter((definition) => definition.kind === pickerFilter), [catalog, pickerFilter]);
  const activeIndex = active ? pickerItems.findIndex((definition) => definition.id === active.id) : -1;

  useEffect(() => {
    if (!pendingLaunch) return;
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setDemoMode(pendingLaunch.demo);
        setActive(pendingLaunch.definition);
        setPendingLaunch(undefined);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
  }, [pendingLaunch]);

  const selectExperience = useCallback((definition: ExperienceDefinition): void => {
    setDemoMode(false);
    setLocalDemoMode(false);
    if (active) setActive(definition);
    else setPendingLaunch({ definition, demo: false });
    const url = new URL(window.location.href);
    url.searchParams.set('experience', definition.id);
    window.history.replaceState(null, '', url);
  }, [active]);

  const quit = useCallback((): void => {
    setActive(undefined);
    setDemoMode(false);
    setLocalDemoMode(false);
    setPickerOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('experience');
    window.history.replaceState(null, '', url);
  }, []);

  const startDemo = useCallback((): void => {
    if (catalog.length === 0) return;
    setDemoIndex(0);
    setPendingLaunch({ definition: catalog[0]!, demo: true });
  }, [catalog]);
  const advanceDemo = useCallback((): void => {
    if (catalog.length === 0) return;
    setDemoIndex((index) => {
      const next = (index + 1) % catalog.length;
      setActive(catalog[next]!);
      return next;
    });
  }, [catalog]);

  useEffect(() => {
    if (!demoMode || catalog.length === 0) return;
    const timeout = window.setTimeout(() => {
      advanceDemo();
    }, 10_000);
    return () => { window.clearTimeout(timeout); };
  }, [advanceDemo, catalog, demoIndex, demoMode]);

  const move = (direction: -1 | 1): void => {
    if (pickerItems.length === 0) return;
    const next = (Math.max(0, activeIndex) + direction + pickerItems.length) % pickerItems.length;
    selectExperience(pickerItems[next]!);
  };

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="relative h-screen w-screen overflow-hidden bg-white dark:bg-[#080810]">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              className="absolute inset-0 overflow-hidden bg-black"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="fixed inset-0 overflow-hidden" style={{ ...(dockedInset ?? {}), transform: 'translateZ(0)' }}>
                <ExperienceRuntime
                  definition={active}
                  profile={demoMode ? 'demo' : 'play'}
                  presentation="immersive"
                  onQuit={quit}
                  {...(demoMode ? { onDemoAdvance: advanceDemo, onDemoExit: quit } : {})}
                  onLocalDemoChange={setLocalDemoMode}
                  onSaveDefaults={saveSceneDefaults}
                  showChrome
                  className="h-full w-full"
                  canvasClassName="game-canvas"
                />
              </div>
              {demoMode && (
                <div className="pointer-events-none fixed left-3 top-3 z-[70] flex max-w-[72vw] items-center gap-2 rounded-lg bg-black/55 px-2.5 py-2 text-white">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-400 via-sky-300 to-cyan-300 text-base leading-none text-slate-950">{active.icon}</span>
                  <div className="min-w-0"><div className="truncate text-xs font-semibold leading-tight">{active.name}</div><div className="bg-gradient-to-r from-violet-300 via-sky-200 to-cyan-200 bg-clip-text text-[9px] font-semibold uppercase leading-tight tracking-wide text-transparent">Demo mode</div></div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="gallery" className="absolute inset-0 overflow-y-auto text-slate-900 dark:text-slate-100" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-8 sm:pb-32 sm:pt-16">
                <div className="relative mb-5 flex justify-center sm:mb-8">
                  {LOGO_PARTICLES.map(([size, color, left, top, drift, duration, delay], index) => (
                    <motion.span key={index} aria-hidden className="pointer-events-none absolute rounded-full" style={{ width: `${size}rem`, height: `${size}rem`, background: color, left, top }} animate={{ y: [0, -drift, 0], opacity: [0.35, 0.7, 0.35] }} transition={{ duration, repeat: Infinity, delay, ease: 'easeInOut' }} />
                  ))}
                  <h1 className="relative bg-gradient-to-r from-violet-400 via-sky-300 to-cyan-400 bg-clip-text text-center text-4xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">GLGameLab</h1>
                </div>
                <div className="mb-3 flex justify-center sm:mb-4">
                  <div className="inline-flex gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06] sm:rounded-2xl sm:p-1.5">
                    {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => (
                      <button key={kind} type="button" onClick={() => { setFilter(kind); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:rounded-xl sm:px-6 sm:py-2.5 sm:text-sm ${filter === kind ? 'bg-white text-slate-900 shadow-md dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>{KIND_LABELS[kind]}</button>
                    ))}
                  </div>
                </div>
                <div className="mb-8 flex flex-col items-center justify-center gap-3">
                  <button type="button" onClick={startDemo} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-sky-400 to-cyan-400 px-4 py-2 text-sm font-bold text-white shadow-md shadow-sky-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"><Play size={14} />Demo mode</button>
                  <button type="button" onClick={() => { setPreviewFpsVisible((visible) => !visible); }} className={`rounded-xl px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors ${previewFpsVisible ? 'bg-cyan-200 text-slate-950 shadow-md shadow-cyan-400/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.07] dark:text-white/45 dark:hover:bg-white/[0.12]'}`}>Preview FPS {previewFpsVisible ? 'On' : 'Off'}</button>
                </div>
                {catalog.length === 0 ? <p className="py-24 text-center text-slate-400" role="status">Loading GLGameLab experiences…</p> : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                    {filtered.map((definition, index) => <ExperienceCard key={definition.id} definition={definition} index={index} onSelect={selectExperience} showPreviewFps={previewFpsVisible} previewsEnabled={!pendingLaunch} hideKindBadge={filter === 'simulation'} />)}
                  </div>
                )}
              </main>
              <footer className="pb-10 text-center text-xs text-slate-400 dark:text-slate-600">@hooksjam/gl-game-lab · GPU-first · WebGL2</footer>
              <button type="button" onClick={() => { setDark((value) => !value); }} aria-label="Toggle theme" className="fixed bottom-6 right-6 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-lg shadow-lg transition-transform hover:scale-110 active:scale-95 dark:bg-slate-800">{dark ? '☀️' : '🌙'}</button>
            </motion.div>
          )}
        </AnimatePresence>

        {active && !demoMode && !localDemoMode && (
          <>
            {!pickerOpen && <button type="button" aria-label="Show experience picker" onClick={() => { setPickerOpen(true); }} className={`fixed z-[60] flex items-center justify-center text-white/20 transition-colors hover:text-white/50 ${pickerBottom ? 'bottom-1 left-1/2 h-8 w-12 -translate-x-1/2' : pickerLeft ? 'left-1 top-1/2 h-12 w-8 -translate-y-1/2' : 'right-1 top-1/2 h-12 w-8 -translate-y-1/2'}`}>{pickerBottom ? <ChevronUp size={16} /> : pickerLeft ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>}
            <AnimatePresence>
              {pickerOpen && (
                <motion.section
                  data-picker-side={effectivePickerSide}
                  data-picker-docked={pickerDocked}
                  initial={pickerBottom ? { y: '100%' } : pickerLeft ? { x: '-100%' } : { x: '100%' }}
                  animate={pickerBottom ? { y: 0 } : { x: 0 }}
                  exit={pickerBottom ? { y: '100%' } : pickerLeft ? { x: '-100%' } : { x: '100%' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 40, mass: 0.7 }}
                  className={`fixed z-[60] flex flex-col border-white/10 bg-black/90 backdrop-blur-xl ${pickerBottom ? 'bottom-0 left-0 right-0 border-t' : pickerLeft ? 'bottom-0 left-0 top-0 w-[196px] border-r' : 'bottom-0 right-0 top-0 w-[196px] border-l'}${portraitMobile ? ' max-h-[40vh]' : ''}`}
                >
                  <header className="flex shrink-0 items-center gap-1 border-b border-white/[0.07] px-3 py-1.5">
                    {portraitMobile ? (
                      <div className="flex flex-1 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => <button key={kind} type="button" onClick={() => { setPickerFilter(kind); }} className={`shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors ${pickerFilter === kind ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'}`}>{KIND_LABELS[kind]}</button>)}
                      </div>
                    ) : <span className="mr-auto text-[10px] font-semibold uppercase tracking-widest text-white/30">Experiences</span>}
                    {!portraitMobile && (['left', 'bottom', 'right'] as const).map((side) => {
                      const Icon = side === 'left' ? PanelLeft : side === 'bottom' ? PanelBottom : PanelRight;
                      return <button key={side} type="button" aria-label={`Move to ${side}`} onClick={() => { setPickerSide(side); }} className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${pickerSide === side ? 'text-white/70' : 'text-white/20 hover:text-white/50'}`}><Icon size={12} /></button>;
                    })}
                    <button type="button" aria-label={pickerDocked ? 'Undock' : 'Dock'} onClick={() => { setPickerDocked((value) => !value); }} className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${pickerDocked ? 'text-white/70' : 'text-white/20 hover:text-white/50'}`}>{pickerDocked ? <PinOff size={12} /> : <Pin size={12} />}</button>
                    <button type="button" aria-label="Close carousel" onClick={() => { setPickerOpen(false); }} className="flex h-6 w-6 items-center justify-center rounded text-white/20 transition-colors hover:text-white/50">{pickerBottom ? <ChevronDown size={14} /> : pickerLeft ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</button>
                  </header>
                  {pickerBottom ? (
                    portraitMobile ? (
                      <div ref={scrollerRef} className="flex items-center gap-2 overflow-x-scroll px-2 py-2 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                        {pickerItems.map((definition, index) => <div key={definition.id} className="shrink-0 snap-start py-0.5"><CarouselTile definition={definition} index={index} active={definition.id === active.id} onSelect={selectExperience} size={88} showPreviewFps={previewFpsVisible} /></div>)}
                      </div>
                    ) : (
                      <div className="flex h-[132px] items-stretch">
                        <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-white/[0.07] px-2 py-1.5">
                          {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => <button key={kind} type="button" onClick={() => { setPickerFilter(kind); }} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors ${pickerFilter === kind ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'}`}>{KIND_LABELS[kind]}</button>)}
                        </div>
                        <button type="button" aria-label="Previous" onClick={() => { move(-1); }} className="flex shrink-0 items-center justify-center px-1.5 text-white/25 transition-colors hover:text-white/60"><ChevronLeft size={15} /></button>
                        <div ref={scrollerRef} className="flex flex-1 items-center gap-2 overflow-x-auto px-1" style={{ scrollbarWidth: 'none' }}>
                          {pickerItems.map((definition, index) => <CarouselTile key={definition.id} definition={definition} index={index} active={definition.id === active.id} onSelect={selectExperience} size={80} showPreviewFps={previewFpsVisible} />)}
                        </div>
                        <button type="button" aria-label="Next" onClick={() => { move(1); }} className="flex shrink-0 items-center justify-center px-1.5 text-white/25 transition-colors hover:text-white/60"><ChevronRight size={15} /></button>
                      </div>
                    )
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.07] px-2 py-1.5" style={{ scrollbarWidth: 'none' }}>
                        {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => <button key={kind} type="button" onClick={() => { setPickerFilter(kind); }} className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold ${pickerFilter === kind ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'}`}>{KIND_LABELS[kind]}</button>)}
                      </div>
                      <button type="button" aria-label="Previous" onClick={() => { move(-1); }} className="py-1 text-white/25 transition-colors hover:text-white/60"><ChevronUp className="mx-auto" size={15} /></button>
                      <div ref={scrollerRef} className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-1" style={{ scrollbarWidth: 'none' }}>
                        {pickerItems.map((definition, index) => <CarouselTile key={definition.id} definition={definition} index={index} active={definition.id === active.id} onSelect={selectExperience} size={74} labelRight showPreviewFps={previewFpsVisible} />)}
                      </div>
                      <button type="button" aria-label="Next" onClick={() => { move(1); }} className="py-1 text-white/25 transition-colors hover:text-white/60"><ChevronDown className="mx-auto" size={15} /></button>
                    </div>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

interface ExperienceCardProps {
  readonly definition: ExperienceDefinition;
  readonly index: number;
  readonly onSelect: (definition: ExperienceDefinition) => void;
  readonly showPreviewFps?: boolean;
  readonly previewsEnabled?: boolean;
  readonly hideKindBadge?: boolean;
}

function ExperienceCard({ definition, index, onSelect, showPreviewFps = false, previewsEnabled = true, hideKindBadge = false }: ExperienceCardProps): JSX.Element {
  const badge = definition.kind === 'game' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300';
  return (
    <button type="button" data-demo-experience-card={definition.id} onClick={() => { onSelect(definition); }} className="group cursor-pointer select-none text-left">
      <div className="pointer-events-none relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 transition-transform duration-200 group-hover:scale-[1.03] dark:bg-[#0d0d1e]">
        <PreviewTile definition={definition} index={index} showFps={showPreviewFps} enabled={previewsEnabled} />
        {!hideKindBadge && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${badge}`}>{definition.kind}</span>}
      </div>
      <p className="mt-3 text-center text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">{definition.name}</p>
    </button>
  );
}

function PreviewTile({ definition, index, showFps = false, enabled = true }: { readonly definition: ExperienceDefinition; readonly index: number; readonly showFps?: boolean; readonly enabled?: boolean }): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const createPlugins = useCallback(() => definition.createPlugins({ profile: 'preview', seed: 536_611 + index }), [definition, index]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => { setVisible(entry?.isIntersecting ?? false); }, { rootMargin: '180px', threshold: 0.01 });
    observer.observe(root);
    return () => { observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!visible || !enabled) { setReady(false); return; }
    const timeout = window.setTimeout(() => { setReady(true); }, index * 300);
    return () => { window.clearTimeout(timeout); };
  }, [enabled, index, visible]);
  return (
    <div ref={rootRef} className="h-full w-full">
      {ready ? <GameCanvas createPlugins={createPlugins} ariaLabel={`${definition.name} preview`} className="h-full w-full touch-none" showDiagnostics={showFps} /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-6xl text-white">{definition.icon}</div>}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,.28)]" />
    </div>
  );
}

function CarouselTile({
  definition,
  index,
  active,
  onSelect,
  size,
  labelRight = false,
  showPreviewFps = false,
}: ExperienceCardProps & { readonly active: boolean; readonly size: number; readonly labelRight?: boolean }): JSX.Element {
  return (
    <div className={`flex shrink-0 cursor-pointer items-center gap-1.5 transition-all duration-150 ${labelRight ? 'w-full flex-row' : 'flex-col'}`}>
      <button
        type="button"
        onClick={() => { onSelect(definition); }}
        className={`relative flex shrink-0 overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${active ? 'ring-2 ring-white/65' : ''}`}
        style={{ width: size, height: size }}
        aria-label={`Play ${definition.name}`}
      >
        <PreviewTile definition={definition} index={index} showFps={showPreviewFps} />
      </button>
      <span className={`truncate text-[9px] font-medium leading-tight text-white/50 ${labelRight ? 'min-w-0 flex-1 text-left' : 'text-center'}`} style={labelRight ? undefined : { maxWidth: size }}>{definition.name}</span>
    </div>
  );
}

function DiagnosticExperienceHost(): JSX.Element {
  const [runtimeError, setRuntimeError] = useState<string>();
  const [diagnosticStatus, setDiagnosticStatus] = useState('idle');
  const [contextResult, setContextResult] = useState<ContextCycleDiagnostics>();
  const [lifecycleAlternate, setLifecycleAlternate] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<ExperienceDefinition>();
  const [alternateExperience, setAlternateExperience] = useState<ExperienceDefinition>();
  const [inputPointers, setInputPointers] = useState(0);
  const [inputGamepads, setInputGamepads] = useState(0);
  const [inputKeys, setInputKeys] = useState(0);
  const engineRef = useRef<GameEngine>();
  const previousEngineRef = useRef<GameEngine>();
  const readyCountRef = useRef(0);
  const inputObservedRef = useRef({ pointerEvents: 0, gamepads: 0, keys: 0 });
  const capture = parseDemoCaptureOptions(window.location.search);
  const query = new URLSearchParams(window.location.search);
  const experienceId = query.get('experience');
  const showDiagnostics = query.get('diagnostics') === '1';
  const contextTest = query.get('contextTest') === '1';
  const contextStrategy = query.get('contextStrategy') === 'registry' ? 'registry' : 'driver';
  const lifecycleTest = query.get('lifecycleTest') === '1';
  const inputTest = query.get('inputTest') === '1';
  useEffect(() => {
    let active = true;
    setSelectedExperience(undefined);
    setAlternateExperience(undefined);
    setLifecycleAlternate(false);
    void loadDemoExperience(experienceId).then((definition) => {
      if (active) setSelectedExperience(definition);
    }).catch((error: unknown) => {
      if (active) setRuntimeError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [experienceId]);
  const experience = lifecycleAlternate && alternateExperience ? alternateExperience : selectedExperience;
  const handleReady = useCallback((engine: GameEngine): void => {
    previousEngineRef.current = engineRef.current;
    engineRef.current = engine;
    readyCountRef.current += 1;
    if (inputTest) {
      inputObservedRef.current = { pointerEvents: 0, gamepads: 0, keys: 0 };
      engine.schedule.addSystem({
        id: 'gl-game-lab.demo.input-probe',
        stage: 'postUpdate',
        run: () => {
          const snapshot = engine.input.snapshot;
          inputObservedRef.current.pointerEvents += snapshot.events.filter((event) => event.kind === 'pointer').length;
          inputObservedRef.current.gamepads = Math.max(inputObservedRef.current.gamepads, snapshot.gamepads.length);
          inputObservedRef.current.keys = Math.max(inputObservedRef.current.keys, snapshot.keysDown.length);
        },
      });
    }
    if (readyCountRef.current > 1) {
      window.setTimeout(() => {
        const previous = previousEngineRef.current;
        setDiagnosticStatus(previous?.state === 'destroyed' ? 'lifecycle-passed' : `lifecycle-failed:${previous?.state ?? 'missing'}`);
      }, 100);
    }
  }, [inputTest]);
  const cycleContext = async (): Promise<void> => {
    const engine = engineRef.current;
    if (!engine) return;
    setDiagnosticStatus('context-cycling');
    try {
      const renderer = engine.kernel.get(WebGL2RendererService);
      const result = contextStrategy === 'registry'
        ? renderer.rebuildContextResourcesForDiagnostics()
        : await renderer.cycleContextForDiagnostics();
      setContextResult(result);
      const stable = result.generationAfter > result.generationBefore
        && result.resourcesAfter === result.resourcesBefore
        && result.bytesAfter === result.bytesBefore;
      setDiagnosticStatus(stable ? 'context-passed' : 'context-failed');
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
      setDiagnosticStatus('context-error');
    }
  };
  const reportInput = (): void => {
    const snapshot = engineRef.current?.input.snapshot;
    setInputPointers(inputObservedRef.current.pointerEvents);
    setInputGamepads(Math.max(inputObservedRef.current.gamepads, snapshot?.gamepads.length ?? 0));
    setInputKeys(Math.max(inputObservedRef.current.keys, snapshot?.keysDown.length ?? 0));
    setDiagnosticStatus('input-reported');
  };
  const replaceExperience = async (): Promise<void> => {
    if (!selectedExperience) return;
    setDiagnosticStatus('lifecycle-cycling');
    if (!alternateExperience) {
      try {
        const alternate = await loadLifecycleAlternate(selectedExperience.id);
        setAlternateExperience(alternate);
        setLifecycleAlternate(true);
      } catch (error) {
        setRuntimeError(error instanceof Error ? error.message : String(error));
        setDiagnosticStatus('lifecycle-error');
      }
      return;
    }
    setLifecycleAlternate((value) => !value);
  };
  if (!experience) {
    return <main className="flex h-screen w-screen items-center justify-center bg-black text-white"><p role="status">Loading GLGameLab experience…</p>{runtimeError && <p className="fixed bottom-3 left-3 text-rose-300" role="alert">Engine error: {runtimeError}</p>}</main>;
  }
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ExperienceRuntime
        key={experience.id}
        definition={experience}
        profile={capture.enabled ? capture.profile : 'play'}
        {...(capture.enabled ? { seed: capture.seed } : {})}
        {...(capture.enabled && capture.modeId ? { initialModeId: capture.modeId } : {})}
        {...(capture.enabled && capture.styleId ? { initialStyleId: capture.styleId } : {})}
        showChrome={false}
        showDiagnostics={showDiagnostics}
        onReady={handleReady}
        onError={(error) => { setRuntimeError(error instanceof Error ? error.message : String(error)); }}
        {...(capture.enabled ? { fixedFrameCapture: {
          frameNumber: capture.frameNumber,
          fixedDeltaSeconds: capture.fixedDeltaSeconds,
          inputEvents: experience.id === 'ball-pit' ? ballPitCaptureInputEvents(capture.scenarioId) : [],
        } } : {})}
        className="h-full w-full"
        canvasClassName="game-canvas h-full w-full touch-none"
      />
      {(contextTest || lifecycleTest || inputTest) && (
        <aside
          className="fixed left-3 top-3 z-[100] flex items-center gap-2 rounded-xl bg-zinc-950/95 p-2 text-xs text-white shadow-2xl ring-1 ring-white/15"
          aria-label="Engine diagnostic controls"
          data-diagnostic-status={diagnosticStatus}
          data-diagnostic-error={runtimeError ?? undefined}
          data-ready-count={readyCountRef.current}
          data-context-generation-before={contextResult?.generationBefore}
          data-context-strategy={contextResult?.strategy}
          data-context-generation-after={contextResult?.generationAfter}
          data-context-resources-before={contextResult?.resourcesBefore}
          data-context-resources-after={contextResult?.resourcesAfter}
          data-context-bytes-before={contextResult?.bytesBefore}
          data-context-bytes-after={contextResult?.bytesAfter}
          data-input-pointers={inputPointers}
          data-input-pointer-events={inputPointers}
          data-input-gamepads={inputGamepads}
          data-input-keys={inputKeys}
        >
          {contextTest && <button type="button" onClick={() => { void cycleContext(); }}>Cycle GPU context</button>}
          {lifecycleTest && <button type="button" onClick={() => { void replaceExperience(); }}>Replace experience</button>}
          {inputTest && <button type="button" onClick={reportInput}>Report input state</button>}
          <output aria-live="polite">{diagnosticStatus}</output>
        </aside>
      )}
      {runtimeError && <p className="fixed bottom-3 left-3 z-[100] rounded-lg bg-black/80 px-3 py-2 text-sm text-rose-300" role="alert">Engine error: {runtimeError}</p>}
    </main>
  );
}
