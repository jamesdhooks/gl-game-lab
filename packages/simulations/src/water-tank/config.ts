import type { ExperienceSetting, ExperienceSettingValue, NumberSetting } from '@hooksjam/gl-game-lab-engine';
export type WaterTankConfig = Readonly<Record<string, ExperienceSettingValue>>;
const p = 'Physics', r = 'Rendering', e = 'Enhanced Surface';
export const WATER_TANK_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Style',
    section: r,
    type: 'select',
    options: [
      {
        label: 'Basic',
        value: 'basic'
      },
      {
        label: 'Enhanced',
        value: 'enhanced'
      },
      {
        label: 'Ultra',
        value: 'ultra'
      }
    ],
    default: 'enhanced'
  },
  {
    ...n('maxParticles', 'Max Particles', p, 512, 8192, 1, 2048),
    numericScale: 'powerOfTwo'
  },
  n('particleRadius', 'Particle Radius', p, 1.6, 24, 0.1, 3.1),
  n('gravity', 'Gravity', p, 100, 2600, 25, 1120),
  n('viscosity', 'Viscosity Scale', p, 0, 12, 0.05, 1),
  n('viscositySigma', 'Linear Viscosity', p, 0, 3, 0.01, 0.9),
  n('viscosityBeta', 'Quadratic Viscosity', p, 0, 2, 0.01, 0.3),
  n('supportRadiusScale', 'Neighbor Radius', p, 1, 3.8, 0.05, 1.35),
  {
    ...n('fluidGridResolution', 'Surface Resolution', r, 128, 1024, 1, 512),
    numericScale: 'powerOfTwo'
  },
  n('restDensity', 'Rest Density', p, 0.05, 4, 0.01, 0.72),
  n('stiffness', 'Stiffness', p, 0, 0.16, 0.001, 0.028),
  n('nearStiffness', 'Near Stiffness', p, 0, 5, 0.01, 1.15),
  {
    ...n('neighborPairBudget', 'Neighbor Pair Budget', p, 8192, 262144, 1, 65536),
    numericScale: 'powerOfTwo'
  },
  n('surfaceTension', 'Surface Settling', p, 0, 9000, 50, 900),
  n('collisionBounce', 'Collision Bounce', p, 0, 0.4, 0.01, 0.04),
  n('maxFluidSpeed', 'Velocity Limit', p, 300, 4200, 50, 2400),
  n('obstacleRamps', 'Obstacle Ramps', 'Tank Layout', 0, 8, 1, 4),
  n('obstaclePegs', 'Obstacle Pegs', 'Tank Layout', 0, 10, 1, 3),
  m(n('pourRate', 'Pour Rate', 'Input Mode', 500, 42000, 100, 9000), [
    'pour'
  ]),
  m(n('pourRadius', 'Pour Radius', 'Input Mode', 4, 120, 1, 34), [
    'pour'
  ]),
  m(n('buildRadius', 'Build Radius', 'Input Mode', 6, 48, 1, 18), [
    'build'
  ]),
  m(n('interactionRadius', 'Splash Radius', 'Input Mode', 20, 220, 2, 76), [
    'splash'
  ]),
  m(n('interactionStrength', 'Splash Strength', 'Input Mode', 2, 45, 1, 18), [
    'splash'
  ]),
  n('metaballBlend', 'Water Surface', r, 0, 1, 0.01, 0.76),
  v(n('liquidFieldScale', 'Field Resolution', e, 0.45, 1, 0.01, 0.78), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidSurfaceThreshold', 'Surface Threshold', e, 0.12, 0.72, 0.005, 0.18), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidEdgeTightness', 'Edge Tightness', e, 0.15, 1, 0.01, 0.82), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidEdgeSoftness', 'Edge Softness', e, 0, 2, 0.01, 0.46), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidSplatDensity', 'Splat Density', e, 0.45, 1.8, 0.01, 1.28), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidParticleRadius', 'Surface Radius', e, 0.7, 1.8, 0.01, 1.2), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidRefraction', 'Refraction', e, 0, 1, 0.01, 0.58), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidGloss', 'Specular Gloss', e, 0, 1, 0.01, 0.78), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidFoamStrength', 'Foam Bloom', e, 0, 6, 0.01, 2.4), [
    'ultra'
  ]),
  v(n('liquidBloomStrength', 'Soft Bloom', e, 0, 3, 0.01, 0.34), [
    'ultra'
  ]),
  v(n('liquidHeatShimmer', 'Heat Shimmer', e, 0, 2, 0.01, 0.16), [
    'ultra'
  ]),
  v(n('liquidDepthDiffusion', 'Depth Diffusion', e, 0, 1, 0.01, 0.18), [
    'ultra'
  ]),
  n('opacity', 'Water Opacity', r, 0.05, 1, 0.01, 0.74),
  n('substeps', 'Substeps', p, 1, 5, 1, 2)
]);
export const WATER_TANK_DEFAULTS: WaterTankConfig = Object.freeze(Object.fromEntries(WATER_TANK_SETTINGS.map(setting => [
  setting.key,
  setting.default
])));
export function createWaterTankConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): WaterTankConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...WATER_TANK_DEFAULTS
  };
  for (const setting of WATER_TANK_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Water Tank setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Water Tank ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function waterNumber(config: WaterTankConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Water Tank numeric setting unavailable: ${key}`);
  return value;
}
export function waterString(config: WaterTankConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Water Tank string setting unavailable: ${key}`);
  return value;
}
function n(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number): NumberSetting {
  return Object.freeze({
    key,
    label,
    section,
    type: 'number',
    min,
    max,
    step,
    default: defaultValue
  });
}
function v(setting: NumberSetting, visibleRenderStyles: readonly string[]): NumberSetting {
  return Object.freeze({
    ...setting,
    visibleRenderStyles
  });
}
function m(setting: NumberSetting, visibleModes: readonly string[]): NumberSetting {
  return Object.freeze({
    ...setting,
    visibleModes
  });
}
