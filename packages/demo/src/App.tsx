import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Image as ImageIcon, MonitorPlay, PanelBottom, PanelLeft, PanelRight, Pin, PinOff, Play, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { ExperienceRuntime, GameCanvas, PreviewTile as EnginePreviewTile, useViewport, type CanvasFrameCapture } from '@hooksjam/gl-game-lab-react';
import { createDefaultPreviewProfile, type ExperienceDefinition, type ExperiencePreviewProfile, type ExperienceSettingValue, type GameEngine, type GpuParticleGridValidation2D } from '@hooksjam/gl-game-lab-engine';
import { WebGL2RendererService, type ContextCycleDiagnostics } from '@hooksjam/gl-game-lab-render-webgl2';
import bundledSceneDefaults from 'virtual:gl-game-lab-scene-defaults';
import bundledPreviewProfiles from 'virtual:gl-game-lab-preview-profiles';
import './index.css';
import { parseDemoCaptureOptions } from './captureOptions.js';
import { ballPitCaptureInputEvents } from './ballPitCaptureScenarios.js';
import { loadDemoCatalog, loadDemoExperience, loadLifecycleAlternate } from './experienceLoader.js';
import { paginateGallery } from './galleryPagination.js';
import { MobileCertificationRunner } from './MobileCertificationRunner.js';
import { definitionSettings, normalizePreviewProfiles, type PreviewProfileMap } from './previewProfiles.js';
import { readPreviewFrameRateMode, useAutoPreviewFrameRate, type PreviewFrameRate, type PreviewFrameRateMode } from './previewFrameRate.js';

type FilterKind = 'all' | 'game' | 'simulation';
type PreviewFidelity = 'simulation' | 'image';
type SceneDefaultValue = string | number | boolean;
type SceneDefaultsMap = Readonly<Record<string, Readonly<Record<string, SceneDefaultValue>>>>;
interface SettingsDefaultsSaveRequest {
  readonly section: string | null;
  readonly keys: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
}

const SCENE_DEFAULTS_ENDPOINT = '/__gl-game-lab-scene-defaults';
const PREVIEW_PROFILES_ENDPOINT = '/__gl-game-lab-preview-profiles';
const PREVIEW_CAPTURE_ENDPOINT = '/__gl-game-lab-preview-capture';
const INITIAL_SCENE_DEFAULTS = normalizeSceneDefaults(bundledSceneDefaults);

interface PreviewCaptureCandidate {
  readonly definition: ExperienceDefinition;
  readonly profile: ExperiencePreviewProfile;
  readonly profileHash: string;
  readonly blob: Blob;
  readonly url: string;
  readonly finish: () => void;
}

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
      const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      const numeric = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : setting.default;
      const scaled = setting.numericScale === 'powerOfTwo' ? 2 ** Math.round(Math.log2(Math.max(1, numeric))) : numeric;
      const sanitized = Math.max(setting.min, Math.min(setting.max, scaled));
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
    || query.get('gpuProbe') === '1'
    || query.get('lifecycleTest') === '1'
    || query.get('inputTest') === '1';
  return diagnosticHost ? <DiagnosticExperienceHost /> : <DemoGallery />;
}

function DemoGallery(): JSX.Element {
  const { isMobile, isLandscape } = useViewport();
  const [catalog, setCatalog] = useState<readonly ExperienceDefinition[]>([]);
  const [sceneDefaults, setSceneDefaults] = useState<SceneDefaultsMap>(INITIAL_SCENE_DEFAULTS);
  const [previewProfiles, setPreviewProfiles] = useState<PreviewProfileMap>({});
  const [previewDrafts, setPreviewDrafts] = useState<PreviewProfileMap>({});
  const [previewAuthoringEnabled, setPreviewAuthoringEnabled] = useState(false);
  const [captureCandidate, setCaptureCandidate] = useState<PreviewCaptureCandidate>();
  const [previewSessionSeed, setPreviewSessionSeed] = useState(() => randomSessionSeed());
  const [active, setActive] = useState<ExperienceDefinition>();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [galleryPage, setGalleryPage] = useState(0);
  const [dark, setDark] = useState(true);
  const [previewFpsVisible, setPreviewFpsVisible] = useState(() => {
    if (!import.meta.env.DEV) return false;
    try { return localStorage.getItem('gl-game-lab:previewFps') !== 'false'; } catch { return true; }
  });
  const [previewFidelity, setPreviewFidelity] = useState<PreviewFidelity>(() => {
    if (!import.meta.env.DEV) return 'simulation';
    try { return localStorage.getItem('gl-game-lab:previewFidelity') === 'image' ? 'image' : 'simulation'; } catch { return 'simulation'; }
  });
  const [previewFrameRateMode, setPreviewFrameRateMode] = useState<PreviewFrameRateMode>(() => {
    if (!import.meta.env.DEV) return 'auto';
    try { return readPreviewFrameRateMode(localStorage.getItem('gl-game-lab:previewFrameRate')); } catch { return 'auto'; }
  });
  const [demoSettingsOpen, setDemoSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<FilterKind>('all');
  const [pickerSide, setPickerSide] = useState<'bottom' | 'left' | 'right'>('bottom');
  const [pickerDocked, setPickerDocked] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [localDemoMode, setLocalDemoMode] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch>();
  const autoPreviewFrameRate = useAutoPreviewFrameRate(previewFrameRateMode === 'auto' && previewFidelity === 'simulation' && (!active || previewAuthoringEnabled));
  const previewMaxFps: PreviewFrameRate = previewFrameRateMode === 'auto' ? autoPreviewFrameRate : previewFrameRateMode;
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
    void loadDemoCatalog().then(async (definitions) => {
      if (!mounted) return;
      const configured = definitions.map((definition) => applySceneDefaults(definition, INITIAL_SCENE_DEFAULTS[definition.id]));
      let previewProfileSource: unknown = bundledPreviewProfiles;
      if (import.meta.env.DEV) {
        try {
          const response = await fetch(PREVIEW_PROFILES_ENDPOINT, { cache: 'no-store' });
          if (response.ok) previewProfileSource = await response.json() as unknown;
        } catch {
          // The committed profiles remain a valid fallback when local persistence is unavailable.
        }
      }
      if (!mounted) return;
      const profiles = normalizePreviewProfiles(previewProfileSource, configured);
      setCatalog(configured);
      setPreviewProfiles(profiles);
      setPreviewDrafts(profiles);
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
    const nextActive = applySceneDefaults(active, nextDefaults[definitionId]);
    setActive(nextActive);
    setCatalog((definitions) => definitions.map((definition) => definition.id === definitionId
      ? nextActive
      : applySceneDefaults(definition, nextDefaults[definition.id])));

    // Profiles loaded from the original full-snapshot format are normalized to
    // sparse overrides in memory. Persist the active normalized profile when
    // its base changes so copied legacy values cannot reappear after reload.
    const savedPreview = previewProfiles[definitionId];
    if (savedPreview) {
      try {
        await fetch(PREVIEW_PROFILES_ENDPOINT, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definitionId, profile: savedPreview }),
        });
      } catch {
        // Scene defaults remain saved even if preview-profile compaction is unavailable.
      }
    }
  }, [active, previewProfiles, sceneDefaults]);

  const activePreviewProfile = active
    ? previewDrafts[active.id] ?? previewProfiles[active.id] ?? createDefaultPreviewProfile(active, definitionSettings(active))
    : undefined;
  const activeSavedPreviewProfile = active
    ? previewProfiles[active.id] ?? createDefaultPreviewProfile(active, definitionSettings(active))
    : undefined;
  const changePreviewProfile = useCallback((profile: ExperiencePreviewProfile): void => {
    if (!active) return;
    setPreviewDrafts((current) => ({ ...current, [active.id]: profile }));
  }, [active]);
  const savePreviewProfile = useCallback(async (profile: ExperiencePreviewProfile): Promise<void> => {
    if (!active) return;
    const response = await fetch(PREVIEW_PROFILES_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definitionId: active.id, profile }),
    });
    if (!response.ok) throw new Error(await response.text() || 'Unable to save preview profile');
    const next = normalizePreviewProfiles(await response.json() as unknown, catalog);
    setPreviewProfiles(next);
    setPreviewDrafts((current) => ({ ...current, [active.id]: next[active.id] ?? profile }));
  }, [active, catalog]);
  const resetPreviewProfile = useCallback((): ExperiencePreviewProfile => {
    if (!active) throw new Error('Cannot reset a preview without an active experience');
    const saved = previewProfiles[active.id] ?? createDefaultPreviewProfile(active, definitionSettings(active));
    setPreviewDrafts((current) => ({ ...current, [active.id]: saved }));
    return saved;
  }, [active, previewProfiles]);
  const persistPreviewCapture = useCallback(async (candidate: PreviewCaptureCandidate): Promise<void> => {
    const imageBase64 = await blobBase64(candidate.blob);
    const response = await fetch(PREVIEW_CAPTURE_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        definitionId: candidate.definition.id,
        profile: candidate.profile,
        profileHash: candidate.profileHash,
        imageBase64,
      }),
    });
    if (!response.ok) throw new Error(await response.text() || 'Unable to save preview capture');
    const next = normalizePreviewProfiles(await response.json() as unknown, catalog);
    setPreviewProfiles(next);
    setPreviewDrafts((current) => ({ ...current, [candidate.definition.id]: next[candidate.definition.id] ?? candidate.profile }));
    URL.revokeObjectURL(candidate.url);
    setCaptureCandidate(undefined);
    candidate.finish();
  }, [catalog]);
  const capturePreview = useCallback(async (capture: CanvasFrameCapture, profile: ExperiencePreviewProfile, profileHash: string): Promise<void> => {
    if (!active) return;
    const blob = await encodePreviewWebp(capture);
    await new Promise<void>((finish) => {
      const candidate = { definition: active, profile, profileHash, blob, url: URL.createObjectURL(blob), finish };
      setCaptureCandidate((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
          current.finish();
        }
        return candidate;
      });
    });
  }, [active]);
  const cancelCapture = useCallback((): void => {
    setCaptureCandidate((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
        current.finish();
      }
      return undefined;
    });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try { localStorage.setItem('gl-game-lab:previewFps', String(previewFpsVisible)); } catch { /* Storage may be unavailable. */ }
  }, [previewFpsVisible]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try { localStorage.setItem('gl-game-lab:previewFidelity', previewFidelity); } catch { /* Storage may be unavailable. */ }
  }, [previewFidelity]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try { localStorage.setItem('gl-game-lab:previewFrameRate', String(previewFrameRateMode)); } catch { /* Storage may be unavailable. */ }
  }, [previewFrameRateMode]);

  const filtered = useMemo(() => filter === 'all' ? catalog : catalog.filter((definition) => definition.kind === filter), [catalog, filter]);
  const gallery = useMemo(() => paginateGallery(filtered, galleryPage), [filtered, galleryPage]);
  const galleryPageCount = gallery.pageCount;
  const galleryItems = gallery.items;
  const pickerItems = useMemo(() => pickerFilter === 'all' ? catalog : catalog.filter((definition) => definition.kind === pickerFilter), [catalog, pickerFilter]);
  const activeIndex = active ? pickerItems.findIndex((definition) => definition.id === active.id) : -1;

  useEffect(() => {
    if (galleryPage !== gallery.page) setGalleryPage(gallery.page);
  }, [gallery.page, galleryPage]);

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
                  profile={previewAuthoringEnabled ? 'preview' : demoMode ? 'demo' : 'play'}
                  presentation="immersive"
                  onQuit={quit}
                  {...(demoMode ? { onDemoAdvance: advanceDemo, onDemoExit: quit } : {})}
                  onLocalDemoChange={setLocalDemoMode}
                  onSaveDefaults={saveSceneDefaults}
                  showIntroCard={!previewAuthoringEnabled}
                  {...(import.meta.env.DEV && activePreviewProfile ? { previewAuthoring: {
                    enabled: previewAuthoringEnabled,
                    profile: activePreviewProfile,
                    ...(activeSavedPreviewProfile ? { savedProfile: activeSavedPreviewProfile } : {}),
                    assetBaseUrl: import.meta.env.BASE_URL,
                    maxFps: previewMaxFps,
                    onEnabledChange: (enabled: boolean) => {
                      setPreviewAuthoringEnabled(enabled);
                      if (enabled) { setDemoMode(false); setLocalDemoMode(false); }
                    },
                    onProfileChange: changePreviewProfile,
                    onSave: savePreviewProfile,
                    onReset: resetPreviewProfile,
                    onCapture: capturePreview,
                  } } : {})}
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
              {import.meta.env.DEV && (
                <DemoDevSettings
                  open={demoSettingsOpen}
                  onOpenChange={setDemoSettingsOpen}
                  showFps={previewFpsVisible}
                  onShowFpsChange={setPreviewFpsVisible}
                  fidelity={previewFidelity}
                  onFidelityChange={setPreviewFidelity}
                  frameRateMode={previewFrameRateMode}
                  resolvedFrameRate={previewMaxFps}
                  onFrameRateModeChange={setPreviewFrameRateMode}
                  onRestartPreviews={() => { setPreviewSessionSeed(randomSessionSeed()); }}
                />
              )}
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
                      <button key={kind} type="button" onClick={() => { setFilter(kind); setGalleryPage(0); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:rounded-xl sm:px-6 sm:py-2.5 sm:text-sm ${filter === kind ? 'bg-white text-slate-900 shadow-md dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>{KIND_LABELS[kind]}</button>
                    ))}
                  </div>
                </div>
                <div className="mb-8 flex flex-col items-center justify-center gap-3">
                  <button type="button" onClick={startDemo} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-sky-400 to-cyan-400 px-4 py-2 text-sm font-bold text-white shadow-md shadow-sky-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"><Play size={14} />Demo mode</button>
                </div>
                {catalog.length === 0 ? <p className="py-24 text-center text-slate-400" role="status">Loading GLGameLab experiences…</p> : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                    {galleryItems.map((definition, index) => <ExperienceCard key={definition.id} definition={definition} previewProfile={previewProfiles[definition.id] ?? createDefaultPreviewProfile(definition, definitionSettings(definition))} previewSessionSeed={previewSessionSeed} assetBaseUrl={import.meta.env.BASE_URL} index={index} onSelect={selectExperience} showPreviewFps={previewFpsVisible} previewsEnabled={previewFidelity === 'simulation'} previewMaxFps={previewMaxFps} hideKindBadge={filter === 'simulation'} />)}
                  </div>
                )}
                {galleryPageCount > 1 && (
                  <nav aria-label="Experience pages" className="mt-10 flex items-center justify-center gap-2">
                    <button type="button" aria-label="Previous experience page" disabled={galleryPage === 0} onClick={() => { setGalleryPage((page) => Math.max(0, page - 1)); }} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"><ChevronLeft size={16} /></button>
                    {Array.from({ length: galleryPageCount }, (_, page) => (
                      <button key={page} type="button" aria-label={`Experience page ${page + 1}`} aria-current={galleryPage === page ? 'page' : undefined} onClick={() => { setGalleryPage(page); }} className={`h-9 min-w-9 rounded-lg px-3 text-xs font-semibold transition-colors ${galleryPage === page ? 'bg-cyan-300 text-slate-950' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-white/45 dark:hover:bg-white/10'}`}>{page + 1}</button>
                    ))}
                    <button type="button" aria-label="Next experience page" disabled={galleryPage >= galleryPageCount - 1} onClick={() => { setGalleryPage((page) => Math.min(galleryPageCount - 1, page + 1)); }} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"><ChevronRight size={16} /></button>
                  </nav>
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
                        {pickerItems.map((definition, index) => <div key={definition.id} className="shrink-0 snap-start py-0.5"><CarouselTile definition={definition} previewProfile={previewProfiles[definition.id] ?? createDefaultPreviewProfile(definition, definitionSettings(definition))} previewSessionSeed={previewSessionSeed} assetBaseUrl={import.meta.env.BASE_URL} index={index} active={definition.id === active.id} onSelect={selectExperience} size={88} showPreviewFps={previewFpsVisible} previewsEnabled={previewFidelity === 'simulation'} previewMaxFps={previewMaxFps} /></div>)}
                      </div>
                    ) : (
                      <div className="flex h-[132px] items-stretch">
                        <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-white/[0.07] px-2 py-1.5">
                          {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => <button key={kind} type="button" onClick={() => { setPickerFilter(kind); }} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors ${pickerFilter === kind ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'}`}>{KIND_LABELS[kind]}</button>)}
                        </div>
                        <button type="button" aria-label="Previous" onClick={() => { move(-1); }} className="flex shrink-0 items-center justify-center px-1.5 text-white/25 transition-colors hover:text-white/60"><ChevronLeft size={15} /></button>
                        <div ref={scrollerRef} className="flex flex-1 items-center gap-2 overflow-x-auto px-1" style={{ scrollbarWidth: 'none' }}>
                          {pickerItems.map((definition, index) => <CarouselTile key={definition.id} definition={definition} previewProfile={previewProfiles[definition.id] ?? createDefaultPreviewProfile(definition, definitionSettings(definition))} previewSessionSeed={previewSessionSeed} assetBaseUrl={import.meta.env.BASE_URL} index={index} active={definition.id === active.id} onSelect={selectExperience} size={80} showPreviewFps={previewFpsVisible} previewsEnabled={previewFidelity === 'simulation'} previewMaxFps={previewMaxFps} />)}
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
                        {pickerItems.map((definition, index) => <CarouselTile key={definition.id} definition={definition} previewProfile={previewProfiles[definition.id] ?? createDefaultPreviewProfile(definition, definitionSettings(definition))} previewSessionSeed={previewSessionSeed} assetBaseUrl={import.meta.env.BASE_URL} index={index} active={definition.id === active.id} onSelect={selectExperience} size={74} labelRight showPreviewFps={previewFpsVisible} previewsEnabled={previewFidelity === 'simulation'} previewMaxFps={previewMaxFps} />)}
                      </div>
                      <button type="button" aria-label="Next" onClick={() => { move(1); }} className="py-1 text-white/25 transition-colors hover:text-white/60"><ChevronDown className="mx-auto" size={15} /></button>
                    </div>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </>
        )}
        <AnimatePresence>
          {captureCandidate && (
            <PreviewCaptureComparison
              candidate={captureCandidate}
              assetBaseUrl={import.meta.env.BASE_URL}
              onCancel={cancelCapture}
              onApprove={() => persistPreviewCapture(captureCandidate)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DemoDevSettings({
  open,
  onOpenChange,
  showFps,
  onShowFpsChange,
  fidelity,
  onFidelityChange,
  frameRateMode,
  resolvedFrameRate,
  onFrameRateModeChange,
  onRestartPreviews,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly showFps: boolean;
  readonly onShowFpsChange: (visible: boolean) => void;
  readonly fidelity: PreviewFidelity;
  readonly onFidelityChange: (fidelity: PreviewFidelity) => void;
  readonly frameRateMode: PreviewFrameRateMode;
  readonly resolvedFrameRate: PreviewFrameRate;
  readonly onFrameRateModeChange: (mode: PreviewFrameRateMode) => void;
  readonly onRestartPreviews: () => void;
}): JSX.Element {
  return (
    <div className="fixed right-4 top-4 z-[80]">
      <button
        type="button"
        aria-label="Demo settings"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg ring-1 transition-colors ${open ? 'bg-cyan-200 text-slate-950 ring-cyan-100/70' : 'bg-white/90 text-slate-600 ring-slate-900/10 hover:text-slate-950 dark:bg-zinc-900/90 dark:text-white/55 dark:ring-white/12 dark:hover:text-white'}`}
      >
        <SettingsIcon size={17} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="Demo development settings"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl bg-white/95 p-2 text-slate-800 shadow-2xl ring-1 ring-slate-900/10 backdrop-blur-xl dark:bg-zinc-950/95 dark:text-white dark:ring-white/12"
          >
            <div className="px-2 pb-2 pt-1">
              <p className="text-xs font-bold">Demo settings</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-white/35">Local development only. Production keeps simulated previews with FPS hidden.</p>
            </div>
            <button type="button" onClick={() => onShowFpsChange(!showFps)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-200"><Activity size={15} /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Show preview FPS</span><span className="block text-[10px] text-slate-500 dark:text-white/35">Overlay engine FPS on live tiles.</span></span>
              <span aria-hidden className={`h-5 w-9 rounded-full p-0.5 transition-colors ${showFps ? 'bg-cyan-400' : 'bg-slate-300 dark:bg-white/15'}`}><span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showFps ? 'translate-x-4' : ''}`} /></span>
            </button>
            <div className="mt-1 rounded-xl px-2 py-2">
              <div className="mb-2 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"><Activity size={15} /></span>
                <span className="min-w-0"><span className="block text-xs font-semibold">Preview frame rate</span><span className="block text-[10px] text-slate-500 dark:text-white/35">{frameRateMode === 'auto' ? `Auto is currently using ${resolvedFrameRate} FPS.` : `Fixed at ${resolvedFrameRate} FPS.`}</span></span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['auto', 30, 45, 60] as const).map((value) => <button key={value} type="button" aria-pressed={frameRateMode === value} onClick={() => onFrameRateModeChange(value)} className={`rounded-lg px-1 py-1.5 text-[9px] font-bold uppercase tracking-wider ${frameRateMode === value ? 'bg-cyan-200 text-slate-950' : 'bg-slate-900/[0.05] text-slate-500 hover:bg-slate-900/10 dark:bg-white/[0.05] dark:text-white/40 dark:hover:bg-white/10'}`}>{value === 'auto' ? 'Auto' : value}</button>)}
              </div>
            </div>
            <div className="mt-1 rounded-xl px-2 py-2">
              <div className="mb-2 flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-200">{fidelity === 'simulation' ? <MonitorPlay size={15} /> : <ImageIcon size={15} />}</span>
                <span><span className="block text-xs font-semibold">Preview fidelity</span><span className="block text-[10px] text-slate-500 dark:text-white/35">Force live-capable or image-only tiles.</span></span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(['simulation', 'image'] as const).map((value) => <button key={value} type="button" aria-pressed={fidelity === value} onClick={() => onFidelityChange(value)} className={`rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${fidelity === value ? 'bg-cyan-200 text-slate-950' : 'bg-slate-900/[0.05] text-slate-500 hover:bg-slate-900/10 dark:bg-white/[0.05] dark:text-white/40 dark:hover:bg-white/10'}`}>{value === 'simulation' ? 'Simulated' : 'Image only'}</button>)}
              </div>
            </div>
            <button type="button" onClick={onRestartPreviews} className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-200"><RefreshCw size={15} /></span>
              <span><span className="block text-xs font-semibold">New preview variations</span><span className="block text-[10px] text-slate-500 dark:text-white/35">Generate a fresh session seed for every tile.</span></span>
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ExperienceCardProps {
  readonly definition: ExperienceDefinition;
  readonly previewProfile: ExperiencePreviewProfile;
  readonly previewSessionSeed: number;
  readonly assetBaseUrl: string;
  readonly index: number;
  readonly onSelect: (definition: ExperienceDefinition) => void;
  readonly showPreviewFps?: boolean;
  readonly previewsEnabled?: boolean;
  readonly previewMaxFps: PreviewFrameRate;
  readonly hideKindBadge?: boolean;
}

function ExperienceCard({ definition, previewProfile, previewSessionSeed, assetBaseUrl, index, onSelect, showPreviewFps = false, previewsEnabled = true, previewMaxFps, hideKindBadge = false }: ExperienceCardProps): JSX.Element {
  const badge = definition.kind === 'game' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300';
  return (
    <button type="button" data-demo-experience-card={definition.id} onClick={() => { onSelect(definition); }} className="group cursor-pointer select-none text-left">
      <div className="pointer-events-none relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 transition-transform duration-200 group-hover:scale-[1.03] dark:bg-[#0d0d1e]">
        <EnginePreviewTile definition={definition} profile={previewProfile} sessionSeed={previewSessionSeed} assetBaseUrl={assetBaseUrl} index={index} showDiagnostics={showPreviewFps} enabled={previewsEnabled} eager maxFps={previewMaxFps} {...(import.meta.env.DEV && previewsEnabled ? { renderPolicyOverride: 'live' as const } : {})} />
        {!hideKindBadge && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${badge}`}>{definition.kind}</span>}
      </div>
      <p className="mt-3 text-center text-sm font-semibold leading-tight text-slate-800 dark:text-slate-200">{definition.name}</p>
    </button>
  );
}

function CarouselTile({
  definition,
  previewProfile,
  previewSessionSeed,
  assetBaseUrl,
  index,
  active,
  onSelect,
  size,
  labelRight = false,
  showPreviewFps = false,
  previewsEnabled = true,
  previewMaxFps,
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
        <EnginePreviewTile definition={definition} profile={previewProfile} sessionSeed={previewSessionSeed} assetBaseUrl={assetBaseUrl} index={index} showDiagnostics={showPreviewFps} enabled={previewsEnabled} maxFps={previewMaxFps} {...(import.meta.env.DEV && previewsEnabled ? { renderPolicyOverride: 'live' as const } : {})} />
      </button>
      <span className={`truncate text-[9px] font-medium leading-tight text-white/50 ${labelRight ? 'min-w-0 flex-1 text-left' : 'text-center'}`} style={labelRight ? undefined : { maxWidth: size }}>{definition.name}</span>
    </div>
  );
}

function PreviewCaptureComparison({
  candidate,
  assetBaseUrl,
  onCancel,
  onApprove,
}: {
  readonly candidate: PreviewCaptureCandidate;
  readonly assetBaseUrl: string;
  readonly onCancel: () => void;
  readonly onApprove: () => Promise<void>;
}): JSX.Element {
  const [saving, setSaving] = useState(false);
  const hasExistingCapture = candidate.profile.image !== undefined;
  const before = candidate.profile.image ? `${assetBaseUrl}${candidate.profile.image.src}?v=${candidate.profile.image.revision}` : undefined;
  const approve = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try { await onApprove(); } finally { setSaving(false); }
  };
  return (
    <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <motion.div role="dialog" aria-modal="true" aria-label={hasExistingCapture ? 'Replace preview capture' : 'Approve preview capture'} className="w-full max-w-3xl rounded-2xl bg-zinc-950 p-4 text-white shadow-2xl ring-1 ring-white/15" initial={{ scale: 0.98, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, y: 8 }}>
        <div className="mb-4">
          <h3 className="text-base font-bold">{hasExistingCapture ? `Replace ${candidate.definition.name} preview?` : `Approve ${candidate.definition.name} preview?`}</h3>
          <p className="mt-1 text-xs text-white/45">{hasExistingCapture ? 'Compare the saved fallback with the frame currently shown in Preview mode.' : 'Review the captured frame before it is saved as this tile fallback.'}</p>
        </div>
        <div className={hasExistingCapture ? 'grid grid-cols-2 gap-3' : 'mx-auto w-full max-w-lg'}>
          {hasExistingCapture && <figure><figcaption className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">Before</figcaption><div className="aspect-square overflow-hidden rounded-xl bg-white/[0.05] ring-1 ring-white/10">{before ? <img src={before} alt="Existing preview" className="h-full w-full object-cover" /> : null}</div></figure>}
          <figure><figcaption className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-100/70">{hasExistingCapture ? 'After' : 'Captured preview'}</figcaption><div className="aspect-square overflow-hidden rounded-xl bg-white/[0.05] ring-1 ring-cyan-200/25"><img src={candidate.url} alt="New preview" className="h-full w-full object-cover" /></div></figure>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl px-3 py-2 text-sm text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40">{hasExistingCapture ? 'Cancel' : 'Reject'}</button>
          <button type="button" disabled={saving} onClick={() => { void approve(); }} className="rounded-xl bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-100 disabled:opacity-50">{saving ? 'Saving…' : hasExistingCapture ? 'Replace capture' : 'Approve capture'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function encodePreviewWebp(capture: CanvasFrameCapture): Promise<Blob> {
  if (capture.width < 1 || capture.height < 1 || capture.rgba.byteLength !== capture.width * capture.height * 4) throw new Error('Preview frame readback is invalid');
  const source = document.createElement('canvas');
  source.width = capture.width;
  source.height = capture.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('Canvas image encoding is unavailable');
  sourceContext.putImageData(new ImageData(new Uint8ClampedArray(capture.rgba), capture.width, capture.height), 0, 0);
  const target = document.createElement('canvas');
  target.width = 512;
  target.height = 512;
  const targetContext = target.getContext('2d');
  if (!targetContext) throw new Error('Canvas image encoding is unavailable');
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.drawImage(source, 0, 0, 512, 512);
  return new Promise((resolve, reject) => {
    target.toBlob((blob) => blob ? resolve(blob) : reject(new Error('This browser cannot encode WebP preview images')), 'image/webp', 0.9);
  });
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read preview image'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('Preview image encoding is invalid'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function randomSessionSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now() >>> 0;
  return Date.now() >>> 0;
}

function DiagnosticExperienceHost(): JSX.Element {
  const [runtimeError, setRuntimeError] = useState<string>();
  const [diagnosticStatus, setDiagnosticStatus] = useState('idle');
  const [contextResult, setContextResult] = useState<ContextCycleDiagnostics>();
  const [gpuGridValidation, setGpuGridValidation] = useState<GpuParticleGridValidation2D>();
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
  const gpuProbe = query.get('gpuProbe') === '1';
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
    if (gpuProbe) {
      try {
        const gpu2D = engine.kernel.get(WebGL2RendererService).gpu2D;
        setGpuGridValidation(gpu2D.validateParticleGridSupport());
        setDiagnosticStatus('gpu-probed');
      } catch (error) {
        setGpuGridValidation({ supported: false, reason: error instanceof Error ? error.message : String(error) });
        setDiagnosticStatus('gpu-probe-error');
      }
    }
    if (readyCountRef.current > 1) {
      window.setTimeout(() => {
        const previous = previousEngineRef.current;
        setDiagnosticStatus(previous?.state === 'destroyed' ? 'lifecycle-passed' : `lifecycle-failed:${previous?.state ?? 'missing'}`);
      }, 100);
    }
  }, [gpuProbe, inputTest]);
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
      {(contextTest || gpuProbe || lifecycleTest || inputTest) && (
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
          data-gpu-particle-grid-supported={gpuGridValidation?.supported}
          data-gpu-particle-grid-reason={gpuGridValidation?.reason}
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
