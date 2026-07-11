import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
export type ParticleFluidConfig = Readonly<Record<string, ExperienceSettingValue>>;
export const PARTICLE_FLUID_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Style',
    section: 'Rendering',
    type: 'select',
    options: [
      {
        label: 'Basic',
        value: 'basic'
      },
      {
        label: 'Enhanced',
        value: 'enhanced'
      }
    ],
    default: 'basic'
  },
  {
    ...n('maxParticles', 'Particle Budget', 'Simulation', 1024, 4194304, 1, 262144),
    numericScale: 'powerOfTwo'
  },
  n('fieldCellSize', 'Fluid Scale', 'Simulation', 1, 10, 1, 4),
  n('simulationScale', 'Tank Scale', 'Simulation', 0.25, 2.5, 0.05, 1),
  n('solverIterations', 'Solver Iterations', 'Simulation', 1, 50, 1, 18),
  {
    ...n('cellSize', 'Cell Size', 'Simulation', 8, 64, 1, 32),
    advanced: true
  },
  {
    ...n('velocityDecay', 'Velocity Decay', 'Simulation', 0.94, 1, 0.0005, 0.999),
    advanced: true
  },
  {
    ...n('particleDrag', 'Particle Drag', 'Simulation', 0.05, 1, 0.01, 1),
    advanced: true
  },
  {
    ...n('forceRadius', 'Force Radius', 'Input', 0.004, 0.06, 0.001, 0.015),
    advanced: true
  },
  {
    ...n('forceTaper', 'Force Taper', 'Input', 0, 1, 0.01, 0.6),
    advanced: true
  },
  {
    ...n('forceStrength', 'Force Strength', 'Input', 0.1, 3, 0.05, 1),
    advanced: true
  },
  n('pointSize', 'Point Size', 'Rendering', 1, 4, 0.25, 1),
  {
    ...n('bloomStrength', 'Bloom Strength', 'Rendering', 0, 3, 0.05, 0.9),
    visibleRenderStyles: [
      'enhanced'
    ]
  },
  {
    ...n('pulseStrength', 'Gradient Pulse', 'Rendering', 0, 2.5, 0.05, 1),
    visibleRenderStyles: [
      'enhanced'
    ]
  },
  {
    ...n('colorSpeedScale', 'Color Speed Scale', 'Rendering', 0.5, 12, 0.25, 4),
    advanced: true
  }
]);
export const PARTICLE_FLUID_DEFAULTS: ParticleFluidConfig = Object.freeze(Object.fromEntries(PARTICLE_FLUID_SETTINGS.map(setting => [
  setting.key,
  setting.default
])));
export function createParticleFluidConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): ParticleFluidConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...PARTICLE_FLUID_DEFAULTS
  };
  for (const setting of PARTICLE_FLUID_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Particle Fluid setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Particle Fluid ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function particleFluidNumber(config: ParticleFluidConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Particle Fluid numeric setting unavailable: ${key}`);
  return value;
}
export function particleFluidString(config: ParticleFluidConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Particle Fluid string setting unavailable: ${key}`);
  return value;
}
function n(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number) {
  return Object.freeze({
    key,
    label,
    section,
    type: 'number' as const,
    min,
    max,
    step,
    default: defaultValue
  });
}
