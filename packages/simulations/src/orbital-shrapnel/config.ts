import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
export type OrbitalShrapnelConfig = Readonly<Record<string, ExperienceSettingValue>>;
export const ORBITAL_SHRAPNEL_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  n('gravity', 'Planet Gravity', 'Planet', 0, 3200, 50, 1850),
  n('planetRadius', 'Planet Radius', 'Planet', 22, 92, 2, 46),
  n('trailFade', 'Trail Persistence', 'Rendering', 0, 0.995, 0.005, 0.972),
  n('debrisSize', 'Debris Size', 'Rendering', 0.05, 5, 0.05, 0.72),
  n('debrisOpacity', 'Debris Opacity', 'Rendering', 0, 1, 0.01, 1),
  {
    key: 'starField',
    label: 'Star Field',
    section: 'Rendering',
    type: 'boolean',
    default: true
  },
  n('starFieldOpacity', 'Star Opacity', 'Rendering', 0, 1, 0.01, 0.42),
  n('addDebrisVolume', 'Add Volume', 'Input Mode', 0.005, 0.12, 0.005, 0.035, [
    'add'
  ]),
  n('addRadius', 'Add Radius', 'Input Mode', 2, 220, 1, 32, [
    'add'
  ]),
  n('addDebrisVelocity', 'Motion Inheritance', 'Input Mode', 0, 1.4, 0.05, 0.35, [
    'add'
  ]),
  n('addJitter', 'Add Jitter', 'Input Mode', 0, 1.5, 0.025, 0.12, [
    'add'
  ]),
  n('interactionRadius', 'Interaction Radius', 'Input Mode', 16, 240, 2, 56, [
    'interact'
  ]),
  n('interactionStrength', 'Interaction Strength', 'Input Mode', 0.1, 12, 0.1, 3.2, [
    'interact'
  ]),
  n('wellRadius', 'Well Size', 'Input Mode', 16, 280, 2, 72, [
    'well'
  ]),
  n('wellStrength', 'Well Pull', 'Input Mode', 0.1, 18, 0.1, 5.5, [
    'well'
  ]),
  n('secondaryBodyCount', 'Secondary Bodies', 'Secondary Bodies', 0, 8, 1, 3),
  n('secondaryBodyStrength', 'Body Pull', 'Secondary Bodies', 0, 1.5, 0.05, 0.35),
  n('secondaryBodyRadius', 'Max Body Orbit', 'Secondary Bodies', 0.2, 1.1, 0.025, 0.72),
  n('secondaryBodySpeed', 'Body Speed', 'Secondary Bodies', 0, 1.5, 0.025, 0.25),
  {
    ...n('rawParticleTextureSize', 'Debris Density', 'Rendering', 64, 2048, 1, 256),
    numericScale: 'powerOfTwo',
    advanced: true
  },
  {
    ...n('rawMaxSpeed', 'Velocity Limit', 'Rendering', 0.25, 8, 0.05, 2.3),
    advanced: true
  },
  {
    ...n('bloomStrength', 'Glow Strength', 'Rendering', 0, 2.5, 0.05, 1.25),
    advanced: true
  },
  {
    ...n('streakStrength', 'Streak Length', 'Rendering', 0, 1.5, 0.05, 0.75),
    advanced: true
  },
]);
export const ORBITAL_SHRAPNEL_DEFAULTS: OrbitalShrapnelConfig = Object.freeze({
  ...Object.fromEntries(ORBITAL_SHRAPNEL_SETTINGS.map(setting => [
    setting.key,
    setting.default
  ])),
  drag: 0.0016
});
export function createOrbitalShrapnelConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): OrbitalShrapnelConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...ORBITAL_SHRAPNEL_DEFAULTS
  };
  for (const setting of ORBITAL_SHRAPNEL_SETTINGS) {
    const candidate = values[setting.key] ?? setting.default;
    const value = setting.type === 'number' && setting.key === 'rawParticleTextureSize'
      ? snapParticleTextureSize(typeof candidate === 'string' ? Number(candidate) : candidate, setting.min, setting.max)
      : candidate;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Orbital Shrapnel setting ${setting.key} is outside its supported range`);
    if (setting.type === 'boolean' && typeof value !== 'boolean')
      throw new Error(`Orbital Shrapnel setting ${setting.key} must be boolean`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Orbital Shrapnel ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function orbitalNumber(config: OrbitalShrapnelConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Orbital numeric setting is unavailable: ${key}`);
  return value;
}
export function orbitalString(config: OrbitalShrapnelConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Orbital string setting is unavailable: ${key}`);
  return value;
}
export function orbitalBoolean(config: OrbitalShrapnelConfig, key: string): boolean {
  const value = config[key];
  if (typeof value !== 'boolean')
    throw new Error(`Orbital boolean setting is unavailable: ${key}`);
  return value;
}
function snapParticleTextureSize(value: ExperienceSettingValue, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('Orbital Shrapnel setting rawParticleTextureSize is outside its supported range');
  return Math.max(min, Math.min(max, 2 ** Math.round(Math.log2(value))));
}
function n(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number, visibleModes?: readonly string[]) {
  return Object.freeze({
    key,
    label,
    section,
    type: 'number' as const,
    min,
    max,
    step,
    default: defaultValue,
    ...(visibleModes ? {
      visibleModes
    } : {})
  });
}
