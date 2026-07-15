import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
import { METABALL_SPLAT_DENSITY_MAX } from '../MetaballSurfaceSettings.js';
export type SoftBodyBlobConfig = Readonly<Record<string, ExperienceSettingValue>>;
const rendering = 'Rendering', physics = 'Physics';
export const SOFT_BODY_BLOB_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
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
  n('blobSize', 'Blob Size', physics, 18, 82, 1, 42),
  n('nodeDensity', 'Node Density', physics, 0.35, 2.5, 0.05, 1),
  n('interactionRadius', 'Interaction Radius', 'Input Mode', 16, 280, 2, 72, [
    'interact'
  ]),
  n('drawSmoothing', 'Draw Smoothing', 'Input Mode', 0, 1, 0.01, 0.45, [
    'draw'
  ]),
  n('gravity', 'Gravity', physics, 0, 2400, 25, 1250),
  n('viscosity', 'Viscosity', physics, 0, 1, 0.01, 0.64),
  n('surfaceTension', 'Surface Tension', physics, 0, 1, 0.01, 0.28),
  n('plasticFlow', 'Plastic Flow', physics, 0, 1, 0.01, 0.18),
  n('boundaryElasticity', 'Boundary Elasticity', physics, 0, 10, 0.01, 0.8),
  n('shapeRigidity', 'Shape Rigidity', physics, 0, 20, 0.1, 1),
  n('membraneDamping', 'Membrane Damping', physics, 0, 1, 0.01, 0.28),
  n('areaPressure', 'Area Pressure', physics, 0, 2, 0.01, 1),
  render(n('skinSmoothing', 'Skin Smoothing', rendering, 0, 0.85, 0.01, 0.46), ['enhanced']),
  render(n('liquidFieldScale', 'Liquid Resolution', rendering, 0.35, 1.5, 0.01, 0.82), ['ultra']),
  render(n('liquidParticleRadius', 'Liquid Radius', rendering, 0.55, 7.5, 0.01, 1.35), ['ultra']),
  render(n('liquidFillDensity', 'Filler Density', rendering, 0, 3, 0.01, 1.15), ['basic', 'ultra']),
  render(n('fillerScale', 'Filler Scale', rendering, 0, 2, 0.01, 1), ['basic', 'ultra']),
  render(n('liquidSplatDensity', 'Splat Density', rendering, 0.45, METABALL_SPLAT_DENSITY_MAX, 0.01, 1.2), ['ultra']),
  render(n('liquidSurfaceThreshold', 'Surface Threshold', rendering, 0.04, 0.42, 0.01, 0.17), ['ultra']),
  render(n('liquidEdgeTightness', 'Edge Tightness', rendering, 0, 1, 0.01, 0.72), ['ultra']),
  render(n('liquidEdgeSoftness', 'Edge Softness', rendering, 0, 1, 0.01, 0.54), ['ultra']),
  render(n('liquidRefraction', 'Refraction', rendering, 0, 1.5, 0.01, 0.64), ['ultra']),
  render(n('liquidGloss', 'Specular Gloss', rendering, 0, 1.5, 0.01, 0.72), ['ultra']),
  render(n('liquidRimLighting', 'Rim Lighting', rendering, 0, 2.5, 0.01, 0.82), ['ultra']),
  render(n('liquidFoamStrength', 'Sparkle Foam', rendering, 0, 3, 0.01, 0.38), ['ultra']),
  render(n('liquidThermalStrength', 'Palette Flow', rendering, 0, 1, 0.01, 0.48), ['ultra']),
  render(n('liquidBloomStrength', 'Bloom', rendering, 0, 3, 0.01, 0.3), ['ultra']),
  render(n('liquidHeatShimmer', 'Heat Shimmer', rendering, 0, 2, 0.01, 0.18), ['ultra']),
  render(n('liquidDepthDiffusion', 'Depth Diffusion', rendering, 0, 1, 0.01, 0.24), ['ultra']),
  render(n('opacity', 'Opacity', rendering, 0.2, 1, 0.01, 0.86), ['ultra']),
  n('substeps', 'Substeps', physics, 1, 5, 1, 2),
  n('constraintPasses', 'Shape Passes', physics, 2, 14, 1, 7),
  n('squishiness', 'Squishiness', physics, 0, 2, 0.01, 0.78)
]);
export const SOFT_BODY_BLOB_DEFAULTS: SoftBodyBlobConfig = Object.freeze(Object.fromEntries(SOFT_BODY_BLOB_SETTINGS.map(setting => [
  setting.key,
  setting.default
])));
export function createSoftBodyBlobConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): SoftBodyBlobConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...SOFT_BODY_BLOB_DEFAULTS
  };
  for (const setting of SOFT_BODY_BLOB_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Soft Body Blob setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Soft Body Blob ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function blobNumber(config: SoftBodyBlobConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Soft Body Blob numeric setting is unavailable: ${key}`);
  return value;
}
export function blobString(config: SoftBodyBlobConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Soft Body Blob string setting is unavailable: ${key}`);
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
