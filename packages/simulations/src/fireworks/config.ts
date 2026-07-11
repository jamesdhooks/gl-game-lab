import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';

export interface FireworksConfig {
  readonly launchPower: number; readonly launchSpread: number; readonly shellFuse: number;
  readonly gravity: number; readonly airDrag: number; readonly burstParticles: number;
  readonly burstChaos: number; readonly explosionPower: number; readonly secondaryChance: number;
  readonly secondaryDepth: number; readonly secondaryScale: number; readonly crackleIntensity: number;
  readonly particleSize: number; readonly sparkSizeVariability: number; readonly trailFade: number;
  readonly bloomStrength: number; readonly autoFinaleRate: number; readonly rawParticleTextureSize: string;
}

export const FIREWORKS_DEFAULTS: FireworksConfig = Object.freeze({
  launchPower: 940, launchSpread: 0.18, shellFuse: 1.28, gravity: 360, airDrag: 0.34,
  burstParticles: 512, burstChaos: 0.82, explosionPower: 360, secondaryChance: 0.42,
  secondaryDepth: 2, secondaryScale: 0.54, crackleIntensity: 0.78, particleSize: 1.45,
  sparkSizeVariability: 0.38, trailFade: 0.932, bloomStrength: 1.82, autoFinaleRate: 2.6,
  rawParticleTextureSize: '384',
});

export const FIREWORKS_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  number('launchPower', 'Launch Power', 'Launch', 420, 1560, 20, 940),
  number('launchSpread', 'Origin Spread', 'Launch', 0, 0.62, 0.01, 0.18),
  number('shellFuse', 'Target Fuse Time', 'Launch', 0.55, 2.8, 0.05, 1.28),
  number('gravity', 'Gravity', 'Physics', 120, 760, 10, 360),
  number('airDrag', 'Air Drag', 'Physics', 0, 1.8, 0.05, 0.34),
  { ...number('burstParticles', 'Burst Particle Budget', 'Explosion', 16, 131_072, 1, 512), numericScale: 'powerOfTwo' },
  number('burstChaos', 'Burst Chaos', 'Explosion', 0, 1, 0.01, 0.82),
  number('explosionPower', 'Burst Power', 'Explosion', 90, 720, 10, 360),
  number('secondaryChance', 'Secondary Chance', 'Explosion', 0, 0.95, 0.01, 0.42),
  number('secondaryDepth', 'Secondary Depth', 'Explosion', 0, 3, 1, 2),
  number('secondaryScale', 'Secondary Size', 'Explosion', 0.18, 0.9, 0.01, 0.54),
  number('crackleIntensity', 'Crackle', 'Rendering', 0, 1.5, 0.05, 0.78),
  number('particleSize', 'Spark Size', 'Rendering', 0.45, 3.8, 0.05, 1.45),
  number('sparkSizeVariability', 'Spark Size Variability', 'Rendering', 0, 2, 0.01, 0.38),
  number('trailFade', 'Trail Persistence', 'Rendering', 0.78, 0.995, 0.005, 0.932),
  number('bloomStrength', 'Glow Strength', 'Rendering', 0.4, 3.8, 0.05, 1.82),
  { ...number('autoFinaleRate', 'Stream Rate', 'Input Mode', 0.2, 6, 0.1, 2.6), visibleModes: ['stream'] },
  { key: 'rawParticleTextureSize', label: 'GPU Particle Capacity', section: 'Rendering', type: 'select', default: '384', advanced: true, options: [
    { label: '128² = 16k preview', value: '128' }, { label: '256² = 65k light', value: '256' },
    { label: '384² = 147k reference', value: '384' }, { label: '512² = 262k dense', value: '512' },
    { label: '768² = 590k stream', value: '768' }, { label: '1024² = 1.05M extreme', value: '1024' },
  ] },
]);

export function createFireworksConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): FireworksConfig {
  const textureSize = String(values.rawParticleTextureSize ?? FIREWORKS_DEFAULTS.rawParticleTextureSize);
  if (!['128', '256', '384', '512', '768', '1024'].includes(textureSize)) throw new Error(`Unknown Fireworks GPU particle capacity: ${textureSize}`);
  const result: Record<string, number | string> = { rawParticleTextureSize: textureSize };
  for (const setting of FIREWORKS_SETTINGS) {
    if (setting.type !== 'number') continue;
    const value = values[setting.key] ?? setting.default;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max) throw new Error(`Fireworks setting ${setting.key} is outside its supported range`);
    result[setting.key] = value;
  }
  return Object.freeze(result) as unknown as FireworksConfig;
}

function number(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number) {
  return Object.freeze({ key, label, section, type: 'number' as const, min, max, step, default: defaultValue });
}
