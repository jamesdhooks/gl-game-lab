import type { ExperienceSetting, ExperienceSettingValue, NumberSetting } from '@hooksjam/gl-game-lab-engine';
export type SplashMpmConfig = Readonly<Record<string, ExperienceSettingValue>>;
const s = 'Simulation', r = 'Rendering', e = 'Enhanced Surface';
export const SPLASH_MPM_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
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
    default: 'ultra'
  },
  {
    ...n('maxParticles', 'Particle Budget', s, 2048, 131072, 1, 32768),
    numericScale: 'powerOfTwo'
  },
  {
    ...n('resolution', 'Resolution', s, 32, 512, 1, 128),
    numericScale: 'powerOfTwo'
  },
  n('stiffness', 'Pressure Stiffness', s, 18, 180, 2, 86),
  n('restDensity', 'Rest Density', s, 1.8, 8, 0.1, 3.2),
  n('particleSeparation', 'Particle Separation', s, 0, 10, 0.01, 0.7),
  n('viscosity', 'Grid Viscosity', s, 0, 0.7, 0.01, 0.18),
  n('flipness', 'FLIP Blend', s, 0, 1, 0.01, 0.88),
  n('gravity', 'Gravity', s, 80, 1900, 20, 920),
  n('particleRadius', 'Droplet Size', s, 1, 64, 0.1, 4.2),
  n('surfaceSmoothing', 'Surface Smoothing', r, 0, 1, 0.01, 0.72),
  n('opacity', 'Opacity', r, 0.18, 1, 0.01, 0.82),
  v(n('enhancedQuality', 'Surface Detail', e, 0.5, 2, 0.05, 1.25), [
    'enhanced',
    'ultra'
  ]),
  v(n('enhancedSplatSize', 'Surface Kernel', e, 0.65, 3.4, 0.05, 1.85), [
    'enhanced',
    'ultra'
  ]),
  v(n('enhancedDepth', 'Palette Depth', e, 0, 1, 0.01, 0.62), [
    'enhanced',
    'ultra'
  ]),
  v(n('enhancedEdge', 'Edge Definition', e, 0, 1, 0.01, 0.58), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidFieldScale', 'Field Resolution', e, 0.45, 1, 0.01, 0.78), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidSurfaceThreshold', 'Surface Threshold', e, 0.04, 0.72, 0.005, 0.1), [
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
  v(n('liquidSplatDensity', 'Splat Density', e, 0.45, 3.4, 0.01, 2.1), [
    'enhanced',
    'ultra'
  ]),
  v(n('liquidParticleRadius', 'Surface Radius', e, 0.7, 3.4, 0.01, 1.95), [
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
  m(n('inputRadius', 'Splash Radius', 'Input Mode', 18, 160, 2, 62), [
    'splash'
  ]),
  m(n('inputForce', 'Splash Force', 'Input Mode', 2, 46, 1, 17), [
    'splash'
  ]),
  m(n('emitRate', 'Pour Rate', 'Input Mode', 80, 1800, 20, 520), [
    'pour'
  ]),
  m(n('pourRadius', 'Pour Radius', 'Input Mode', 4, 120, 1, 34), [
    'pour'
  ]),
  m(n('buildRadius', 'Build Radius', 'Input Mode', 6, 48, 1, 18), [
    'build'
  ])
]);
export const SPLASH_MPM_DEFAULTS: SplashMpmConfig = Object.freeze(Object.fromEntries(SPLASH_MPM_SETTINGS.map(x => [
  x.key,
  x.default
])));
export function createSplashMpmConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): SplashMpmConfig {
  const out: Record<string, ExperienceSettingValue> = {
    ...SPLASH_MPM_DEFAULTS
  };
  for (const setting of SPLASH_MPM_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Splash MPM setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Splash MPM ${setting.label}: ${String(value)}`);
    out[setting.key] = value;
  }
  return Object.freeze(out);
}
export function splashNumber(c: SplashMpmConfig, k: string) {
  const v = c[k];
  if (typeof v !== 'number')
    throw new Error(`Splash MPM numeric setting unavailable: ${k}`);
  return v;
}
export function splashString(c: SplashMpmConfig, k: string) {
  const v = c[k];
  if (typeof v !== 'string')
    throw new Error(`Splash MPM string setting unavailable: ${k}`);
  return v;
}
function n(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number): NumberSetting {
  return {
    key,
    label,
    section,
    type: 'number',
    min,
    max,
    step,
    default: defaultValue
  };
}
function v(x: NumberSetting, visibleRenderStyles: readonly string[]): NumberSetting {
  return {
    ...x,
    visibleRenderStyles
  };
}
function m(x: NumberSetting, visibleModes: readonly string[]): NumberSetting {
  return {
    ...x,
    visibleModes
  };
}
