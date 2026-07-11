import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';

export type HarmonicRenderStyle = 'basic' | 'enhanced' | 'ultra';

export interface HarmonicSandConfig {
  readonly renderStyle: HarmonicRenderStyle;
  readonly resolution: number;
  readonly baseFrequency: number;
  readonly wavePeriod: number;
  readonly rawParticleCount: number;
  readonly rawParticleDensity: number;
  readonly rawEmitterLimit: number;
  readonly rawLineSharpness: number;
  readonly rawGlow: number;
}

export const HARMONIC_SAND_DEFAULTS: HarmonicSandConfig = Object.freeze({
  renderStyle: 'ultra', resolution: 128, baseFrequency: 2.4, wavePeriod: 1,
  rawParticleCount: 262_144, rawParticleDensity: 1.25, rawEmitterLimit: 10,
  rawLineSharpness: 1.8, rawGlow: 1.35,
});

export const HARMONIC_SAND_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  { key: 'renderStyle', label: 'Style', section: 'Rendering', type: 'select', default: 'ultra', options: [
    { label: 'Basic', value: 'basic' }, { label: 'Enhanced', value: 'enhanced' }, { label: 'Ultra', value: 'ultra' },
  ] },
  { key: 'resolution', label: 'Resolution', section: 'Simulation', type: 'number', min: 32, max: 2048, step: 1, numericScale: 'powerOfTwo', default: 128 },
  { key: 'baseFrequency', label: 'Base Frequency', section: 'Simulation', type: 'number', min: 0.1, max: 10, step: 0.1, default: 2.4 },
  { key: 'wavePeriod', label: 'Wave Period', section: 'Simulation', type: 'number', min: 1, max: 6, step: 0.1, default: 1 },
  { key: 'rawParticleCount', label: 'Particle Count', section: 'Rendering', type: 'number', min: 32_768, max: 2_097_152, step: 1, numericScale: 'powerOfTwo', default: 262_144 },
  { key: 'rawParticleDensity', label: 'Particle Density', section: 'Rendering', type: 'number', min: 0.35, max: 8, step: 0.05, default: 1.25 },
  { key: 'rawEmitterLimit', label: 'Source Limit', section: 'Input Mode', type: 'number', min: 1, max: 16, step: 1, default: 10 },
  { key: 'rawLineSharpness', label: 'Line Sharpness', section: 'Rendering', type: 'number', min: 0, max: 3.5, step: 0.05, default: 1.8 },
  { key: 'rawGlow', label: 'Glow', section: 'Rendering', type: 'number', min: 0.25, max: 30, step: 0.05, default: 1.35 },
]);

export function createHarmonicSandConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): HarmonicSandConfig {
  const renderStyle = values.renderStyle ?? HARMONIC_SAND_DEFAULTS.renderStyle;
  if (renderStyle !== 'basic' && renderStyle !== 'enhanced' && renderStyle !== 'ultra') throw new Error(`Unknown Harmonic Sand render style: ${String(renderStyle)}`);
  return Object.freeze({
    renderStyle,
    resolution: numeric(values, 'resolution', 32, 2048),
    baseFrequency: numeric(values, 'baseFrequency', 0.1, 10),
    wavePeriod: numeric(values, 'wavePeriod', 1, 6),
    rawParticleCount: numeric(values, 'rawParticleCount', 32_768, 2_097_152),
    rawParticleDensity: numeric(values, 'rawParticleDensity', 0.35, 8),
    rawEmitterLimit: Math.round(numeric(values, 'rawEmitterLimit', 1, 16)),
    rawLineSharpness: numeric(values, 'rawLineSharpness', 0, 3.5),
    rawGlow: numeric(values, 'rawGlow', 0.25, 30),
  });
}

function numeric(values: Readonly<Record<string, ExperienceSettingValue>>, key: keyof HarmonicSandConfig, min: number, max: number): number {
  const value = values[key] ?? HARMONIC_SAND_DEFAULTS[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Harmonic Sand setting ${key} is outside its supported range`);
  return value;
}
