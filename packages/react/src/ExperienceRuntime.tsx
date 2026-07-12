import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, HelpCircle, Play, Settings as SettingsIcon, X } from 'lucide-react';
import {
  ExperienceRuntimeControllerService,
  type ExperienceDefinition,
  type ExperienceLaunchProfile,
  type ExperienceRuntimeController,
  type ExperienceSetting,
  type ExperienceSettingValue,
} from '@hooksjam/gl-game-lab-engine';
import type { GameEngine } from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from './GameCanvas.js';
import type { FixedFrameCaptureOptions, FixedFrameCaptureResult } from './GameCanvas.js';
import { HUD } from './ui/HUD.js';
import { IntroCard, type IntroHint } from './ui/IntroCard.js';
import { ModeToggle } from './ui/ModeToggle.js';
import { OverflowMenu } from './ui/OverflowMenu.js';
import { SettingsDrawer } from './ui/SettingsDrawer.js';
import { SimControlPanel } from './ui/SimControlPanel.js';
import { StylePicker as LegacyStylePicker } from './ui/StylePicker.js';
import { TopbarSelect } from './ui/TopbarSelect.js';
import { ViewportProvider, useViewportContext } from './ViewportProvider.js';

const SETTINGS_OPEN_STORAGE_KEY = 'gl-game-lab:settingsOpen';
const SETTINGS_PINNED_STORAGE_KEY = 'gl-game-lab:settingsPinned';
const DEFAULT_SETTINGS_SIDEBAR_WIDTH = 448;
const MIN_SETTINGS_SIDEBAR_WIDTH = 320;
const MAX_SETTINGS_SIDEBAR_WIDTH = 720;
const MIN_SCENE_STAGE_WIDTH = 360;
const COMPACT_TOPBAR_STAGE_WIDTH = 760;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)); } catch { /* Storage may be unavailable. */ }
}

function clampSettingsSidebarWidth(width: number, viewportWidth: number): number {
  return Math.max(
    MIN_SETTINGS_SIDEBAR_WIDTH,
    Math.min(MAX_SETTINGS_SIDEBAR_WIDTH, viewportWidth - MIN_SCENE_STAGE_WIDTH, width),
  );
}

export interface ExperienceRuntimeProps {
  readonly definition: ExperienceDefinition;
  readonly profile?: ExperienceLaunchProfile;
  readonly className?: string;
  readonly canvasClassName?: string;
  readonly initialModeId?: string;
  readonly initialStyleId?: string;
  readonly showChrome?: boolean;
  readonly onReady?: (engine: GameEngine, controller: ExperienceRuntimeController | undefined) => void;
  readonly onError?: (error: unknown) => void;
  readonly seed?: number;
  readonly fixedFrameCapture?: FixedFrameCaptureOptions;
  readonly onFixedFrameCapture?: (result: FixedFrameCaptureResult) => void;
  readonly showDiagnostics?: boolean;
  readonly presentation?: 'embedded' | 'immersive';
  readonly onQuit?: () => void;
  readonly showIntroCard?: boolean;
  readonly maxPixels?: number;
  readonly onDemoAdvance?: () => void;
  readonly onDemoExit?: () => void;
}

export function ExperienceRuntime({
  ...props
}: ExperienceRuntimeProps): JSX.Element {
  if (props.presentation === 'immersive') {
    return <ViewportProvider><ImmersiveExperienceRuntime {...props} /></ViewportProvider>;
  }
  return <EmbeddedExperienceRuntime {...props} />;
}

function EmbeddedExperienceRuntime({
  definition,
  profile = 'play',
  className,
  canvasClassName,
  initialModeId,
  initialStyleId,
  showChrome = true,
  onReady,
  onError,
  seed,
  fixedFrameCapture,
  onFixedFrameCapture,
  showDiagnostics = false,
  presentation = 'embedded',
  onQuit,
  showIntroCard = presentation === 'immersive',
  maxPixels,
}: ExperienceRuntimeProps): JSX.Element {
  const defaultModeId = initialModeId ?? definition.modes?.[0]?.id ?? 'default';
  const defaultStyleId = initialStyleId ?? definition.styleManifest?.defaultStyleId ?? 'default';
  const initialSettings = useMemo(() => settingDefaults(definition), [definition]);
  const [modeId, setModeId] = useState(defaultModeId);
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [settings, setSettings] = useState<Readonly<Record<string, ExperienceSettingValue>>>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [introOpen, setIntroOpen] = useState(showIntroCard);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const controllerRef = useRef<ExperienceRuntimeController>();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    controllerRef.current = undefined;
    setModeId(defaultModeId);
    setStyleId(defaultStyleId);
    setSettings(initialSettings);
    setSettingsOpen(false);
    setTutorialOpen(false);
    setTutorialIndex(0);
    setIntroOpen(showIntroCard);
    setStyleMenuOpen(false);
  }, [defaultModeId, defaultStyleId, definition.id, initialSettings, showIntroCard]);

  useEffect(() => {
    if (!introOpen || !showIntroCard) return;
    const timeout = globalThis.setTimeout(() => { setIntroOpen(false); }, 6_000);
    return () => { globalThis.clearTimeout(timeout); };
  }, [introOpen, showIntroCard]);

  const createPlugins = useCallback(() => definition.createPlugins({
    profile,
    modeId: defaultModeId,
    styleId: defaultStyleId,
    settings: initialSettings,
    ...(seed !== undefined ? { seed } : {}),
  }), [defaultModeId, defaultStyleId, definition, initialSettings, profile, seed]);

  const handleReady = useCallback((engine: GameEngine): void => {
    const controller = engine.kernel.tryGet(ExperienceRuntimeControllerService);
    controllerRef.current = controller;
    onReadyRef.current?.(engine, controller);
  }, []);

  const changeMode = (nextModeId: string): void => {
    controllerRef.current?.setMode(nextModeId);
    setModeId(nextModeId);
  };
  const changeStyle = (nextStyleId: string): void => {
    controllerRef.current?.setStyle(nextStyleId);
    setStyleId(nextStyleId);
  };
  const changeSetting = (setting: ExperienceSetting, value: ExperienceSettingValue): void => {
    controllerRef.current?.setSetting(setting.key, value);
    setSettings((current) => ({ ...current, [setting.key]: value }));
  };
  const reset = (): void => {
    controllerRef.current?.reset();
  };

  const visibleSettings = (definition.settings ?? []).filter((setting) => (
    (presentation === 'immersive' || showAdvanced || setting.advanced !== true)
    && (!setting.visibleModes || setting.visibleModes.includes(modeId))
    && (!setting.visibleRenderStyles || setting.visibleRenderStyles.includes(String(settings.renderStyle ?? '')))
  ));
  const tutorialPages = definition.tutorialPages ?? [];
  const tutorialPage = tutorialPages[tutorialIndex];

  return (
    <section
      className={classNames('gl-experience-runtime', presentation === 'immersive' ? 'gl-experience-runtime-immersive' : undefined, className)}
      data-experience-id={definition.id}
      data-experience-profile={profile}
    >
      {showChrome && (
        <header className="gl-experience-toolbar" aria-label={`${definition.name} controls`}>
          {presentation === 'immersive' && onQuit && (
            <button type="button" className="gl-experience-quit" aria-label="Quit" onClick={onQuit}>
              <span aria-hidden="true">×</span><span>Quit</span>
            </button>
          )}
          {(definition.modes?.length ?? 0) > 0 && (
            <div className="gl-experience-modes" role="group" aria-label="Interaction mode">
              {definition.modes?.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className="gl-experience-mode"
                  aria-pressed={modeId === mode.id}
                  title={mode.description}
                  onClick={() => { changeMode(mode.id); }}
                >
                  <span aria-hidden="true">{mode.icon}</span>
                  {mode.label}
                </button>
              ))}
            </div>
          )}
          <div className="gl-experience-actions">
            {(definition.styleManifest?.styles.length ?? 0) > 0 && (
              <StylePicker
                styles={definition.styleManifest?.styles ?? []}
                value={styleId}
                open={styleMenuOpen}
                onToggle={() => { setStyleMenuOpen((open) => !open); }}
                onChange={(nextStyleId) => { changeStyle(nextStyleId); setStyleMenuOpen(false); }}
              />
            )}
            {definition.capabilities.settings && (
              <button type="button" className="gl-experience-action-control" aria-label="Settings" aria-pressed={settingsOpen} onClick={() => { setSettingsOpen((open) => !open); }}>
                <span aria-hidden="true">⚙</span><span className="gl-experience-action-label">Settings</span>
              </button>
            )}
            {definition.capabilities.tutorial && tutorialPages.length > 0 && (
              <button type="button" className="gl-experience-action-control" aria-label="How to play" onClick={() => { setTutorialIndex(0); setTutorialOpen(true); }}>
                <span aria-hidden="true">?</span><span className="gl-experience-action-label">How to play</span>
              </button>
            )}
            {definition.capabilities.reset && <button type="button" className="gl-experience-action-control" aria-label="Reset" onClick={reset}><span aria-hidden="true">↻</span><span className="gl-experience-action-label">Reset</span></button>}
          </div>
        </header>
      )}

      <div className="gl-experience-stage">
        <GameCanvas
          createPlugins={createPlugins}
          ariaLabel={`${definition.name} game canvas`}
          onReady={handleReady}
          showDiagnostics={showDiagnostics}
          {...(maxPixels === undefined ? {} : { maxPixels })}
          {...(fixedFrameCapture ? { fixedFrameCapture } : {})}
          {...(onFixedFrameCapture ? { onFixedFrameCapture } : {})}
          {...(canvasClassName ? { className: canvasClassName } : {})}
          {...(onError ? { onError } : {})}
        />
      </div>

      {showChrome && introOpen && (
        <button type="button" className="gl-experience-intro-card" onClick={() => { setIntroOpen(false); }}>
          <span className="gl-experience-intro-icon" aria-hidden="true">{definition.icon}</span>
          <span className="gl-experience-intro-copy">
            <strong>{definition.name}</strong>
            <span>{definition.long}</span>
            {(definition.modes?.length ?? 0) > 0 && (
              <span className="gl-experience-intro-hints">
                {definition.modes?.map((mode) => (
                  <span key={mode.id}><b>{mode.label}</b>{mode.description ?? definition.short}</span>
                ))}
              </span>
            )}
            <small>Tap anywhere to dismiss</small>
          </span>
        </button>
      )}

      {showChrome && (definition.attributions?.length ?? 0) > 0 && (
        <footer className="gl-experience-attributions" aria-label={`${definition.name} attributions`}>
          Inspired by {definition.attributions?.map((attribution, index) => (
            <span key={attribution.href}>
              {index > 0 ? ', ' : ''}<a href={attribution.href} target="_blank" rel="noreferrer">{attribution.label}</a>
              {attribution.author ? ` by ${attribution.author}` : ''}{attribution.license ? ` (${attribution.license})` : ''}
            </span>
          ))}
        </footer>
      )}

      {showChrome && settingsOpen && (
        <aside className="gl-experience-settings" aria-label={`${definition.name} settings`}>
          <div className="gl-experience-panel-heading">
            <h2>Settings</h2>
            <button type="button" aria-label="Close settings" onClick={() => { setSettingsOpen(false); }}>×</button>
          </div>
          {presentation !== 'immersive' && (definition.settings?.some((setting) => setting.advanced) ?? false) && (
            <label className="gl-experience-advanced-toggle">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(event) => { setShowAdvanced(event.currentTarget.checked); }}
              />
              Advanced
            </label>
          )}
          <div className="gl-experience-setting-list">
            {visibleSettings.map((setting) => (
              <SettingControl
                key={setting.key}
                setting={setting}
                value={settings[setting.key] ?? setting.default}
                onChange={(value) => { changeSetting(setting, value); }}
              />
            ))}
          </div>
        </aside>
      )}

      {showChrome && tutorialOpen && tutorialPage && (
        <div className="gl-experience-tutorial-backdrop" role="presentation">
          <section className="gl-experience-tutorial" role="dialog" aria-modal="true" aria-label={`${definition.name} tutorial`}>
            <div className="gl-experience-tutorial-icon" aria-hidden="true">{tutorialPage.icon}</div>
            <h2>{tutorialPage.title}</h2>
            <p>{tutorialPage.body}</p>
            <div className="gl-experience-tutorial-progress" aria-label={`Page ${tutorialIndex + 1} of ${tutorialPages.length}`}>
              {tutorialPages.map((page, index) => <span key={page.title} data-active={index === tutorialIndex} />)}
            </div>
            <div className="gl-experience-tutorial-actions">
              <button
                type="button"
                disabled={tutorialIndex === 0}
                onClick={() => { setTutorialIndex((index) => Math.max(0, index - 1)); }}
              >
                Back
              </button>
              {tutorialIndex < tutorialPages.length - 1 ? (
                <button type="button" onClick={() => { setTutorialIndex((index) => index + 1); }}>Next</button>
              ) : (
                <button type="button" onClick={() => { setTutorialOpen(false); }}>Play</button>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

const RUNTIME_PERF_CSS = `
.gl-game-lab-runtime-shell [class*="backdrop-blur"] {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
.gl-game-lab-runtime-shell [class*="shadow"] { box-shadow: none !important; }
.gl-game-lab-runtime-shell [class*="drop-shadow"] { filter: none !important; }
.gl-game-lab-runtime-shell [class*="transition"] {
  transition-property: none !important;
  transition-duration: 0ms !important;
}
`;

function ImmersiveExperienceRuntime({
  definition,
  profile = 'play',
  className,
  canvasClassName,
  initialModeId,
  initialStyleId,
  showChrome = true,
  onReady,
  onError,
  seed,
  fixedFrameCapture,
  onFixedFrameCapture,
  showDiagnostics = false,
  onQuit,
  showIntroCard = true,
  maxPixels,
  onDemoAdvance,
  onDemoExit,
}: ExperienceRuntimeProps): JSX.Element {
  const { isMobile, isLandscape } = useViewportContext();
  const mobilePortrait = isMobile && !isLandscape;
  const defaultModeId = initialModeId ?? definition.modes?.[0]?.id ?? 'default';
  const defaultStyleId = initialStyleId ?? definition.styleManifest?.defaultStyleId ?? 'default';
  const initialSettings = useMemo(() => settingDefaults(definition), [definition]);
  const [modeId, setModeId] = useState(defaultModeId);
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [settings, setSettings] = useState<Readonly<Record<string, ExperienceSettingValue>>>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(() => readStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, false));
  const [settingsPinned, setSettingsPinned] = useState(() => readStoredBoolean(SETTINGS_PINNED_STORAGE_KEY, false));
  const [settingsSidebarWidth, setSettingsSidebarWidth] = useState(DEFAULT_SETTINGS_SIDEBAR_WIDTH);
  const [isCompactTopbar, setIsCompactTopbar] = useState(false);
  const [infoCardVisible, setInfoCardVisible] = useState(showIntroCard);
  const [infoAutoDismiss, setInfoAutoDismiss] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);
  const [isDemo, setIsDemo] = useState(profile === 'demo');
  const [demoHintVisible, setDemoHintVisible] = useState(profile === 'demo');
  const [activeProfile, setActiveProfile] = useState<ExperienceLaunchProfile>(profile);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [localMaxPixels, setLocalMaxPixels] = useState(maxPixels);
  const [qualityMode, setQualityMode] = useState(definition.capabilities.qualityModes?.[0] ?? 'raw');
  const controllerRef = useRef<ExperienceRuntimeController>();
  const engineRef = useRef<GameEngine>();
  const sceneStageRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const demoHintTimerRef = useRef<number>();
  onReadyRef.current = onReady;

  useEffect(() => {
    controllerRef.current = undefined;
    engineRef.current = undefined;
    setModeId(defaultModeId);
    setStyleId(defaultStyleId);
    setSettings(initialSettings);
    setSettingsOpen(readStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, false));
    setInfoCardVisible(showIntroCard && profile !== 'demo');
    setInfoAutoDismiss(true);
    setUiHidden(profile === 'demo');
    setIsDemo(profile === 'demo');
    setActiveProfile(profile);
    setQualityMode(definition.capabilities.qualityModes?.[0] ?? 'raw');
  }, [defaultModeId, defaultStyleId, definition.capabilities.qualityModes, definition.id, initialSettings, profile, showIntroCard]);

  useEffect(() => {
    writeStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    const stage = sceneStageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const update = (width: number): void => { setIsCompactTopbar(width <= COMPACT_TOPBAR_STAGE_WIDTH); };
    const observer = new ResizeObserver(([entry]) => { if (entry) update(entry.contentRect.width); });
    update(stage.clientWidth);
    observer.observe(stage);
    return () => { observer.disconnect(); };
  }, []);

  useEffect(() => () => {
    if (demoHintTimerRef.current !== undefined) window.clearTimeout(demoHintTimerRef.current);
  }, []);

  const createPlugins = useCallback(() => definition.createPlugins({
    profile: activeProfile,
    modeId: defaultModeId,
    styleId: defaultStyleId,
    settings: initialSettings,
    ...(seed !== undefined ? { seed } : {}),
  }), [activeProfile, defaultModeId, defaultStyleId, definition, initialSettings, seed]);

  const handleReady = useCallback((engine: GameEngine): void => {
    engineRef.current = engine;
    const controller = engine.kernel.tryGet(ExperienceRuntimeControllerService);
    controllerRef.current = controller;
    onReadyRef.current?.(engine, controller);
  }, []);

  const changeMode = useCallback((nextModeId: string): void => {
    controllerRef.current?.setMode(nextModeId);
    setModeId(nextModeId);
  }, []);
  const changeStyle = useCallback((nextStyleId: string): void => {
    controllerRef.current?.setStyle(nextStyleId);
    setStyleId(nextStyleId);
  }, []);
  const changeSetting = useCallback((setting: ExperienceSetting, value: ExperienceSettingValue): void => {
    controllerRef.current?.setSetting(setting.key, value);
    setSettings((current) => ({ ...current, [setting.key]: value }));
  }, []);

  const visibleSettings = useMemo(() => (definition.settings ?? []).filter((setting) => (
    (!setting.visibleModes || setting.visibleModes.includes(modeId))
    && (!setting.visibleRenderStyles || setting.visibleRenderStyles.includes(String(settings.renderStyle ?? '')))
  )), [definition.settings, modeId, settings.renderStyle]);
  const topControlFields = useMemo(() => visibleSettings.filter((setting) => (
    setting.advanced !== true && (setting.type === 'number' || setting.type === 'select')
  )), [visibleSettings]);
  const hasModes = (definition.modes?.length ?? 0) > 1;
  const styleOptions = useMemo(() => (definition.styleManifest?.styles ?? []).map((style) => ({ id: style.id, label: style.name, chipColors: [...style.palette] })), [definition.styleManifest]);

  const introHints = useMemo(() => {
    const hints: IntroHint[] = (definition.modes ?? [])
      .slice(0, 3)
      .filter((mode) => Boolean(mode.description))
      .map((mode) => ({ label: mode.label, action: mode.description ?? definition.short }));
    if (topControlFields.some((setting) => setting.type === 'number')) {
      hints.push({ label: 'Sliders', action: 'adjust physics and visual settings at the top' });
    }
    return hints;
  }, [definition.modes, definition.short, topControlFields]);

  const controlsHeaderSlot = mobilePortrait && (definition.styleManifest || hasModes) ? (
    <>
      {definition.styleManifest && <TopbarSelect label="Palette" options={styleOptions} value={styleId} onChange={changeStyle} hideLabel />}
      {hasModes && <ModeToggle modes={definition.modes ?? []} value={modeId} onChange={changeMode} />}
    </>
  ) : undefined;

  const openSettings = (): void => { setSettingsOpen(true); };
  const closeSettings = (): void => { setSettingsOpen(false); };
  const changeSettingsPinned = (pinned: boolean): void => {
    writeStoredBoolean(SETTINGS_PINNED_STORAGE_KEY, pinned);
    setSettingsPinned(pinned);
    if (pinned) setSettingsOpen(true);
  };
  const resizeSettingsSidebar = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settingsSidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (next: PointerEvent): void => {
      setSettingsSidebarWidth(clampSettingsSidebarWidth(startWidth + startX - next.clientX, window.innerWidth));
    };
    const finish = (): void => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };
  const openInfo = (): void => {
    setInfoAutoDismiss(false);
    setInfoCardVisible(true);
  };
  const showDemoHint = (): void => {
    setDemoHintVisible(true);
    if (demoHintTimerRef.current !== undefined) window.clearTimeout(demoHintTimerRef.current);
    demoHintTimerRef.current = window.setTimeout(() => { setDemoHintVisible(false); }, 3_000);
  };
  const enterDemo = (): void => {
    setInfoCardVisible(false);
    setSettingsOpen(false);
    setUiHidden(true);
    setIsDemo(true);
    setDemoHintVisible(true);
    setActiveProfile('demo');
    setRuntimeKey((value) => value + 1);
    showDemoHint();
  };
  const exitDemo = (): void => {
    setIsDemo(false);
    setUiHidden(false);
    setActiveProfile(profile);
    setRuntimeKey((value) => value + 1);
  };
  const settingsDocked = settingsOpen && settingsPinned && !mobilePortrait && !uiHidden && !isDemo;

  return (
    <section
      className={classNames('gl-game-lab-runtime-shell fixed left-0 top-0 z-50 flex h-full w-full overflow-hidden bg-black', className)}
      data-experience-id={definition.id}
      data-experience-profile={activeProfile}
    >
      <style>{RUNTIME_PERF_CSS}</style>
      <div ref={sceneStageRef} className="relative h-full min-w-0 flex-1 overflow-hidden">
        <GameCanvas
          key={runtimeKey}
          createPlugins={createPlugins}
          ariaLabel={`${definition.name} game canvas`}
          onReady={handleReady}
          showDiagnostics={showDiagnostics}
          {...(fixedFrameCapture ? { fixedFrameCapture } : {})}
          {...(onFixedFrameCapture ? { onFixedFrameCapture } : {})}
          {...(canvasClassName ? { className: canvasClassName } : { className: 'h-full w-full touch-none' })}
          {...(onError ? { onError } : {})}
          {...(localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
        />

      {showChrome && !isDemo && (
        <div className={uiHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}>
          <AnimatePresence>
            {infoCardVisible && (
              <IntroCard
                key={`${definition.id}:${runtimeKey}`}
                icon={definition.icon}
                name={definition.name}
                short={definition.short}
                hints={introHints}
                attributions={definition.attributions ? [...definition.attributions] : []}
                autoDismiss={infoAutoDismiss}
                onDismiss={() => { setInfoCardVisible(false); }}
              />
            )}
          </AnimatePresence>

          <HUD
            {...(onQuit ? { onQuit } : {})}
            controls={(definition.styleManifest && !mobilePortrait) || (hasModes && !mobilePortrait) ? (
              <div className="flex items-center gap-1.5">
                {definition.styleManifest && <TopbarSelect label="Palette" options={styleOptions} value={styleId} onChange={changeStyle} hideLabel />}
                {hasModes && <ModeToggle modes={definition.modes ?? []} value={modeId} onChange={changeMode} />}
              </div>
            ) : undefined}
          />

          <OverflowMenu compact={isCompactTopbar} items={[
            {
              key: 'engine-configuration', label: 'Engine configuration', hidden: (definition.capabilities.qualityModes?.length ?? 0) === 0,
              node: <QualityModeSelector modes={definition.capabilities.qualityModes ?? []} value={qualityMode} onChange={(next) => { setQualityMode(next); engineRef.current?.quality.setTier(next === 'basic' ? 'mobile' : 'desktop'); }} />,
            },
            {
              key: 'reset', label: 'Reset', hidden: !definition.capabilities.reset,
              node: <button type="button" className="flex h-8 items-center rounded-xl bg-black/30 px-3 text-xs font-semibold text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" onClick={() => { controllerRef.current?.reset(); }}>Reset</button>,
            },
            {
              key: 'settings', label: 'Settings', closeOnActivate: true,
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={openSettings} aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"><SettingsIcon size={15} /></motion.button>,
            },
            {
              key: 'hide-ui', label: 'Hide UI',
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => { setUiHidden(true); }} aria-label="Hide UI" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/40 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white/70"><EyeOff size={14} /></motion.button>,
            },
            {
              key: 'demo', label: 'Demo mode', hidden: !definition.capabilities.demo,
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={enterDemo} aria-label="Demo mode" className="flex h-8 items-center gap-1.5 rounded-xl bg-black/30 px-2.5 text-white/40 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white/70"><Play size={11} /><span className="text-[10px] uppercase tracking-widest">Demo</span></motion.button>,
            },
            {
              key: 'info', label: 'How to play',
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={openInfo} aria-label="Info" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/40 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white/70"><HelpCircle size={15} /></motion.button>,
            },
          ]} />

          {!settingsDocked && (
            <SettingsDrawer
              open={settingsOpen}
              onClose={closeSettings}
              values={settings}
              fields={visibleSettings}
              onChange={changeSetting}
              {...(localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
              onMaxPixelsChange={setLocalMaxPixels}
              ariaLabel={`${definition.name} settings`}
              pinned={settingsPinned && !mobilePortrait}
              onPinnedChange={changeSettingsPinned}
            />
          )}

          {(topControlFields.length > 0 || controlsHeaderSlot) && (
            <SimControlPanel values={settings} fields={topControlFields} onChange={changeSetting} headerSlot={controlsHeaderSlot} />
          )}
        </div>
      )}

      {showChrome && isDemo && (
        <>
          <button type="button" className="absolute inset-0 z-10 cursor-pointer" aria-label="Advance demo" onPointerMove={showDemoHint} onClick={() => { if (onDemoAdvance) onDemoAdvance(); else controllerRef.current?.reset(); showDemoHint(); }} />
          <AnimatePresence>
            {demoHintVisible && (
              <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute right-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/60 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" aria-label="Exit demo" onClick={(event) => { event.stopPropagation(); if (onDemoExit) onDemoExit(); else exitDemo(); }}><X size={14} /></motion.button>
            )}
          </AnimatePresence>
        </>
      )}

      {showChrome && uiHidden && !isDemo && (
        <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute right-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/60 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" aria-label="Restore UI" onClick={() => { setUiHidden(false); }}><Eye size={14} /></motion.button>
      )}
      </div>

      {showChrome && settingsDocked && (
        <div className="relative h-full shrink-0" style={{ width: settingsSidebarWidth }}>
          <button
            type="button"
            aria-label="Resize settings sidebar"
            title="Resize settings sidebar"
            onPointerDown={resizeSettingsSidebar}
            className="absolute bottom-0 left-0 top-0 z-[60] w-3 -translate-x-1/2 cursor-col-resize touch-none"
          >
            <span className="absolute left-1/2 top-1/2 h-12 w-px -translate-y-1/2 rounded-full bg-white/20" />
          </button>
          <SettingsDrawer
            open={settingsOpen}
            onClose={closeSettings}
            values={settings}
            fields={visibleSettings}
            onChange={changeSetting}
            {...(localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
            onMaxPixelsChange={setLocalMaxPixels}
            ariaLabel={`${definition.name} settings`}
            pinned
            docked
            onPinnedChange={changeSettingsPinned}
          />
        </div>
      )}
    </section>
  );
}

function QualityModeSelector({ modes, value, onChange }: { readonly modes: readonly string[]; readonly value: string; readonly onChange: (value: string) => void }): JSX.Element {
  const labels: Readonly<Record<string, string>> = {
    basic: 'Basic 2D',
    enhanced: 'GPU Enhanced',
    raw: 'Raw WebGL2',
    standard: 'Standard',
  };
  return (
    <motion.label initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="flex h-8 items-center gap-2 rounded-xl bg-black/30 px-2 backdrop-blur-md">
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 sm:inline">Engine</span>
      <select value={value} onChange={(event) => { onChange(event.currentTarget.value); }} aria-label="Engine configuration" className="h-6 min-w-36 rounded-lg border border-white/10 bg-black/40 px-2 text-xs font-semibold text-white outline-none transition-colors hover:bg-black/55 focus:border-white/35 focus:ring-1 focus:ring-white/20">
        {modes.map((mode) => <option key={mode} value={mode}>{labels[mode] ?? mode}</option>)}
      </select>
    </motion.label>
  );
}

interface SettingControlProps {
  readonly setting: ExperienceSetting;
  readonly value: ExperienceSettingValue;
  readonly onChange: (value: ExperienceSettingValue) => void;
}

function SettingControl({ setting, value, onChange }: SettingControlProps): JSX.Element {
  if (setting.type === 'boolean') {
    return (
      <div className="gl-experience-setting gl-experience-setting-boolean">
        <SettingLabel setting={setting} />
        <button type="button" className="gl-experience-switch" role="switch" aria-checked={value === true} onClick={() => { onChange(value !== true); }}>
          <span />
        </button>
      </div>
    );
  }
  if (setting.type === 'select') {
    return (
      <label className="gl-experience-setting">
        <SettingLabel setting={setting} />
        <select value={String(value)} onChange={(event) => { onChange(event.currentTarget.value); }}>
          {setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (setting.type === 'string') {
    return (
      <label className="gl-experience-setting">
        <SettingLabel setting={setting} />
        <input type="url" value={String(value)} placeholder={setting.placeholder} onChange={(event) => { onChange(event.currentTarget.value); }} />
      </label>
    );
  }
  const handleNumber = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = Number(event.currentTarget.value);
    const next = setting.numericScale === 'powerOfTwo' ? 2 ** Math.round(raw) : raw;
    if (Number.isFinite(next)) onChange(next);
  };
  const powerOfTwo = setting.numericScale === 'powerOfTwo';
  const sliderValue = powerOfTwo ? Math.round(Math.log2(Math.max(1, Number(value)))) : Number(value);
  return (
    <label className="gl-experience-setting">
      <SettingLabel setting={setting} />
      <span className="gl-experience-number-control">
        <input
          type="range"
          min={powerOfTwo ? Math.ceil(Math.log2(setting.min)) : setting.min}
          max={powerOfTwo ? Math.floor(Math.log2(setting.max)) : setting.max}
          step={powerOfTwo ? 1 : setting.step}
          value={sliderValue}
          data-numeric-scale={setting.numericScale ?? 'linear'}
          aria-valuetext={powerOfTwo ? formatSettingNumber(Number(value), 1) : undefined}
          onChange={handleNumber}
        />
        <output>{formatSettingNumber(Number(value), setting.step)}</output>
      </span>
    </label>
  );
}

interface StylePickerProps {
  readonly styles: NonNullable<ExperienceDefinition['styleManifest']>['styles'];
  readonly value: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onChange: (styleId: string) => void;
}

function StylePicker({ styles, value, open, onToggle, onChange }: StylePickerProps): JSX.Element {
  const current = styles.find((style) => style.id === value) ?? styles[0];
  const cycle = (): void => {
    const currentIndex = Math.max(0, styles.findIndex((style) => style.id === current?.id));
    const next = styles[(currentIndex + 1) % styles.length];
    if (next) onChange(next.id);
  };
  return (
    <div className="gl-experience-style-picker">
      <button type="button" className="gl-experience-style-trigger" aria-label="Visual style" aria-expanded={open} onClick={onToggle}>
        {current && <PaletteSwatch palette={current.palette} />}
        <span>{current?.name ?? 'Style'}</span><span aria-hidden="true">⌄</span>
      </button>
      <button type="button" className="gl-experience-style-cycle" aria-label="Next style" onClick={cycle}>›</button>
      {open && (
        <div className="gl-experience-style-menu" role="menu" aria-label="Visual styles">
          {styles.map((style) => (
            <button key={style.id} type="button" role="menuitemradio" aria-checked={style.id === value} onClick={() => { onChange(style.id); }}>
              <PaletteSwatch palette={style.palette} /><span>{style.name}</span><span aria-hidden="true">{style.id === value ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaletteSwatch({ palette }: { readonly palette: readonly number[] }): JSX.Element {
  return (
    <span className="gl-experience-palette-swatch" aria-hidden="true">
      {palette.slice(0, 4).map((color) => <i key={color} style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }} />)}
    </span>
  );
}

function SettingLabel({ setting }: { readonly setting: ExperienceSetting }): JSX.Element {
  return (
    <span className="gl-experience-setting-label">
      <strong>{setting.label}</strong>
      {setting.description && <small>{setting.description}</small>}
    </span>
  );
}

function settingDefaults(definition: ExperienceDefinition): Readonly<Record<string, ExperienceSettingValue>> {
  const values: Record<string, ExperienceSettingValue> = {};
  for (const setting of definition.settings ?? []) values[setting.key] = setting.default;
  for (const [key, value] of Object.entries(definition.configDefaults ?? {})) {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') values[key] = value;
  }
  return Object.freeze(values);
}

function formatSettingNumber(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function classNames(...values: readonly (string | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
