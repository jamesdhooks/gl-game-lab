import type { ExperienceSetting, ExperienceSettingValue, PerformanceTier } from '@hooksjam/gl-game-lab-engine';

export type BallPitMode = 'single' | 'stream' | 'interact' | 'explosion';

export interface BallPitConfig {
  readonly screensaverMs: number;
  readonly maxParticles: number;
  readonly radius: number;
  readonly radiusVariation: number;
  readonly spawnRate: number;
  readonly interactionRadius: number;
  readonly solverPasses: number;
  readonly substeps: number;
  readonly gravity: number;
  readonly burstCount: number;
  readonly wallBounce: boolean;
  readonly friction: number;
  readonly collisionSoftness: number;
  readonly maxPairPush: number;
  readonly airDrag: number;
  readonly solverDamping: number;
  readonly wallBounceAmount: number;
  readonly impactBounceThreshold: number;
}

export const BALL_PIT_DEFAULTS: BallPitConfig = Object.freeze({
  screensaverMs: 60_000,
  maxParticles: 65_536,
  radius: 12,
  radiusVariation: 0.15,
  spawnRate: 1200,
  interactionRadius: 56,
  solverPasses: 3,
  substeps: 2,
  gravity: 1300,
  burstCount: 5000,
  wallBounce: false,
  friction: 0.72,
  collisionSoftness: 1.05,
  maxPairPush: 0.75,
  airDrag: 0.998,
  solverDamping: 0.982,
  wallBounceAmount: 0.16,
  impactBounceThreshold: 150,
});

export const BALL_PIT_SETTINGS: readonly ExperienceSetting[] = [
  { ...numberSetting('maxParticles', 'Max Particles', 65_536, 1_024, 262_144, 1, 'Physics'), numericScale: 'powerOfTwo' },
  numberSetting('radius', 'Radius', 12, 2, 64, 0.5, 'Physics'),
  numberSetting('radiusVariation', 'Radius Variation', 0.15, 0, 1, 0.01, 'Physics'),
  { ...numberSetting('spawnRate', 'Spawn / sec', 1200, 50, 6_000, 50, 'Input Mode'), visibleModes: ['stream'] },
  { ...numberSetting('interactionRadius', 'Interaction Radius', 56, 16, 240, 2, 'Input Mode'), visibleModes: ['interact'] },
  numberSetting('solverPasses', 'Solver Passes', 3, 1, 8, 1, 'Physics'),
  numberSetting('substeps', 'Substeps', 2, 1, 5, 1, 'Physics'),
  numberSetting('gravity', 'Gravity', 1300, 0, 3000, 25, 'Physics'),
  { ...numberSetting('burstCount', 'Explosion Force', 5000, 100, 10_000, 100, 'Input Mode'), visibleModes: ['explosion'], advanced: true },
  { key: 'wallBounce', label: 'Wall Bounce', section: 'Physics', type: 'boolean', default: false, advanced: true },
  { ...numberSetting('friction', 'Friction', 0.72, 0, 2, 0.05, 'Physics'), advanced: true },
  { ...numberSetting('collisionSoftness', 'Collision Softness', 1.05, 0.05, 1.5, 0.01, 'Physics'), advanced: true },
  { ...numberSetting('maxPairPush', 'Push Cap', 0.75, 0.02, 2, 0.01, 'Physics'), advanced: true },
  { ...numberSetting('airDrag', 'Air Drag', 0.998, 0.9, 1, 0.001, 'Physics'), advanced: true },
  { ...numberSetting('solverDamping', 'Solver Damping', 0.982, 0.9, 1, 0.001, 'Physics'), advanced: true },
  { ...numberSetting('wallBounceAmount', 'Bounce Amount', 0.16, 0, 1, 0.01, 'Physics'), advanced: true },
  { ...numberSetting('impactBounceThreshold', 'Impact Threshold', 150, 0, 500, 10, 'Physics'), advanced: true },
] as const;

export function createBallPitConfig(
  overrides: Readonly<Record<string, ExperienceSettingValue>> = {},
): BallPitConfig {
  const values: Record<string, ExperienceSettingValue> = { ...BALL_PIT_DEFAULTS };
  for (const [key, value] of Object.entries(overrides)) {
    let normalizedValue = value;
    if (key === 'screensaverMs') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid Ball Pit setting screensaverMs');
      values[key] = normalizedValue;
      continue;
    }
    const field = BALL_PIT_SETTINGS.find((setting) => setting.key === key);
    if (!field) throw new Error(`Unknown Ball Pit setting: ${key}`);
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Ball Pit setting ${key} must be boolean`);
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) {
        throw new Error(`Ball Pit setting ${key} is outside its supported range`);
      }
      normalizedValue = field.numericScale === 'powerOfTwo'
        ? 2 ** Math.round(Math.log2(value))
        : snapNumber(value, field.min, field.step);
    } else if (field.type === 'select' && (typeof value !== 'string' || !field.options.some((option) => option.value === value))) {
      throw new Error(`Ball Pit setting ${key} is not a supported option`);
    } else if (field.type === 'string' && typeof value !== 'string') {
      throw new Error(`Ball Pit setting ${key} must be text`);
    }
    values[key] = normalizedValue;
  }
  return Object.freeze(values) as unknown as BallPitConfig;
}

export function ballPitConfigForProfile(config: BallPitConfig, profile: 'play' | 'preview' | 'demo' = 'play'): BallPitConfig {
  if (profile !== 'preview') return config;
  return Object.freeze({
    ...config,
    maxParticles: 96,
    radius: 9,
    radiusVariation: 0.18,
    solverPasses: 2,
    substeps: 1,
    gravity: 1050,
    airDrag: 0.994,
    solverDamping: 0.982,
    maxPairPush: 0.75,
    friction: 0.72,
    collisionSoftness: 1.05,
    impactBounceThreshold: 150,
  });
}

export function ballPitConfigForQuality(config: BallPitConfig, tier: PerformanceTier, profile: 'play' | 'preview' | 'demo' = 'play'): BallPitConfig {
  if (tier !== 'mobile' || profile === 'preview') return config;
  return Object.freeze({
    ...config,
    maxParticles: Math.min(config.maxParticles, 2_048),
    spawnRate: Math.min(config.spawnRate, 240),
    solverPasses: Math.min(config.solverPasses, 2),
    substeps: 1,
    burstCount: Math.min(config.burstCount, 1_500),
  });
}

function snapNumber(value: number, minimum: number, step: number): number {
  const snapped = minimum + Math.round((value - minimum) / step) * step;
  const decimals = step >= 1 ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
  return Number(snapped.toFixed(decimals));
}

function numberSetting(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step: number,
  section: string,
): ExperienceSetting & { readonly type: 'number' } {
  return { key, label, type: 'number', default: defaultValue, min, max, step, section };
}
