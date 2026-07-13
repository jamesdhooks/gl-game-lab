import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Dices, Eye, EyeOff, HelpCircle, Lock, LockOpen, MousePointer2, Paintbrush, Palette, Play, RefreshCw, Settings as SettingsIcon, X } from 'lucide-react';
import {
  ExperienceRuntimeControllerService,
  resolvePreviewLaunch,
  type ExperienceDefinition,
  type ExperienceLaunchOptions,
  type ExperienceLaunchProfile,
  type ExperiencePreviewProfile,
  type ExperienceRuntimeController,
  type ExperienceSetting,
  type ExperienceSettingValue,
  type SelectSetting,
} from '@hooksjam/gl-game-lab-engine';
import type { GameEngine } from '@hooksjam/gl-game-lab-engine';
import { GameCanvas } from './GameCanvas.js';
import type { CanvasFrameCapture, FixedFrameCaptureOptions, FixedFrameCaptureResult, GameCanvasHandle } from './GameCanvas.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { HUD } from './ui/HUD.js';
import { IntroCard, type IntroHint } from './ui/IntroCard.js';
import { ModeToggle } from './ui/ModeToggle.js';
import { OverflowMenu } from './ui/OverflowMenu.js';
import { SettingsDrawer, type SettingsDefaultsSaveRequest } from './ui/SettingsDrawer.js';
import { SimControlPanel } from './ui/SimControlPanel.js';
import { TopbarSelect } from './ui/TopbarSelect.js';
import { ViewportProvider, useViewportContext } from './ViewportProvider.js';

const SETTINGS_OPEN_STORAGE_KEY = 'gl-game-lab:settingsOpen';
const SETTINGS_PINNED_STORAGE_KEY = 'gl-game-lab:settingsPinned';
const DEFAULT_SETTINGS_SIDEBAR_WIDTH = 448;
const MIN_SETTINGS_SIDEBAR_WIDTH = 320;
const MAX_SETTINGS_SIDEBAR_WIDTH = 720;
const MIN_SCENE_STAGE_WIDTH = 360;
const COMPACT_TOPBAR_STAGE_WIDTH = 1360;
export const LOCAL_DEMO_INTERVAL_MS = 10_000;
const FLUID_BASIC_STYLE_ID = 'bounded-cyan';
const FLUID_ENHANCED_STYLE_ID = 'webgl-fluid-glow';
const FLUID_VISUAL_STYLE_MODES = [
  { id: FLUID_BASIC_STYLE_ID, label: 'Basic' },
  { id: FLUID_ENHANCED_STYLE_ID, label: 'Enhanced' },
] as const;
const FLUID_VISUAL_PRESETS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  [FLUID_BASIC_STYLE_ID]: { shadingStrength: 0.42, bloomStrength: 0.22, bloomThreshold: 0.72, sunraysStrength: 0 },
  [FLUID_ENHANCED_STYLE_ID]: { shadingStrength: 1, bloomStrength: 0.8, bloomThreshold: 0.6, sunraysStrength: 1 },
};

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
  readonly onLocalDemoChange?: (active: boolean) => void;
  readonly onSaveDefaults?: (request: SettingsDefaultsSaveRequest) => Promise<void> | void;
  readonly previewAuthoring?: PreviewAuthoringOptions;
}

export interface PreviewAuthoringOptions {
  readonly enabled: boolean;
  readonly profile: ExperiencePreviewProfile;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onProfileChange: (profile: ExperiencePreviewProfile) => void;
  readonly onSave: (profile: ExperiencePreviewProfile) => Promise<void> | void;
  readonly onReset: () => ExperiencePreviewProfile;
  readonly onCapture: (capture: CanvasFrameCapture, profile: ExperiencePreviewProfile, profileHash: string) => Promise<void> | void;
}

export interface RuntimeSelectionState {
  readonly modeId: string;
  readonly styleId: string;
  readonly settings: Readonly<Record<string, ExperienceSettingValue>>;
}

export function resolvePreviewToggleState(
  wasPreviewEnabled: boolean,
  previewEnabled: boolean,
  current: RuntimeSelectionState,
  savedPlay: RuntimeSelectionState,
  preview: RuntimeSelectionState,
): { readonly active: RuntimeSelectionState; readonly savedPlay: RuntimeSelectionState } {
  if (!wasPreviewEnabled && previewEnabled) return Object.freeze({ active: preview, savedPlay: current });
  if (wasPreviewEnabled && !previewEnabled) return Object.freeze({ active: savedPlay, savedPlay });
  return Object.freeze({ active: previewEnabled ? preview : current, savedPlay });
}

export function ExperienceRuntime({
  ...props
}: ExperienceRuntimeProps): JSX.Element {
  if (props.presentation === 'immersive' || props.showChrome !== false) {
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
  onReady,
  onError,
  seed,
  fixedFrameCapture,
  onFixedFrameCapture,
  showDiagnostics = false,
  maxPixels,
}: ExperienceRuntimeProps): JSX.Element {
  const defaultModeId = initialModeId ?? definition.modes?.[0]?.id ?? 'default';
  const defaultStyleId = initialStyleId ?? definition.styleManifest?.defaultStyleId ?? 'default';
  const initialSettings = useMemo(() => settingDefaults(definition), [definition]);
  const createPlugins = useCallback(() => definition.createPlugins({
    profile,
    modeId: defaultModeId,
    styleId: defaultStyleId,
    settings: initialSettings,
    ...(seed !== undefined ? { seed } : {}),
  }), [defaultModeId, defaultStyleId, definition, initialSettings, profile, seed]);
  const handleReady = useCallback((engine: GameEngine): void => {
    onReady?.(engine, engine.kernel.tryGet(ExperienceRuntimeControllerService));
  }, [onReady]);

  return (
    <section
      className={classNames('relative h-full w-full overflow-hidden', className)}
      data-experience-id={definition.id}
      data-experience-profile={profile}
    >
      <GameCanvas
        createPlugins={createPlugins}
        ariaLabel={`${definition.name} game canvas`}
        onReady={handleReady}
        showDiagnostics={showDiagnostics}
        {...(maxPixels === undefined ? {} : { maxPixels })}
        {...(fixedFrameCapture ? { fixedFrameCapture } : {})}
        {...(onFixedFrameCapture ? { onFixedFrameCapture } : {})}
        className={canvasClassName ?? 'h-full w-full touch-none'}
        {...(onError ? { onError } : {})}
      />
    </section>
  );
}
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
  onLocalDemoChange,
  onSaveDefaults,
  previewAuthoring,
}: ExperienceRuntimeProps): JSX.Element {
  const { isMobile, isLandscape } = useViewportContext();
  const mobilePortrait = isMobile && !isLandscape;
  const previewEnabled = previewAuthoring?.enabled === true;
  const sceneSettings = useMemo(() => settingDefaults(definition), [definition]);
  const playDefaultModeId = initialModeId ?? definition.modes?.[0]?.id ?? 'default';
  const playDefaultStyleId = initialStyleId ?? definition.styleManifest?.defaultStyleId ?? 'default';
  const defaultModeId = previewEnabled ? previewAuthoring.profile.modeId ?? definition.modes?.[0]?.id ?? 'default' : playDefaultModeId;
  const defaultStyleId = previewEnabled ? previewAuthoring.profile.styleId ?? definition.styleManifest?.defaultStyleId ?? 'default' : playDefaultStyleId;
  const initialSettings = previewEnabled ? previewAuthoring.profile.settings : sceneSettings;
  const [modeId, setModeId] = useState(defaultModeId);
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [settings, setSettings] = useState<Readonly<Record<string, ExperienceSettingValue>>>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(() => readStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, false));
  const [settingsPinned, setSettingsPinned] = useState(() => readStoredBoolean(SETTINGS_PINNED_STORAGE_KEY, false));
  const [settingsSidebarWidth, setSettingsSidebarWidth] = useState(DEFAULT_SETTINGS_SIDEBAR_WIDTH);
  const [isCompactTopbar, setIsCompactTopbar] = useState(false);
  const [infoCardVisible, setInfoCardVisible] = useState(showIntroCard);
  const [uiHidden, setUiHidden] = useState(false);
  const [isDemo, setIsDemo] = useState(profile === 'demo');
  const [demoHintVisible, setDemoHintVisible] = useState(profile === 'demo');
  const [activeProfile, setActiveProfile] = useState<ExperienceLaunchProfile>(profile);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [localMaxPixels, setLocalMaxPixels] = useState(maxPixels);
  const [imageUrlEditorOpen, setImageUrlEditorOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const controllerRef = useRef<ExperienceRuntimeController>();
  const engineRef = useRef<GameEngine>();
  const [engineInstance, setEngineInstance] = useState<GameEngine>();
  const sceneStageRef = useRef<HTMLDivElement>(null);
  const gameCanvasRef = useRef<GameCanvasHandle>(null);
  const onReadyRef = useRef(onReady);
  const demoHintTimerRef = useRef<number>();
  const localDemoInitialShuffleRef = useRef(false);
  const [localDemoAdvanceNonce, setLocalDemoAdvanceNonce] = useState(0);
  const [capturePending, setCapturePending] = useState(false);
  const wasPreviewEnabledRef = useRef(previewEnabled);
  const playStateRef = useRef<RuntimeSelectionState>({ modeId: playDefaultModeId, styleId: playDefaultStyleId, settings: sceneSettings });
  const playStateExperienceIdRef = useRef(definition.id);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (playStateExperienceIdRef.current !== definition.id) {
      playStateExperienceIdRef.current = definition.id;
      playStateRef.current = { modeId: playDefaultModeId, styleId: playDefaultStyleId, settings: sceneSettings };
      wasPreviewEnabledRef.current = previewEnabled;
    }
    const transition = resolvePreviewToggleState(
      wasPreviewEnabledRef.current,
      previewEnabled,
      { modeId, styleId, settings },
      playStateRef.current,
      { modeId: defaultModeId, styleId: defaultStyleId, settings: initialSettings },
    );
    playStateRef.current = transition.savedPlay;
    wasPreviewEnabledRef.current = previewEnabled;
    controllerRef.current = undefined;
    engineRef.current = undefined;
    setEngineInstance(undefined);
    setModeId(transition.active.modeId);
    setStyleId(transition.active.styleId);
    setSettings(transition.active.settings);
    setSettingsOpen(readStoredBoolean(SETTINGS_OPEN_STORAGE_KEY, false));
    setInfoCardVisible(showIntroCard && profile !== 'demo' && !previewEnabled);
    setUiHidden(profile === 'demo');
    setIsDemo(profile === 'demo');
    localDemoInitialShuffleRef.current = false;
    setActiveProfile(previewEnabled ? 'preview' : profile);
    setImageUrlEditorOpen(false);
    setImageUrlDraft('');
    setCapturePending(false);
    setRuntimeKey((value) => value + 1);
  }, [definition.id, previewEnabled, profile, showIntroCard]);

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

  const previewDraft = useMemo<ExperiencePreviewProfile | undefined>(() => previewAuthoring ? ({
    ...previewAuthoring.profile,
    modeId,
    styleId,
    settings,
  }) : undefined, [modeId, previewAuthoring, settings, styleId]);
  const resolvedPreview = useMemo(
    () => previewEnabled ? resolvePreviewLaunch(definition, previewDraft, 0) : undefined,
    [definition, previewDraft, previewEnabled],
  );
  const launchOptionsRef = useRef<ExperienceLaunchOptions>({
    profile: activeProfile,
    modeId: defaultModeId,
    styleId: defaultStyleId,
    settings: initialSettings,
    ...(seed !== undefined ? { seed } : {}),
  });
  launchOptionsRef.current = resolvedPreview ?? {
    profile: activeProfile,
    modeId: defaultModeId,
    styleId: defaultStyleId,
    settings: initialSettings,
    ...(seed !== undefined ? { seed } : {}),
  };
  const createPlugins = useCallback(() => definition.createPlugins(launchOptionsRef.current), [definition]);

  useEffect(() => {
    if (!previewEnabled || !previewDraft || !previewAuthoring) return;
    previewAuthoring.onProfileChange(previewDraft);
  }, [definition.id, modeId, previewEnabled, settings, styleId]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!previewEnabled || !resolvedPreview || !controller) return;
    if (resolvedPreview.modeId) controller.setMode(resolvedPreview.modeId);
    if (resolvedPreview.styleId) controller.setStyle(resolvedPreview.styleId);
    for (const [key, value] of Object.entries(resolvedPreview.settings)) controller.setSetting(key, value);
  }, [previewEnabled, resolvedPreview?.hash]);

  const handleReady = useCallback((engine: GameEngine): void => {
    engineRef.current = engine;
    setEngineInstance(engine);
    const controller = engine.kernel.tryGet(ExperienceRuntimeControllerService);
    controllerRef.current = controller;
    if (previewEnabled && resolvedPreview && controller) {
      if (resolvedPreview.modeId) controller.setMode(resolvedPreview.modeId);
      if (resolvedPreview.styleId) controller.setStyle(resolvedPreview.styleId);
      for (const [key, value] of Object.entries(resolvedPreview.settings)) controller.setSetting(key, value);
    }
    onReadyRef.current?.(engine, controller);
  }, [previewEnabled, resolvedPreview]);

  const changeMode = useCallback((nextModeId: string): void => {
    if (!previewEnabled) controllerRef.current?.setMode(nextModeId);
    setModeId(nextModeId);
  }, [previewEnabled]);
  const changeStyle = useCallback((nextStyleId: string): void => {
    if (!previewEnabled) controllerRef.current?.setStyle(nextStyleId);
    setStyleId(nextStyleId);
  }, [previewEnabled]);
  const changeSetting = useCallback((setting: ExperienceSetting, value: ExperienceSettingValue): void => {
    if (!previewEnabled) controllerRef.current?.setSetting(setting.key, value);
    setSettings((current) => ({ ...current, [setting.key]: value }));
  }, [previewEnabled]);
  const settingsStore = useMemo(() => ({
    get: (key: string): unknown => settings[key],
    set: (key: string, value: ExperienceSettingValue): void => {
      const field = (definition.settings ?? []).find((setting) => setting.key === key);
      if (field) changeSetting(field, value);
    },
    reset: (keys: readonly string[]): void => {
      for (const key of keys) {
        const field = (definition.settings ?? []).find((setting) => setting.key === key);
        const resetValue = previewEnabled ? previewAuthoring?.profile.settings[key] : initialSettings[key];
        if (field) changeSetting(field, resetValue ?? field.default);
      }
    },
  }), [changeSetting, definition.settings, initialSettings, previewAuthoring?.profile.settings, previewEnabled, settings]);
  const renderStyleField = useMemo<SelectSetting | undefined>(
    () => (definition.settings ?? []).find(
      (setting): setting is SelectSetting => setting.key === 'renderStyle' && setting.type === 'select',
    ),
    [definition.settings],
  );
  const renderStyleId = String(settings.renderStyle ?? renderStyleField?.default ?? '');
  const renderStyleModes = useMemo(
    () => renderStyleField?.options.map((option) => ({ id: option.value, label: option.label })) ?? [],
    [renderStyleField],
  );
  const hasRenderStylePicker = renderStyleModes.length > 1;
  const saveDefaults = useCallback(async (request: SettingsDefaultsSaveRequest): Promise<void> => {
    if (previewEnabled && previewAuthoring && previewDraft) {
      await previewAuthoring.onSave(previewDraft);
      return;
    }
    const values: Record<string, unknown> = { ...request.values };
    if (request.section === null) {
      values.style = styleId;
      if (renderStyleField) values.renderStyle = settings.renderStyle ?? renderStyleField.default;
    }
    const enrichedRequest = { ...request, values };
    if (onSaveDefaults) {
      await onSaveDefaults(enrichedRequest);
      return;
    }
    const key = `gl-game-lab:scene-defaults:${definition.id}`;
    let current: Record<string, unknown> = {};
    try {
      const stored = localStorage.getItem(key);
      if (stored) current = JSON.parse(stored) as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...current, ...values }));
    } catch {
      throw new Error('Unable to save scene defaults');
    }
  }, [definition.id, onSaveDefaults, previewAuthoring, previewDraft, previewEnabled, renderStyleField, settings.renderStyle, styleId]);
  const injectPaletteField = useMemo<SelectSetting | undefined>(
    () => definition.id === 'fluid-tank'
      ? (definition.settings ?? []).find(
        (setting): setting is SelectSetting => setting.key === 'injectPalette' && setting.type === 'select',
      )
      : undefined,
    [definition.id, definition.settings],
  );
  const visibleSettings = useMemo(() => (definition.settings ?? []).filter((setting) => (
    setting.key !== 'renderStyle'
    && !(definition.id === 'fluid-tank' && setting.key === 'injectPalette')
    && (!setting.visibleModes || setting.visibleModes.includes(modeId))
    && (!setting.visibleRenderStyles || setting.visibleRenderStyles.includes(renderStyleId))
  )), [definition.id, definition.settings, modeId, renderStyleId]);
  const hasModes = (definition.modes?.length ?? 0) > 1;
  const styleOptions = useMemo(() => (definition.styleManifest?.styles ?? []).map((style) => ({ id: style.id, label: style.name, chipColors: [...style.palette] })), [definition.styleManifest]);

  const changeRenderStyle = useCallback((nextRenderStyle: string): void => {
    if (renderStyleField) changeSetting(renderStyleField, nextRenderStyle);
  }, [changeSetting, renderStyleField]);
  const changeFluidVisualStyle = useCallback((nextStyleId: string): void => {
    changeStyle(nextStyleId);
    const preset = FLUID_VISUAL_PRESETS[nextStyleId];
    if (!preset) return;
    for (const [key, value] of Object.entries(preset)) {
      const field = (definition.settings ?? []).find((setting) => setting.key === key);
      if (field) changeSetting(field, value);
    }
    controllerRef.current?.reset();
  }, [changeSetting, changeStyle, definition.settings]);
  const paletteControl = definition.styleManifest ? (
    <TopbarSelect label="Palette" options={styleOptions} value={styleId} onChange={changeStyle} hideLabel icon={Palette} />
  ) : null;
  const fluidVisualStyleControl = definition.id === 'fluid-tank' ? (
    isCompactTopbar && !mobilePortrait ? (
      <TopbarSelect label="Style" options={FLUID_VISUAL_STYLE_MODES} value={styleId === FLUID_ENHANCED_STYLE_ID ? FLUID_ENHANCED_STYLE_ID : FLUID_BASIC_STYLE_ID} onChange={changeFluidVisualStyle} hideLabel icon={Paintbrush} />
    ) : (
      <ModeToggle modes={FLUID_VISUAL_STYLE_MODES} value={styleId === FLUID_ENHANCED_STYLE_ID ? FLUID_ENHANCED_STYLE_ID : FLUID_BASIC_STYLE_ID} onChange={changeFluidVisualStyle} />
    )
  ) : null;
  const renderStyleControl = hasRenderStylePicker ? (
    definition.id === 'fluid-tank' ? (
      <TopbarSelect label="Texture" options={renderStyleModes} value={renderStyleId} onChange={changeRenderStyle} />
    ) : isCompactTopbar && !mobilePortrait ? (
      <TopbarSelect label="Style" options={renderStyleModes} value={renderStyleId} onChange={changeRenderStyle} hideLabel icon={Paintbrush} />
    ) : (
      <ModeToggle modes={renderStyleModes} value={renderStyleId} onChange={changeRenderStyle} />
    )
  ) : null;
  const inputModeControl = hasModes ? (
    isCompactTopbar && !mobilePortrait ? (
      <TopbarSelect label="Input" options={definition.modes ?? []} value={modeId} onChange={changeMode} hideLabel icon={MousePointer2} />
    ) : (
      <ModeToggle modes={definition.modes ?? []} value={modeId} onChange={changeMode} />
    )
  ) : null;
  const injectPaletteId = String(settings.injectPalette ?? injectPaletteField?.default ?? 'style');
  const injectPaletteControl = injectPaletteField ? (
    <TopbarSelect
      label="Inject"
      value={injectPaletteId}
      options={injectPaletteField.options.map((option) => ({
        id: option.value,
        label: option.label,
        chipStyle: fluidInjectChipStyle(option.value),
      }))}
      onChange={(value) => { changeSetting(injectPaletteField, value); }}
    />
  ) : null;
  const imageUrlField = (definition.settings ?? []).find((setting) => setting.key === 'initImageUrl' && setting.type === 'string');
  const imageUrlValue = String(settings.initImageUrl ?? '');
  const imageSourceButton = definition.id === 'fluid-tank' && renderStyleId === 'image' && imageUrlField ? (
    <button
      type="button"
      onClick={() => { setImageUrlDraft(imageUrlValue); setImageUrlEditorOpen(true); }}
      className={`flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${imageUrlValue.trim() ? 'bg-emerald-300/18 text-emerald-50 hover:bg-emerald-300/26' : 'bg-white/10 text-white/55 hover:bg-white/16 hover:text-white/85'}`}
      aria-label="Set fluid image URL"
      title={imageUrlValue.trim() ? 'Image URL set' : 'Using random public image'}
    >
      <span>Image URL</span>
      <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[9px]">{imageUrlValue.trim() ? 'Set' : 'Random'}</span>
    </button>
  ) : null;

  const introHints = useMemo(() => {
    const hints: IntroHint[] = (definition.modes ?? [])
      .slice(0, 3)
      .filter((mode) => Boolean(mode.description))
      .map((mode) => ({ label: mode.label, action: mode.description ?? definition.short }));
    return hints;
  }, [definition.modes, definition.short]);

  const controlsHeaderSlot = mobilePortrait && (definition.styleManifest || hasRenderStylePicker || hasModes) ? (
    <>
      {fluidVisualStyleControl}
      {paletteControl}
      {renderStyleControl}
      {imageSourceButton}
      {injectPaletteControl}
      {inputModeControl}
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
    setInfoCardVisible(true);
  };
  const randomizeScene = useCallback((): void => {
    for (const setting of definition.settings ?? []) {
      if (setting.type === 'number') {
        const spread = Math.max(setting.step, Math.abs(setting.default) * 0.35);
        const next = Math.max(setting.min, Math.min(setting.max, setting.default + (Math.random() * 2 - 1) * spread));
        const snapped = setting.numericScale === 'powerOfTwo'
          ? 2 ** Math.round(Math.log2(Math.max(1, next)))
          : Math.round(next / setting.step) * setting.step;
        changeSetting(setting, Math.max(setting.min, Math.min(setting.max, snapped)));
      } else if (setting.type === 'select' && setting.options.length > 1) {
        const option = setting.options[Math.floor(Math.random() * setting.options.length)];
        if (option) changeSetting(setting, option.value);
      } else if (setting.type === 'boolean') {
        changeSetting(setting, Math.random() >= 0.5);
      }
    }
    const styles = definition.styleManifest?.styles.filter((style) => style.id !== '__random__') ?? [];
    const style = styles[Math.floor(Math.random() * styles.length)];
    if (style) changeStyle(style.id);
    controllerRef.current?.reset();
  }, [changeSetting, changeStyle, definition.settings, definition.styleManifest?.styles]);
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
    localDemoInitialShuffleRef.current = profile !== 'demo';
    controllerRef.current = undefined;
    engineRef.current = undefined;
    setEngineInstance(undefined);
    setActiveProfile('demo');
    setRuntimeKey((value) => value + 1);
    if (profile !== 'demo') onLocalDemoChange?.(true);
    showDemoHint();
  };
  const exitDemo = (): void => {
    localDemoInitialShuffleRef.current = false;
    setIsDemo(false);
    setUiHidden(false);
    setActiveProfile(profile);
    setRuntimeKey((value) => value + 1);
    if (profile !== 'demo') onLocalDemoChange?.(false);
  };
  const advanceLocalDemo = useCallback((): void => {
    localDemoInitialShuffleRef.current = false;
    randomizeScene();
    setLocalDemoAdvanceNonce((value) => value + 1);
  }, [randomizeScene]);
  const advanceDemo = (): void => {
    showDemoHint();
    if (profile === 'demo' && onDemoAdvance) {
      onDemoAdvance();
      return;
    }
    advanceLocalDemo();
  };
  const leaveDemo = (): void => {
    if (profile === 'demo' && onDemoExit) {
      onDemoExit();
      return;
    }
    exitDemo();
  };

  useEffect(() => {
    if (!isDemo || profile === 'demo' || !engineInstance) return;
    const delay = localDemoInitialShuffleRef.current ? 0 : LOCAL_DEMO_INTERVAL_MS;
    const timer = window.setTimeout(() => { advanceLocalDemo(); }, delay);
    return () => { window.clearTimeout(timer); };
  }, [advanceLocalDemo, engineInstance, isDemo, localDemoAdvanceNonce, profile]);
  const updatePreviewProfile = useCallback((next: ExperiencePreviewProfile): void => {
    previewAuthoring?.onProfileChange(next);
  }, [previewAuthoring]);
  const changePreviewIntensity = useCallback((intensity: number): void => {
    if (!previewDraft) return;
    updatePreviewProfile({ ...previewDraft, variation: { ...previewDraft.variation, intensity } });
  }, [previewDraft, updatePreviewProfile]);
  const togglePreviewLock = useCallback((key: string, locked: boolean): void => {
    if (!previewDraft) return;
    const keys = new Set(previewDraft.variation.lockedKeys);
    if (locked) keys.add(key); else keys.delete(key);
    updatePreviewProfile({ ...previewDraft, variation: { ...previewDraft.variation, lockedKeys: [...keys].sort() } });
  }, [previewDraft, updatePreviewProfile]);
  const shufflePreview = useCallback((): void => {
    if (!previewDraft) return;
    controllerRef.current = undefined;
    engineRef.current = undefined;
    setEngineInstance(undefined);
    updatePreviewProfile({ ...previewDraft, variation: { ...previewDraft.variation, seed: randomPreviewSeed() } });
    setRuntimeKey((value) => value + 1);
  }, [previewDraft, updatePreviewProfile]);
  const resetPreview = useCallback((): void => {
    if (!previewAuthoring) return;
    const saved = previewAuthoring.onReset();
    setModeId(saved.modeId ?? definition.modes?.[0]?.id ?? 'default');
    setStyleId(saved.styleId ?? definition.styleManifest?.defaultStyleId ?? 'default');
    setSettings(saved.settings);
    updatePreviewProfile(saved);
  }, [definition.modes, definition.styleManifest?.defaultStyleId, previewAuthoring, updatePreviewProfile]);
  const capturePreview = useCallback(async (): Promise<void> => {
    if (!previewDraft || !resolvedPreview || !previewAuthoring || capturePending) return;
    const canvas = gameCanvasRef.current;
    if (!canvas) return;
    setCapturePending(true);
    try {
      const capture = await canvas.captureFrame();
      await previewAuthoring.onCapture(capture, previewDraft, resolvedPreview.hash);
    } finally {
      setCapturePending(false);
    }
  }, [capturePending, previewAuthoring, previewDraft, resolvedPreview]);
  const previewHeaderControl = previewAuthoring ? (
    <div className="inline-flex rounded-lg bg-white/[0.07] p-0.5">
      {(['scene', 'preview'] as const).map((value) => {
        const selected = value === 'preview' ? previewEnabled : !previewEnabled;
        return <button key={value} type="button" onClick={() => previewAuthoring.onEnabledChange(value === 'preview')} className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${selected ? 'bg-cyan-200 text-slate-950' : 'text-white/40 hover:text-white/70'}`}>{value}</button>;
      })}
    </div>
  ) : undefined;
  const previewSections = previewEnabled && previewDraft && resolvedPreview ? (
    <>
      <section className="rounded-lg bg-white/[0.035] px-2 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Preview variation</p>
          <button type="button" onClick={shufflePreview} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/12 hover:text-white"><RefreshCw size={10} />New variation</button>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="Preview variation intensity" type="range" min={0} max={1} step={0.01} value={previewDraft.variation.intensity} onChange={(event) => changePreviewIntensity(Number(event.target.value))} className="h-1.5 min-w-0 flex-1 accent-cyan-200" />
          <span className="w-9 text-right text-[10px] tabular-nums text-white/55">{Math.round(previewDraft.variation.intensity * 100)}%</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <PreviewLockButton label="Mode" locked={previewDraft.variation.lockedKeys.includes('$mode')} onChange={(locked) => togglePreviewLock('$mode', locked)} />
          <PreviewLockButton label="Palette" locked={previewDraft.variation.lockedKeys.includes('$style')} onChange={(locked) => togglePreviewLock('$style', locked)} />
        </div>
        <p className="mt-2 text-[9px] leading-snug text-white/30">Settings stay anchored to your saved values. Unlocked controls receive bounded seeded variation.</p>
      </section>
      <section className="rounded-lg bg-white/[0.015] px-2 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Preview image</p>
            <p className={`mt-0.5 text-[9px] ${previewDraft.image && previewDraft.image.profileHash !== resolvedPreview.hash ? 'text-amber-200/80' : 'text-white/30'}`}>{previewDraft.image ? previewDraft.image.profileHash === resolvedPreview.hash ? `${previewDraft.image.width}×${previewDraft.image.height} capture` : 'Capture is out of date' : 'No fallback captured'}</p>
          </div>
          <button type="button" disabled={capturePending} onClick={() => { void capturePreview(); }} className="inline-flex items-center gap-1 rounded-lg bg-cyan-200 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-950 hover:bg-cyan-100 disabled:opacity-45"><Camera size={11} />{capturePending ? 'Capturing' : 'Capture'}</button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(['auto', 'live', 'static'] as const).map((policy) => <button key={policy} type="button" onClick={() => updatePreviewProfile({ ...previewDraft, renderPolicy: policy })} className={`rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider ${previewDraft.renderPolicy === policy ? 'bg-white/16 text-white' : 'bg-white/[0.05] text-white/35 hover:bg-white/10 hover:text-white/65'}`}>{policy}</button>)}
        </div>
      </section>
    </>
  ) : undefined;
  const settingsDocked = settingsOpen && settingsPinned && !mobilePortrait && !uiHidden && !isDemo;

  return (
    <section
      className={classNames('gl-game-lab-runtime-shell fixed left-0 top-0 z-50 flex h-full w-full overflow-hidden bg-black', className)}
      data-experience-id={definition.id}
      data-experience-profile={activeProfile}
    >
      <div ref={sceneStageRef} className="relative h-full min-w-0 flex-1 overflow-hidden">
        <div className={previewEnabled ? 'flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,#141425_0%,#050509_70%)] p-12' : 'h-full w-full'}>
          <div className={previewEnabled ? 'relative aspect-square h-[min(82vh,82vw)] max-h-full max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/15' : 'h-full w-full'}>
            <GameCanvas
              ref={gameCanvasRef}
              key={runtimeKey}
              createPlugins={createPlugins}
              ariaLabel={`${definition.name} game canvas`}
              onReady={handleReady}
              showDiagnostics={showDiagnostics}
              {...(fixedFrameCapture ? { fixedFrameCapture } : {})}
              {...(onFixedFrameCapture ? { onFixedFrameCapture } : {})}
              {...(canvasClassName ? { className: canvasClassName } : { className: 'h-full w-full touch-none' })}
              {...(onError ? { onError } : {})}
              {...(previewEnabled ? { logicalViewport: { width: 384, height: 384 }, maxPixels: 262_144, maxFps: 30 } : localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
            />
            {previewEnabled && <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,.28)]" />}
          </div>
        </div>

      {showChrome && !isDemo && (
        <div className={uiHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}>
          <AnimatePresence>
            {infoCardVisible && !previewEnabled && (
              <IntroCard
                key={`${definition.id}:${runtimeKey}`}
                icon={definition.icon}
                name={definition.name}
                short={definition.short}
                hints={introHints}
                attributions={definition.attributions ? [...definition.attributions] : []}
                onDismiss={() => { setInfoCardVisible(false); }}
              />
            )}
          </AnimatePresence>

          <HUD
            {...(onQuit ? { onQuit } : {})}
            controls={!mobilePortrait && (definition.styleManifest || hasRenderStylePicker || hasModes) ? (
              <div className="flex items-center gap-1.5">
                {fluidVisualStyleControl}
                {paletteControl}
                {renderStyleControl}
                {imageSourceButton}
                {injectPaletteControl}
                {inputModeControl}
              </div>
            ) : undefined}
          />

          <div className="absolute bottom-3 right-3 z-40">
            <DebugPanel engine={engineInstance} />
          </div>

          <OverflowMenu compact={isCompactTopbar} items={[
            {
              key: 'reset', label: 'Reset', hidden: !definition.capabilities.reset,
              node: <button type="button" className="flex h-8 items-center rounded-xl bg-black/30 px-3 text-xs font-semibold text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" onClick={() => { controllerRef.current?.reset(); }}>Reset</button>,
            },
            {
              key: 'settings', label: 'Settings', closeOnActivate: true,
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={openSettings} aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"><SettingsIcon size={15} /></motion.button>,
            },
            {
              key: 'randomize', label: 'Randomize', hidden: previewEnabled || definition.kind !== 'simulation',
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={randomizeScene} aria-label="Randomize settings" title="Randomize settings" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/70 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"><Dices size={15} /></motion.button>,
            },
            {
              key: 'hide-ui', label: 'Hide UI',
              node: <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => { setUiHidden(true); }} aria-label="Hide UI" className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/40 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white/70"><EyeOff size={14} /></motion.button>,
            },
            {
              key: 'demo', label: 'Demo mode', hidden: previewEnabled || !definition.capabilities.demo,
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
              settings={settingsStore}
              fields={visibleSettings}
              {...(localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
              onMaxPixelsChange={setLocalMaxPixels}
              onSaveDefaults={saveDefaults}
              title={previewEnabled ? 'Preview settings' : 'Settings'}
              saveLabel={previewEnabled ? 'preview profile' : 'scene defaults'}
              headerControl={previewHeaderControl}
              supplementalSections={previewSections}
              lockedKeys={previewEnabled && previewDraft ? previewDraft.variation.lockedKeys : []}
              {...(previewEnabled ? { onFieldLockChange: togglePreviewLock } : {})}
              {...(previewEnabled ? { onResetAll: resetPreview } : {})}
              ariaLabel={`${definition.name} settings`}
              pinned={settingsPinned && !mobilePortrait}
              onPinnedChange={changeSettingsPinned}
            />
          )}

          <AnimatePresence>
            {imageUrlEditorOpen && imageUrlField && (
              <motion.div
                className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/72 p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onMouseDown={(event) => { if (event.target === event.currentTarget) setImageUrlEditorOpen(false); }}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Fluid image URL"
                  className="w-full max-w-xl rounded-2xl bg-zinc-950 p-4 shadow-2xl ring-1 ring-white/15"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">Fluid image URL</h4>
                      <p className="mt-1 text-xs text-white/45">Paste a direct image URL. Leave blank to use a random public image.</p>
                    </div>
                    <button type="button" onClick={() => setImageUrlEditorOpen(false)} className="rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close URL editor"><X size={16} /></button>
                  </div>
                  <textarea
                    autoFocus
                    value={imageUrlDraft}
                    onChange={(event) => setImageUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        changeSetting(imageUrlField, imageUrlDraft.trim());
                        controllerRef.current?.reset();
                        setImageUrlEditorOpen(false);
                      }
                      if (event.key === 'Escape') setImageUrlEditorOpen(false);
                    }}
                    placeholder="https://example.com/image.png"
                    className="min-h-28 w-full resize-y rounded-xl bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/15 placeholder:text-white/30 focus:outline-none focus:ring-cyan-200/50"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setImageUrlDraft('')} className="rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white">Clear</button>
                    <button type="button" onClick={() => setImageUrlEditorOpen(false)} className="rounded-xl px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white">Cancel</button>
                    <button type="button" onClick={() => { changeSetting(imageUrlField, imageUrlDraft.trim()); controllerRef.current?.reset(); setImageUrlEditorOpen(false); }} className="rounded-xl bg-cyan-200 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-100">Apply URL</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {controlsHeaderSlot && (
            <SimControlPanel values={settings} fields={[]} onChange={changeSetting} headerSlot={controlsHeaderSlot} />
          )}
        </div>
      )}

      {showChrome && isDemo && (
        <>
          <button type="button" className="absolute inset-0 z-10 cursor-pointer" aria-label="Advance demo" onPointerMove={showDemoHint} onClick={advanceDemo} />
          <AnimatePresence>
            {demoHintVisible && (
              <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute right-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-xl bg-black/30 text-white/60 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white" aria-label="Exit demo" onClick={(event) => { event.stopPropagation(); leaveDemo(); }}><X size={14} /></motion.button>
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
            settings={settingsStore}
            fields={visibleSettings}
            {...(localMaxPixels === undefined ? {} : { maxPixels: localMaxPixels })}
            onMaxPixelsChange={setLocalMaxPixels}
            onSaveDefaults={saveDefaults}
            title={previewEnabled ? 'Preview settings' : 'Settings'}
            saveLabel={previewEnabled ? 'preview profile' : 'scene defaults'}
            headerControl={previewHeaderControl}
            supplementalSections={previewSections}
            lockedKeys={previewEnabled && previewDraft ? previewDraft.variation.lockedKeys : []}
            {...(previewEnabled ? { onFieldLockChange: togglePreviewLock } : {})}
            {...(previewEnabled ? { onResetAll: resetPreview } : {})}
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

function PreviewLockButton({ label, locked, onChange }: { readonly label: string; readonly locked: boolean; readonly onChange: (locked: boolean) => void }): JSX.Element {
  return (
    <button type="button" aria-pressed={locked} onClick={() => onChange(!locked)} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${locked ? 'bg-cyan-200/16 text-cyan-100' : 'bg-white/[0.06] text-white/40 hover:text-white/70'}`}>
      {locked ? <Lock size={9} /> : <LockOpen size={9} />}{label}
    </button>
  );
}

function randomPreviewSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now() >>> 0;
  return Date.now() >>> 0;
}

function fluidInjectChipStyle(value: string): CSSProperties {
  if (value === 'cyan') return { background: 'rgb(26, 255, 233)' };
  if (value === 'magenta') return { background: 'rgb(255, 31, 223)' };
  if (value === 'amber') return { background: 'rgb(255, 157, 21)' };
  if (value === 'green') return { background: 'rgb(31, 255, 59)' };
  if (value === 'blue') return { background: 'rgb(41, 92, 255)' };
  if (value === 'red') return { background: 'rgb(255, 51, 51)' };
  if (value === 'white') return { background: 'rgb(255, 255, 255)' };
  if (value === 'rainbow') return { background: 'linear-gradient(90deg, #ff3157, #ffd43b, #36ff74, #3da5ff, #c35cff)' };
  return { background: 'linear-gradient(135deg, #22d3ee, #8b5cf6, #f472b6)' };
}

function settingDefaults(definition: ExperienceDefinition): Readonly<Record<string, ExperienceSettingValue>> {
  const values: Record<string, ExperienceSettingValue> = {};
  for (const setting of definition.settings ?? []) values[setting.key] = setting.default;
  for (const [key, value] of Object.entries(definition.configDefaults ?? {})) {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') values[key] = value;
  }
  try {
    const stored = localStorage.getItem(`gl-game-lab:scene-defaults:${definition.id}`);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      for (const setting of definition.settings ?? []) {
        const value = parsed[setting.key];
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') values[setting.key] = value;
      }
    }
  } catch {
    // Storage can be unavailable in private or sandboxed contexts.
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
