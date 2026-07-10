import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';

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

export interface ExperienceDefinition {
  readonly id: string;
  readonly kind: ExperienceKind;
  readonly name: string;
  readonly short: string;
  readonly long: string;
  readonly icon: string;
  readonly tags: readonly string[];
  readonly capabilities: ExperienceCapabilities;
  readonly configDefaults?: Readonly<Record<string, unknown>>;
  readonly modes?: readonly ExperienceMode[];
  readonly settings?: readonly ExperienceSetting[];
  createPlugins(): readonly EnginePlugin[];
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
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim().toLowerCase();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}
