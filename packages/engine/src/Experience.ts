import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';

export type ExperienceKind = 'game' | 'simulation' | 'ambient' | 'effect' | 'toy';

export interface ExperienceMode {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly description?: string;
}

export interface ExperienceCapabilities {
  readonly interactive?: boolean;
  readonly reset?: boolean;
  readonly demo?: boolean;
  readonly tutorial?: boolean;
  readonly settings?: boolean;
  readonly score?: boolean;
  readonly audio?: boolean;
  readonly accessibility?: boolean;
  readonly aiAutoplay?: boolean;
  readonly screensaver?: boolean;
  readonly qualityModes?: readonly string[];
}

interface SettingBase {
  readonly key: string;
  readonly label: string;
  readonly section?: string;
  readonly advanced?: boolean;
  readonly description?: string;
  readonly visibleModes?: readonly string[];
  readonly visibleRenderStyles?: readonly string[];
  /** Controls whether an unlocked preview value varies occasionally or on every seeded launch. */
  readonly previewVariation?: 'bounded' | 'always';
}

export interface NumberSetting extends SettingBase {
  readonly type: 'number';
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly numericScale?: 'linear' | 'powerOfTwo';
}

export interface BooleanSetting extends SettingBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

export interface SelectSetting extends SettingBase {
  readonly type: 'select';
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface StringSetting extends SettingBase {
  readonly type: 'string';
  readonly default: string;
  readonly placeholder?: string;
}

export type ExperienceSetting = NumberSetting | BooleanSetting | SelectSetting | StringSetting;

export interface ExperienceStyle {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly palette: readonly number[];
  readonly background: number;
  readonly passes: readonly string[];
}

export interface ExperienceStyleManifest {
  readonly defaultStyleId: string;
  readonly renderLayers: readonly string[];
  readonly passes: readonly string[];
  readonly qualities: readonly string[];
  readonly styles: readonly ExperienceStyle[];
}

export interface ExperienceTutorialPage {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
}

export interface ExperienceAttribution {
  readonly label: string;
  readonly href: string;
  readonly author?: string;
  readonly license?: string;
}

export interface ExperiencePhysicsDescriptor {
  readonly renderer: string;
  readonly engine: string;
  readonly portability: 'reusable-core' | 'experience-local';
  readonly supportedShapes: readonly string[];
  readonly reusableFor: readonly string[];
  readonly caveats: readonly string[];
}

export type ExperienceLaunchProfile = 'play' | 'preview' | 'demo';
export type ExperienceSettingValue = number | boolean | string;

export type PreviewRenderPolicy = 'auto' | 'live' | 'static';
export type PreviewGenerationMode = 'exact' | 'varied';

export interface PreviewVariationConfig {
  readonly intensity: number;
  readonly lockedKeys: readonly string[];
  readonly seed: number;
}

export interface PreviewFallbackImage {
  readonly src: string;
  readonly revision: string;
  readonly width: number;
  readonly height: number;
  readonly profileHash: string;
}

export interface ExperiencePreviewProfile {
  readonly modeId?: string;
  readonly styleId?: string;
  readonly settings: Readonly<Record<string, ExperienceSettingValue>>;
  readonly variation: PreviewVariationConfig;
  readonly generationMode: PreviewGenerationMode;
  readonly renderPolicy: PreviewRenderPolicy;
  readonly image?: PreviewFallbackImage;
}

export interface ResolvedPreviewLaunch {
  readonly profile: 'preview';
  readonly modeId?: string;
  readonly styleId?: string;
  readonly settings: Readonly<Record<string, ExperienceSettingValue>>;
  readonly seed: number;
  readonly hash: string;
}

export interface ExperienceLaunchOptions {
  readonly profile?: ExperienceLaunchProfile;
  readonly modeId?: string;
  readonly styleId?: string;
  readonly settings?: Readonly<Record<string, ExperienceSettingValue>>;
  readonly seed?: number;
}

export interface ExperienceRuntimeController {
  readonly modeId: string;
  readonly styleId: string;
  readonly settings: Readonly<Record<string, ExperienceSettingValue>>;
  readonly entityCount?: number;
  readonly runtimeDiagnostics?: Readonly<Record<string, string | number | boolean>>;
  /** False while an automated scene has not yet produced meaningful visible capture content. */
  readonly captureReady?: boolean;
  setMode(modeId: string): void;
  setStyle(styleId: string): void;
  setSetting(key: string, value: ExperienceSettingValue): void;
  reset(): void;
}

export const ExperienceRuntimeControllerService = createExtensionToken<ExperienceRuntimeController>(
  'gl-game-lab.experience.runtime-controller',
);

export interface ExperiencePreviewCycleRequest {
  readonly generation: number;
  readonly seed: number;
}

export type ExperiencePreviewCycleOutcome = 'handled' | 'restart';

export interface ExperiencePreviewCycleController {
  advancePreviewCycle(request: ExperiencePreviewCycleRequest): ExperiencePreviewCycleOutcome;
}

export const ExperiencePreviewCycleControllerService = createExtensionToken<ExperiencePreviewCycleController>(
  'gl-game-lab.experience.preview-cycle-controller',
);

export interface ExperienceDefinition {
  readonly id: string;
  readonly kind: ExperienceKind;
  readonly name: string;
  readonly short: string;
  readonly long: string;
  readonly icon: string;
  readonly tags: readonly string[];
  readonly paletteHint?: string;
  readonly capabilities: ExperienceCapabilities;
  readonly configDefaults?: Readonly<Record<string, unknown>>;
  readonly modes?: readonly ExperienceMode[];
  readonly settings?: readonly ExperienceSetting[];
  readonly styleManifest?: ExperienceStyleManifest;
  readonly tutorialPages?: readonly ExperienceTutorialPage[];
  readonly attributions?: readonly ExperienceAttribution[];
  readonly physics?: ExperiencePhysicsDescriptor;
  createPlugins(options?: ExperienceLaunchOptions): readonly EnginePlugin[];
}

export const ENGINE_TIME_SCALE_SETTING: NumberSetting = Object.freeze({
  key: 'timeScale',
  label: 'Time Scale',
  section: 'Simulation',
  description: 'Controls how quickly the entire scene advances. Use values below 1 for slow motion, 1 for real time, and values above 1 for fast-forward.',
  type: 'number',
  min: 0,
  max: 2,
  step: 0.05,
  default: 1,
});

const ENGINE_SETTING_KEYS = new Set<string>([ENGINE_TIME_SCALE_SETTING.key]);
const ENGINE_COMPOSED_DEFINITIONS = new WeakSet<ExperienceDefinition>();

/** Removes engine-owned controls before settings cross into experience-specific code. */
export function withoutEngineSettings(
  settings: Readonly<Record<string, ExperienceSettingValue>> | undefined,
): Readonly<Record<string, ExperienceSettingValue>> | undefined {
  if (!settings || !Object.keys(settings).some((key) => ENGINE_SETTING_KEYS.has(key))) return settings;
  return Object.freeze(Object.fromEntries(
    Object.entries(settings).filter(([key]) => !ENGINE_SETTING_KEYS.has(key)),
  ));
}

/** Adds the engine-owned time control while replacing legacy scene-local implementations. */
export function withEngineTimeScaleSetting(definition: ExperienceDefinition): ExperienceDefinition {
  if (ENGINE_COMPOSED_DEFINITIONS.has(definition)) return definition;
  const composed = Object.freeze({
    ...definition,
    settings: Object.freeze([
      ENGINE_TIME_SCALE_SETTING,
      ...(definition.settings ?? []).filter((setting) => setting.key !== ENGINE_TIME_SCALE_SETTING.key),
    ]),
    createPlugins: (options?: ExperienceLaunchOptions): readonly EnginePlugin[] => {
      if (!options) return definition.createPlugins();
      const contentSettings = withoutEngineSettings(options.settings);
      if (contentSettings === options.settings || contentSettings === undefined) return definition.createPlugins(options);
      return definition.createPlugins(Object.freeze({ ...options, settings: contentSettings }));
    },
  });
  ENGINE_COMPOSED_DEFINITIONS.add(composed);
  return composed;
}

const PREVIEW_MODE_LOCK = '$mode';
const PREVIEW_STYLE_LOCK = '$style';

export function createDefaultPreviewProfile(
  definition: ExperienceDefinition,
  _settings: Readonly<Record<string, ExperienceSettingValue>> = {},
): ExperiencePreviewProfile {
  return Object.freeze({
    settings: Object.freeze({}),
    variation: Object.freeze({ intensity: 0.25, lockedKeys: Object.freeze([]), seed: hashText(definition.id) }),
    generationMode: 'varied' as const,
    renderPolicy: 'auto' as const,
  });
}

export function sanitizePreviewProfile(
  definition: ExperienceDefinition,
  candidate: ExperiencePreviewProfile | undefined,
  fallbackSettings: Readonly<Record<string, ExperienceSettingValue>> = {},
): ExperiencePreviewProfile {
  const fallback = createDefaultPreviewProfile(definition, fallbackSettings);
  if (!candidate) return fallback;
  const settings: Record<string, ExperienceSettingValue> = {};
  for (const field of definition.settings ?? []) {
    if (!Object.prototype.hasOwnProperty.call(candidate.settings, field.key)) continue;
    const value = sanitizeSettingValue(field, candidate.settings[field.key] ?? field.default);
    const baseline = sanitizeSettingValue(field, fallbackSettings[field.key] ?? field.default);
    if (!Object.is(value, baseline)) settings[field.key] = value;
  }
  const baseModeId = definition.modes?.[0]?.id;
  const candidateModeId = definition.modes?.some((mode) => mode.id === candidate.modeId) ? candidate.modeId : undefined;
  const modeId = candidateModeId && candidateModeId !== baseModeId ? candidateModeId : undefined;
  const baseStyleId = definition.styleManifest?.defaultStyleId;
  const candidateStyleId = definition.styleManifest?.styles.some((style) => style.id === candidate.styleId) ? candidate.styleId : undefined;
  const styleId = candidateStyleId && candidateStyleId !== baseStyleId ? candidateStyleId : undefined;
  const validLocks = new Set([PREVIEW_MODE_LOCK, PREVIEW_STYLE_LOCK, ...(definition.settings ?? []).map((field) => field.key)]);
  const lockedKeys = [...new Set(candidate.variation.lockedKeys.filter((key) => validLocks.has(key)))].sort();
  const intensity = clamp(Number.isFinite(candidate.variation.intensity) ? candidate.variation.intensity : 0.25, 0, 1);
  const seed = Number.isSafeInteger(candidate.variation.seed) ? candidate.variation.seed >>> 0 : fallback.variation.seed;
  const renderPolicy: PreviewRenderPolicy = candidate.renderPolicy === 'live' || candidate.renderPolicy === 'static' ? candidate.renderPolicy : 'auto';
  const generationMode: PreviewGenerationMode = candidate.generationMode === 'exact' ? 'exact' : 'varied';
  const image = sanitizePreviewImage(candidate.image);
  return Object.freeze({
    ...(modeId ? { modeId } : {}),
    ...(styleId ? { styleId } : {}),
    settings: Object.freeze(settings),
    variation: Object.freeze({ intensity, lockedKeys: Object.freeze(lockedKeys), seed }),
    generationMode,
    renderPolicy,
    ...(image ? { image } : {}),
  });
}

export function resolvePreviewLaunch(
  definition: ExperienceDefinition,
  candidate: ExperiencePreviewProfile | undefined,
  sessionSeed: number,
): ResolvedPreviewLaunch {
  const profile = sanitizePreviewProfile(definition, candidate);
  const seed = mixSeed(profile.variation.seed, Number.isSafeInteger(sessionSeed) ? sessionSeed >>> 0 : 0, hashText(definition.id));
  const random = createRandom(seed);
  const locked = new Set(profile.variation.lockedKeys);
  const intensity = profile.generationMode === 'exact' ? 0 : profile.variation.intensity;
  const settings: Record<string, ExperienceSettingValue> = {};
  for (const field of definition.settings ?? []) {
    const anchor = profile.settings[field.key] ?? field.default;
    settings[field.key] = locked.has(field.key) ? anchor : varySetting(field, anchor, intensity, random);
  }
  const modeId = varyChoice(
    profile.modeId ?? definition.modes?.[0]?.id,
    definition.modes?.map((mode) => mode.id) ?? [],
    intensity,
    locked.has(PREVIEW_MODE_LOCK),
    random,
  );
  const styleId = varyPreviewStyle(
    profile.styleId ?? definition.styleManifest?.defaultStyleId,
    definition.styleManifest?.styles.filter((style) => style.id !== '__random__').map((style) => style.id) ?? [],
    intensity,
    locked.has(PREVIEW_STYLE_LOCK),
    random,
  );
  const stable = stableStringify({ generationMode: profile.generationMode, modeId, styleId, settings, seed });
  return Object.freeze({
    profile: 'preview' as const,
    ...(modeId ? { modeId } : {}),
    ...(styleId ? { styleId } : {}),
    settings: Object.freeze(settings),
    seed,
    hash: hashText(stable).toString(16).padStart(8, '0'),
  });
}

function varyPreviewStyle(
  anchor: string | undefined,
  choices: readonly string[],
  intensity: number,
  locked: boolean,
  random: () => number,
): string | undefined {
  if (!anchor || locked || choices.length < 2 || intensity <= 0) return anchor;
  return choices[Math.floor(random() * choices.length)] ?? anchor;
}

function varySetting(
  field: ExperienceSetting,
  anchor: ExperienceSettingValue,
  intensity: number,
  random: () => number,
): ExperienceSettingValue {
  if (intensity <= 0 || field.type === 'string') return anchor;
  if (field.type === 'boolean') return random() < 0.25 * intensity ? !Boolean(anchor) : Boolean(anchor);
  if (field.type === 'select') {
    const options = field.options.filter((option) => option.value !== '__random__').map((option) => option.value);
    if (field.previewVariation === 'always') return options[Math.floor(random() * options.length)] ?? String(anchor);
    return varyChoice(String(anchor), options, intensity, false, random) ?? String(anchor);
  }
  const numeric = typeof anchor === 'number' ? anchor : field.default;
  if (field.numericScale === 'powerOfTwo') {
    const exponent = Math.log2(Math.max(1, numeric));
    const delta = Math.round(centeredNoise(random) * 2 * intensity);
    return sanitizeSettingValue(field, 2 ** (Math.round(exponent) + delta));
  }
  const radius = (field.max - field.min) * 0.2 * intensity;
  const value = numeric + centeredNoise(random) * radius;
  const snapped = field.min + Math.round((value - field.min) / field.step) * field.step;
  return sanitizeSettingValue(field, snapped);
}

function varyChoice(
  anchor: string | undefined,
  choices: readonly string[],
  intensity: number,
  locked: boolean,
  random: () => number,
): string | undefined {
  if (!anchor || locked || choices.length < 2 || intensity <= 0 || random() >= 0.35 * intensity) return anchor;
  const alternatives = choices.filter((choice) => choice !== anchor);
  return alternatives[Math.floor(random() * alternatives.length)] ?? anchor;
}

function sanitizeSettingValue(field: ExperienceSetting, value: ExperienceSettingValue): ExperienceSettingValue {
  if (field.type === 'number') {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : field.default;
    if (field.numericScale === 'powerOfTwo') {
      const exponent = Math.round(Math.log2(Math.max(1, numeric)));
      return clamp(2 ** exponent, field.min, field.max);
    }
    const snapped = field.min + Math.round((numeric - field.min) / field.step) * field.step;
    return clamp(Number(snapped.toFixed(10)), field.min, field.max);
  }
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : field.default;
  if (field.type === 'select') return typeof value === 'string' && field.options.some((option) => option.value === value) ? value : field.default;
  return typeof value === 'string' ? value : field.default;
}

function sanitizePreviewImage(image: PreviewFallbackImage | undefined): PreviewFallbackImage | undefined {
  if (!image || typeof image.src !== 'string' || !/^previews\/[a-z0-9-]+\.webp$/.test(image.src)) return undefined;
  if (typeof image.revision !== 'string' || !/^[a-f0-9]{8,64}$/.test(image.revision)) return undefined;
  if (!Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1) return undefined;
  if (typeof image.profileHash !== 'string' || !/^[a-f0-9]{8}$/.test(image.profileHash)) return undefined;
  return Object.freeze({ ...image });
}

function centeredNoise(random: () => number): number {
  return random() + random() - 1;
}

function createRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function mixSeed(...values: readonly number[]): number {
  let mixed = 0x811c9dc5;
  for (const value of values) {
    mixed ^= value >>> 0;
    mixed = Math.imul(mixed, 0x01000193) >>> 0;
  }
  return mixed;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ExperienceRegistry {
  private readonly definitions = new Map<string, ExperienceDefinition>();

  register(definition: ExperienceDefinition): this {
    const id = normalizeId(definition.id, 'Experience');
    if (id !== definition.id) throw new Error('Experience id cannot contain surrounding whitespace');
    if (this.definitions.has(id)) throw new Error(`Experience is already registered: ${id}`);
    validateDefinition(definition);
    this.definitions.set(id, definition);
    return this;
  }

  get(id: string): ExperienceDefinition {
    const definition = this.tryGet(id);
    if (!definition) throw new Error(`Experience is not registered: ${id}`);
    return definition;
  }

  tryGet(id: string): ExperienceDefinition | undefined {
    return this.definitions.get(id.trim().toLowerCase());
  }

  values(): readonly ExperienceDefinition[] {
    return [...this.definitions.values()];
  }
}

function validateDefinition(definition: ExperienceDefinition): void {
  for (const [label, value] of [
    ['name', definition.name],
    ['short description', definition.short],
    ['long description', definition.long],
    ['icon', definition.icon],
  ] as const) {
    if (value.trim().length === 0) throw new Error(`Experience ${definition.id} ${label} cannot be empty`);
  }
  const modeIds = new Set<string>();
  for (const mode of definition.modes ?? []) {
    const id = normalizeId(mode.id, 'Experience mode');
    if (modeIds.has(id)) throw new Error(`Duplicate mode ${id} in experience ${definition.id}`);
    modeIds.add(id);
  }
  const settingKeys = new Set<string>();
  for (const setting of definition.settings ?? []) {
    const key = normalizeId(setting.key, 'Experience setting');
    if (settingKeys.has(key)) throw new Error(`Duplicate setting ${key} in experience ${definition.id}`);
    settingKeys.add(key);
    if (setting.type === 'number') {
      if (![setting.default, setting.min, setting.max, setting.step].every(Number.isFinite)) {
        throw new Error(`Number setting ${key} must be finite`);
      }
      if (setting.min > setting.max || setting.default < setting.min || setting.default > setting.max || setting.step <= 0) {
        throw new Error(`Number setting ${key} has invalid bounds`);
      }
    }
  }
  validateStyles(definition);
  for (const page of definition.tutorialPages ?? []) {
    if (page.icon.trim().length === 0 || page.title.trim().length === 0 || page.body.trim().length === 0) {
      throw new Error(`Experience ${definition.id} tutorial pages must be complete`);
    }
  }
  for (const attribution of definition.attributions ?? []) {
    if (attribution.label.trim().length === 0 || attribution.href.trim().length === 0) throw new Error(`Experience ${definition.id} attributions must include a label and link`);
    try { new URL(attribution.href); } catch { throw new Error(`Experience ${definition.id} attribution link is invalid`); }
  }
}

function validateStyles(definition: ExperienceDefinition): void {
  const manifest = definition.styleManifest;
  if (!manifest) return;
  const styleIds = new Set<string>();
  for (const style of manifest.styles) {
    const id = normalizeId(style.id, 'Experience style');
    if (styleIds.has(id)) throw new Error(`Duplicate style ${id} in experience ${definition.id}`);
    styleIds.add(id);
    if (style.name.trim().length === 0 || style.description.trim().length === 0) {
      throw new Error(`Experience style ${id} must have a name and description`);
    }
    if (style.palette.length === 0 || !style.palette.every(isRgbColor) || !isRgbColor(style.background)) {
      throw new Error(`Experience style ${id} has an invalid palette`);
    }
  }
  if (!styleIds.has(manifest.defaultStyleId)) {
    throw new Error(`Experience ${definition.id} default style is not registered`);
  }
}

function isRgbColor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xff_ff_ff;
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim().toLowerCase();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}
