import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { METABALL_SPLAT_DENSITY_MAX } from '../MetaballSurfaceSettings.js';
export type ChainRainConfig = Readonly<Record<string, ExperienceSettingValue>>;
const rendering = 'Rendering', physics = 'Physics';
export const CHAIN_RAIN_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Style',
    section: rendering,
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
    ...n('maxNodes', 'Max Nodes', physics, 2048, 131072, 1, 32768),
    numericScale: 'powerOfTwo',
    advanced: true
  },
  n('nodeRadius', 'Node Radius', physics, 2, 12, 0.25, 5),
  n('nodeVariance', 'Node Variance', physics, 0, 1.5, 0.01, 0.28),
  {
    ...n('nodeVarianceWavelength', 'Variance Wavelength', physics, 2, 48, 1, 14),
    advanced: true
  },
  {
    ...n('nodeVarianceRoughness', 'Variance Roughness', physics, 0, 1, 0.01, 0.35),
    advanced: true
  },
  n('chainLength', 'Chain Length', 'Input Mode', 3, 96, 1, 16, [
    'draw'
  ]),
  n('interactionRadius', 'Interaction Radius', 'Input Mode', 16, 240, 2, 56, [
    'interact'
  ]),
  n('gravity', 'Gravity', physics, 0, 3000, 25, 1250),
  n('friction', 'Friction', physics, 0, 1, 0.01, 0.35),
  n('solverPasses', 'Collision Passes', physics, 1, 8, 1, 3),
  n('substeps', 'Substeps', physics, 1, 5, 1, 2),
  n('constraintPasses', 'Link Passes', physics, 1, 8, 1, 2),
  n('constraintStiffness', 'Stiffness', physics, 0.1, 1, 0.01, 0.92),
  {
    ...n('collisionSoftness', 'Softness', physics, 0.05, 1.5, 0.01, 0.82),
    advanced: true
  },
  render(n('skinWidth', 'Skin Width', rendering, 0.75, 2.4, 0.01, 1.08), ['enhanced']),
  render(n('skinHighlightWidth', 'Highlight Width', rendering, 0, 1.4, 0.01, 0.34), ['enhanced']),
  render(n('skinHighlightStrength', 'Highlight Strength', rendering, 0, 1.5, 0.01, 0.72), ['enhanced']),
  render(n('skinHighlightOpacity', 'Highlight Opacity', rendering, 0, 1, 0.01, 0.42), ['enhanced']),
  render(n('liquidFieldScale', 'Liquid Resolution', rendering, 0.35, 1.5, 0.01, 0.78), ['ultra']),
  render(n('liquidParticleRadius', 'Liquid Radius', rendering, 0.55, 7.5, 0.01, 1.45), ['ultra']),
  render(n('liquidFillDensity', 'Bridge Fill', rendering, 0, 3, 0.01, 1.1), ['ultra']),
  render(n('liquidSplatDensity', 'Splat Density', rendering, 0.45, METABALL_SPLAT_DENSITY_MAX, 0.01, 1.14), ['ultra']),
  render(n('liquidSurfaceThreshold', 'Surface Threshold', rendering, 0.04, 0.42, 0.01, 0.16), ['ultra']),
  render(n('liquidEdgeTightness', 'Edge Tightness', rendering, 0, 1, 0.01, 0.76), ['ultra']),
  render(n('liquidEdgeSoftness', 'Edge Softness', rendering, 0, 1, 0.01, 0.46), ['ultra']),
  render(n('liquidRefraction', 'Refraction', rendering, 0, 1.5, 0.01, 0.58), ['ultra']),
  render(n('liquidGloss', 'Specular Gloss', rendering, 0, 1.5, 0.01, 0.68), ['ultra']),
  render(n('liquidRimLighting', 'Rim Lighting', rendering, 0, 2.5, 0.01, 0.72), ['ultra']),
  render(n('liquidFoamStrength', 'Sparkle Foam', rendering, 0, 3, 0.01, 0.34), ['ultra']),
  render(n('liquidThermalStrength', 'Palette Flow', rendering, 0, 1, 0.01, 0.42), ['ultra']),
  render(n('liquidBloomStrength', 'Bloom', rendering, 0, 3, 0.01, 0.26), ['ultra']),
  render(n('liquidHeatShimmer', 'Heat Shimmer', rendering, 0, 2, 0.01, 0.14), ['ultra']),
  render(n('liquidDepthDiffusion', 'Depth Diffusion', rendering, 0, 1, 0.01, 0.18), ['ultra']),
  render(n('opacity', 'Opacity', rendering, 0.2, 1, 0.01, 0.86), ['ultra']),
]);
export const CHAIN_RAIN_DEFAULTS: ChainRainConfig = Object.freeze(Object.fromEntries(CHAIN_RAIN_SETTINGS.map(setting => [
  setting.key,
  setting.default
])));
export function createChainRainConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): ChainRainConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...CHAIN_RAIN_DEFAULTS
  };
  for (const setting of CHAIN_RAIN_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Chain Rain setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Chain Rain ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function chainNumber(config: ChainRainConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Chain Rain numeric setting is unavailable: ${key}`);
  return value;
}
export function chainString(config: ChainRainConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Chain Rain string setting is unavailable: ${key}`);
  return value;
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
function render(setting: ExperienceSetting, visibleRenderStyles: readonly string[]): ExperienceSetting {
  return Object.freeze({
    ...setting,
    visibleRenderStyles
  });
}
