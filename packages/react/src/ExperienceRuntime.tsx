import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
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
}

export function ExperienceRuntime({
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
  const controllerRef = useRef<ExperienceRuntimeController>();

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
    onReady?.(engine, controller);
  }, [onReady]);

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
    (showAdvanced || setting.advanced !== true)
    && (!setting.visibleModes || setting.visibleModes.includes(modeId))
    && (!setting.visibleRenderStyles || setting.visibleRenderStyles.includes(String(settings.renderStyle ?? '')))
  ));
  const tutorialPages = definition.tutorialPages ?? [];
  const tutorialPage = tutorialPages[tutorialIndex];

  return (
    <section
      className={classNames('gl-experience-runtime', className)}
      data-experience-id={definition.id}
      data-experience-profile={profile}
    >
      {showChrome && (
        <header className="gl-experience-toolbar" aria-label={`${definition.name} controls`}>
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
              <label className="gl-experience-style-label">
                <span>Style</span>
                <select
                  aria-label="Visual style"
                  value={styleId}
                  onChange={(event) => { changeStyle(event.currentTarget.value); }}
                >
                  {definition.styleManifest?.styles.map((style) => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </select>
              </label>
            )}
            {definition.capabilities.settings && (
              <button type="button" aria-pressed={settingsOpen} onClick={() => { setSettingsOpen((open) => !open); }}>
                Settings
              </button>
            )}
            {definition.capabilities.tutorial && tutorialPages.length > 0 && (
              <button type="button" onClick={() => { setTutorialIndex(0); setTutorialOpen(true); }}>
                How to play
              </button>
            )}
            {definition.capabilities.reset && <button type="button" onClick={reset}>Reset</button>}
          </div>
        </header>
      )}

      <div className="gl-experience-stage">
        <GameCanvas
          createPlugins={createPlugins}
          ariaLabel={`${definition.name} game canvas`}
          onReady={handleReady}
          {...(fixedFrameCapture ? { fixedFrameCapture } : {})}
          {...(onFixedFrameCapture ? { onFixedFrameCapture } : {})}
          {...(canvasClassName ? { className: canvasClassName } : {})}
          {...(onError ? { onError } : {})}
        />
      </div>

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
          {(definition.settings?.some((setting) => setting.advanced) ?? false) && (
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

interface SettingControlProps {
  readonly setting: ExperienceSetting;
  readonly value: ExperienceSettingValue;
  readonly onChange: (value: ExperienceSettingValue) => void;
}

function SettingControl({ setting, value, onChange }: SettingControlProps): JSX.Element {
  if (setting.type === 'boolean') {
    return (
      <label className="gl-experience-setting gl-experience-setting-boolean">
        <span>{setting.label}</span>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => { onChange(event.currentTarget.checked); }}
        />
      </label>
    );
  }
  if (setting.type === 'select') {
    return (
      <label className="gl-experience-setting">
        <span>{setting.label}</span>
        <select value={String(value)} onChange={(event) => { onChange(event.currentTarget.value); }}>
          {setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (setting.type === 'string') {
    return (
      <label className="gl-experience-setting">
        <span>{setting.label}</span>
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
      <span>{setting.label}</span>
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
