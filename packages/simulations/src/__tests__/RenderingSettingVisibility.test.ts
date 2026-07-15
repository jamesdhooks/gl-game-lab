import type { ExperienceSetting } from '@hooksjam/gl-game-lab-engine';
import { describe, expect, it } from 'vitest';
import { CHAIN_RAIN_SETTINGS } from '../chain-rain/config.js';
import { HARMONIC_SAND_SETTINGS } from '../harmonic-sand/config.js';
import { LAVA_LAMP_SETTINGS } from '../lava-lamp/config.js';
import { MYCELIUM_SETTINGS } from '../mycelium/config.js';
import { SOFT_BODY_BLOB_SETTINGS } from '../soft-body-blob/config.js';
import { SPARKS_SETTINGS } from '../sparks/config.js';
import { SPLASH_MPM_SETTINGS } from '../splash-mpm/config.js';
import { WATER_TANK_SETTINGS } from '../water-tank/config.js';

type StyleExpectation = Readonly<Record<string, readonly string[]>>;

const cases: readonly [string, readonly ExperienceSetting[], StyleExpectation][] = [
  ['Chain Rain', CHAIN_RAIN_SETTINGS, {
    basic: [],
    enhanced: ['skinWidth', 'skinHighlightWidth', 'skinHighlightStrength', 'skinHighlightOpacity'],
    ultra: [
      'liquidFieldScale', 'liquidParticleRadius', 'liquidFillDensity', 'liquidSplatDensity',
      'liquidSurfaceThreshold', 'liquidEdgeTightness', 'liquidEdgeSoftness', 'liquidRefraction',
      'liquidGloss', 'liquidRimLighting', 'liquidFoamStrength', 'liquidThermalStrength',
      'liquidBloomStrength', 'liquidHeatShimmer', 'liquidDepthDiffusion', 'opacity',
    ],
  }],
  ['Harmonic Sand', HARMONIC_SAND_SETTINGS, {
    basic: [],
    enhanced: [],
    ultra: ['rawParticleCount', 'rawParticleDensity', 'rawLineSharpness', 'rawGlow'],
  }],
  ['Lava Lamp', LAVA_LAMP_SETTINGS, {
    basic: ['opacity'],
    enhanced: [
      'thermalContrast', 'enhancedQuality', 'liquidFieldScale', 'liquidParticleRadius',
      'liquidExpansion', 'liquidSplatDensity', 'liquidSurfaceThreshold', 'liquidEdgeTightness',
      'liquidEdgeSoftness', 'liquidRefraction', 'liquidGloss', 'liquidThermalStrength',
      'metaballBlend', 'opacity',
    ],
    ultra: [
      'thermalContrast', 'enhancedQuality', 'liquidFieldScale', 'liquidParticleRadius',
      'liquidExpansion', 'liquidSplatDensity', 'liquidSurfaceThreshold', 'liquidEdgeTightness',
      'liquidEdgeSoftness', 'liquidRefraction', 'liquidGloss', 'liquidThermalStrength',
      'liquidRimLighting', 'liquidBloomStrength', 'liquidHeatShimmer', 'liquidDepthDiffusion',
      'metaballBlend', 'opacity',
    ],
  }],
  ['Mycelium', MYCELIUM_SETTINGS, {
    basic: [],
    enhanced: [],
    bloom: [
      'fieldSpread', 'ultraSurfaceThreshold', 'ultraEdgeSoftness', 'ultraHaloStrength',
      'ultraFiberStrength', 'ultraCoreBrightness', 'ultraRimStrength',
    ],
  }],
  ['Soft Body Blob', SOFT_BODY_BLOB_SETTINGS, {
    basic: ['liquidFillDensity', 'fillerScale'],
    enhanced: ['skinSmoothing'],
    ultra: [
      'liquidFieldScale', 'liquidParticleRadius', 'liquidFillDensity', 'fillerScale', 'liquidSplatDensity',
      'liquidSurfaceThreshold', 'liquidEdgeTightness', 'liquidEdgeSoftness', 'liquidRefraction',
      'liquidGloss', 'liquidRimLighting', 'liquidFoamStrength', 'liquidThermalStrength',
      'liquidBloomStrength', 'liquidHeatShimmer', 'liquidDepthDiffusion', 'opacity',
    ],
  }],
  ['Sparks', SPARKS_SETTINGS, {
    basic: ['rawParticleTextureSize'],
    enhanced: ['rawParticleTextureSize'],
    ultra: ['trailFade', 'bloomStrength', 'rawParticleTextureSize'],
  }],
  ['Splash PIC/FLIP', SPLASH_MPM_SETTINGS, {
    basic: ['opacity'],
    enhanced: [
      'surfaceSmoothing', 'opacity', 'enhancedQuality', 'enhancedSplatSize', 'enhancedDepth', 'enhancedEdge',
      'liquidFieldScale', 'liquidSurfaceThreshold', 'liquidEdgeTightness', 'liquidEdgeSoftness',
      'liquidSplatDensity', 'liquidParticleRadius', 'liquidRefraction', 'liquidGloss',
    ],
    ultra: [
      'surfaceSmoothing', 'opacity', 'enhancedQuality', 'enhancedSplatSize', 'enhancedDepth', 'enhancedEdge',
      'liquidFieldScale', 'liquidSurfaceThreshold', 'liquidEdgeTightness', 'liquidEdgeSoftness',
      'liquidSplatDensity', 'liquidParticleRadius', 'liquidRefraction', 'liquidGloss',
      'liquidFoamStrength', 'liquidBloomStrength', 'liquidHeatShimmer', 'liquidDepthDiffusion',
    ],
  }],
  ['Water Tank', WATER_TANK_SETTINGS, {
    basic: ['opacity'],
    enhanced: [
      'fluidGridResolution', 'metaballBlend', 'liquidFieldScale', 'liquidSurfaceThreshold',
      'liquidEdgeTightness', 'liquidEdgeSoftness', 'liquidSplatDensity', 'liquidParticleRadius',
      'liquidRefraction', 'liquidGloss', 'opacity',
    ],
    ultra: [
      'fluidGridResolution', 'metaballBlend', 'liquidFieldScale', 'liquidSurfaceThreshold',
      'liquidEdgeTightness', 'liquidEdgeSoftness', 'liquidSplatDensity', 'liquidParticleRadius',
      'liquidRefraction', 'liquidGloss', 'liquidFoamStrength', 'liquidBloomStrength',
      'liquidHeatShimmer', 'liquidDepthDiffusion', 'opacity',
    ],
  }],
];

describe('style-specific rendering settings', () => {
  it.each(cases)('shows only controls consumed by the selected %s renderer', (_name, settings, expected) => {
    for (const [style, keys] of Object.entries(expected)) {
      expect(visibleRenderingKeys(settings, style)).toEqual(keys);
    }
  });
});

function visibleRenderingKeys(settings: readonly ExperienceSetting[], renderStyle: string): string[] {
  return settings
    .filter(setting => setting.section === 'Rendering')
    .filter(setting => setting.key !== 'renderStyle')
    .filter(setting => !setting.visibleRenderStyles || setting.visibleRenderStyles.includes(renderStyle))
    .map(setting => setting.key);
}
