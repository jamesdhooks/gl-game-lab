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
  readonly visibleModes?: readonly string[];
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

export type ExperienceSetting = NumberSetting | BooleanSetting | SelectSetting;

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
  setMode(modeId: string): void;
  setStyle(styleId: string): void;
  setSetting(key: string, value: ExperienceSettingValue): void;
  reset(): void;
}

export const ExperienceRuntimeControllerService = createExtensionToken<ExperienceRuntimeController>(
  'gl-game-lab.experience.runtime-controller',
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
  readonly physics?: ExperiencePhysicsDescriptor;
  createPlugins(options?: ExperienceLaunchOptions): readonly EnginePlugin[];
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
