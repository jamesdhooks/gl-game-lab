import type { ExperienceSetting, ExperienceSettingValue, NumberSetting } from '@hooksjam/gl-game-lab-engine';

export type LavaLampConfig = Readonly<Record<string, ExperienceSettingValue>>;

export const LAVA_LAMP_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  { key: 'renderStyle', label: 'Style', section: 'Rendering', type: 'select', options: [{ label: 'Basic', value: 'basic' }, { label: 'Enhanced', value: 'enhanced' }, { label: 'Ultra', value: 'ultra' }], default: 'ultra' },
  { ...number('maxParticles', 'Max Blobs', 'Physics', 64, 1024, 1, 256), numericScale: 'powerOfTwo' },
  { ...number('initialBlobs', 'Initial Blobs', 'Physics', 4, 512, 1, 24), numericScale: 'powerOfTwo' },
  number('blobRadius', 'Blob Radius', 'Physics', 8, 54, 1, 22),
  number('gravity', 'Gravity', 'Physics', 0, 420, 5, 170),
  number('buoyancy', 'Buoyancy', 'Thermal Motion', 80, 1200, 10, 390),
  number('thermalDrive', 'Thermal Drive', 'Thermal Motion', 0, 5, .01, 1),
  number('heatRegion', 'Heat Region', 'Thermal Motion', .05, .75, .01, .42),
  number('coolRegion', 'Cool Region', 'Thermal Motion', .05, .75, .01, .46),
  number('heatRate', 'Heat Rate', 'Thermal Motion', 0, 2, .005, .065),
  number('coolRate', 'Cool Rate', 'Thermal Motion', 0, 2, .005, .095),
  number('heatTransfer', 'Heat Transfer', 'Thermal Motion', 0, .12, .001, .012),
  number('turbulence', 'Turbulence', 'Thermal Motion', 0, 4, .01, .55),
  number('verticalTurbulence', 'Vertical Turbulence', 'Thermal Motion', 0, 4, .01, 1),
  number('waxViscosity', 'Wax Viscosity', 'Thermal Motion', 0, 5, .01, .58),
  number('thermalContrast', 'Thermal Contrast', 'Rendering', 0, 2.5, .05, 1.25),
  render(number('enhancedQuality', 'Surface Detail', 'Enhanced Surface', .5, 2, .05, 1.15), ['enhanced', 'ultra']),
  render(number('liquidFieldScale', 'Field Resolution', 'Enhanced Surface', .45, 1, .01, .82), ['enhanced', 'ultra']),
  render(number('liquidParticleRadius', 'Surface Radius', 'Enhanced Surface', .35, 2.2, .01, 1), ['enhanced', 'ultra']),
  render(number('liquidExpansion', 'Expansion Factor', 'Enhanced Surface', .25, 2.5, .01, 1), ['enhanced', 'ultra']),
  render(number('liquidSplatDensity', 'Splat Density', 'Enhanced Surface', .35, 3.4, .01, 1.55), ['enhanced', 'ultra']),
  render(number('liquidSurfaceThreshold', 'Surface Threshold', 'Enhanced Surface', .04, .42, .005, .11), ['enhanced', 'ultra']),
  render(number('liquidEdgeTightness', 'Edge Tightness', 'Enhanced Surface', .15, 1, .01, .76), ['enhanced', 'ultra']),
  render(number('liquidEdgeSoftness', 'Edge Softness', 'Enhanced Surface', 0, 2, .01, .56), ['enhanced', 'ultra']),
  render(number('liquidRefraction', 'Refraction', 'Enhanced Surface', 0, 1, .01, .32), ['enhanced', 'ultra']),
  render(number('liquidGloss', 'Specular Gloss', 'Enhanced Surface', 0, 1, .01, .72), ['enhanced', 'ultra']),
  render(number('liquidThermalStrength', 'Thermal Color', 'Enhanced Surface', 0, 1, .01, .82), ['enhanced', 'ultra']),
  render(number('liquidRimLighting', 'Rim Lighting', 'Enhanced Surface', 0, 3, .01, 1.15), ['ultra']),
  render(number('liquidBloomStrength', 'Soft Bloom', 'Enhanced Surface', 0, 3, .01, .42), ['ultra']),
  render(number('liquidHeatShimmer', 'Heat Shimmer', 'Enhanced Surface', 0, 2, .01, .28), ['ultra']),
  render(number('liquidDepthDiffusion', 'Depth Diffusion', 'Enhanced Surface', 0, 1, .01, .22), ['ultra']),
  number('surfaceTension', 'Surface Tension', 'Physics', 0, 1, .01, .62),
  number('clumping', 'Clumping', 'Physics', 0, 1.5, .01, .38),
  mode(number('inputRadius', 'Brush Radius', 'Input Mode', 24, 220, 2, 92), ['add', 'remove']),
  mode(number('inputLift', 'Add Lift', 'Input Mode', 40, 720, 10, 110), ['add']),
  mode(number('inputThermalRate', 'Add Heat', 'Input Mode', .01, .28, .005, .055), ['add']),
  number('metaballBlend', 'Metaball Blend', 'Rendering', 0, 1, .01, .86),
  number('opacity', 'Opacity', 'Rendering', .05, 1, .01, .46),
  number('substeps', 'Substeps', 'Physics', 1, 4, 1, 2),
]);

export const LAVA_LAMP_DEFAULTS: LavaLampConfig = Object.freeze({ timeScale: 1, ...Object.fromEntries(LAVA_LAMP_SETTINGS.map((setting) => [setting.key, setting.default])) });

export function createLavaLampConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): LavaLampConfig {
  const result: Record<string, ExperienceSettingValue> = { ...LAVA_LAMP_DEFAULTS };
  for (const setting of LAVA_LAMP_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max)) throw new Error(`Lava Lamp setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some((option) => option.value === value)) throw new Error(`Unknown Lava Lamp ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  if (values.timeScale !== undefined) {
    if (typeof values.timeScale !== 'number' || !Number.isFinite(values.timeScale) || values.timeScale < 0 || values.timeScale > 2) throw new Error('Lava Lamp timeScale is outside its supported range');
    result.timeScale = values.timeScale;
  }
  return Object.freeze(result);
}

export function lavaNumber(config: LavaLampConfig, key: string): number { const value = config[key]; if (typeof value !== 'number') throw new Error(`Lava Lamp numeric setting unavailable: ${key}`); return value; }
export function lavaString(config: LavaLampConfig, key: string): string { const value = config[key]; if (typeof value !== 'string') throw new Error(`Lava Lamp string setting unavailable: ${key}`); return value; }
function number(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number): NumberSetting { return Object.freeze({ key, label, section, type: 'number', min, max, step, default: defaultValue }); }
function render(setting: NumberSetting, visibleRenderStyles: readonly string[]): NumberSetting { return Object.freeze({ ...setting, visibleRenderStyles }); }
function mode(setting: NumberSetting, visibleModes: readonly string[]): NumberSetting { return Object.freeze({ ...setting, visibleModes }); }
