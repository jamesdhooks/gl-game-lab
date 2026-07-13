import {
  createDefaultPreviewProfile,
  sanitizePreviewProfile,
  type ExperienceDefinition,
  type ExperiencePreviewProfile,
  type ExperienceSettingValue,
  type PreviewFallbackImage,
} from '@hooksjam/gl-game-lab-engine';

export type PreviewProfileMap = Readonly<Record<string, ExperiencePreviewProfile>>;

export function normalizePreviewProfiles(
  payload: unknown,
  definitions: readonly ExperienceDefinition[],
): PreviewProfileMap {
  const records = isRecord(payload) && isRecord(payload.previews) ? payload.previews : {};
  const profiles: Record<string, ExperiencePreviewProfile> = {};
  for (const definition of definitions) {
    const fallback = createDefaultPreviewProfile(definition, definitionSettings(definition));
    const raw = records[definition.id];
    profiles[definition.id] = sanitizePreviewProfile(definition, readProfile(raw, fallback), fallback.settings);
  }
  return Object.freeze(profiles);
}

export function definitionSettings(definition: ExperienceDefinition): Readonly<Record<string, ExperienceSettingValue>> {
  const settings: Record<string, ExperienceSettingValue> = {};
  for (const field of definition.settings ?? []) settings[field.key] = field.default;
  for (const [key, value] of Object.entries(definition.configDefaults ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') settings[key] = value;
  }
  return Object.freeze(settings);
}

function readProfile(value: unknown, fallback: ExperiencePreviewProfile): ExperiencePreviewProfile | undefined {
  if (!isRecord(value)) return undefined;
  const settings: Record<string, ExperienceSettingValue> = {};
  if (isRecord(value.settings)) {
    for (const [key, setting] of Object.entries(value.settings)) {
      if (typeof setting === 'string' || typeof setting === 'number' || typeof setting === 'boolean') settings[key] = setting;
    }
  }
  const variation = isRecord(value.variation) ? value.variation : {};
  const lockedKeys = Array.isArray(variation.lockedKeys) ? variation.lockedKeys.filter((key): key is string => typeof key === 'string') : [];
  const image = readImage(value.image);
  return {
    ...(typeof value.modeId === 'string' ? { modeId: value.modeId } : {}),
    ...(typeof value.styleId === 'string' ? { styleId: value.styleId } : {}),
    settings,
    variation: {
      intensity: typeof variation.intensity === 'number' ? variation.intensity : fallback.variation.intensity,
      lockedKeys,
      seed: typeof variation.seed === 'number' ? variation.seed : fallback.variation.seed,
    },
    renderPolicy: value.renderPolicy === 'live' || value.renderPolicy === 'static' ? value.renderPolicy : 'auto',
    ...(image ? { image } : {}),
  };
}

function readImage(value: unknown): PreviewFallbackImage | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.src !== 'string' || typeof value.revision !== 'string' || typeof value.width !== 'number' || typeof value.height !== 'number' || typeof value.profileHash !== 'string') return undefined;
  return { src: value.src, revision: value.revision, width: value.width, height: value.height, profileHash: value.profileHash };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
