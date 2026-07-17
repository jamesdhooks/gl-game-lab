import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';

export type FireworksRenderStyle = 'basic' | 'enhanced' | 'ultra';
export type FireworksBurstPattern = 'peony' | 'ring' | 'chrysanthemum' | 'willow' | 'palm' | 'spiral' | 'crossette' | 'comet';
export type FireworksColorMode = 'shell' | 'radial-gradient' | 'over-life' | 'secondary-accent';

export interface FireworksConfig {
  readonly launchPower: number; readonly launchSpread: number; readonly shellFuse: number;
  readonly gravity: number; readonly airDrag: number; readonly burstParticles: number;
  readonly burstChaos: number; readonly explosionPower: number; readonly burstPattern: FireworksBurstPattern;
  readonly patternVariation: number; readonly secondaryChance: number; readonly secondaryDepth: number;
  readonly secondaryScale: number; readonly secondaryCount: number; readonly secondaryDelay: number;
  readonly secondaryInheritance: number; readonly secondarySpread: number; readonly secondaryPowerScale: number;
  readonly crackleIntensity: number; readonly terminalSparkleProbability: number; readonly terminalSparkleCount: number;
  readonly terminalSparklePower: number; readonly terminalSparkleLifetime: number; readonly terminalSparkleSize: number;
  readonly particleSize: number; readonly particleLength: number; readonly sparkSizeVariability: number;
  readonly paletteTransition: number; readonly colorMode: FireworksColorMode; readonly renderStyle: FireworksRenderStyle;
  readonly trailFade: number; readonly trailContinuity: number; readonly particleFidelity: number; readonly trailFidelity: number;
  readonly bloomStrength: number; readonly bloomThreshold: number; readonly bloomRadius: number; readonly bloomFidelity: number; readonly bloomSamples: number;
  readonly environmentLight: number; readonly lightShafts: number; readonly shaftLength: number; readonly heatDistortion: number;
  readonly lightingFidelity: number; readonly lightRadius: number; readonly autoFinaleRate: number; readonly rawParticleTextureSize: string;
}

export const FIREWORKS_DEFAULTS: FireworksConfig = Object.freeze({
  launchPower: 940, launchSpread: 0.18, shellFuse: 1.28, gravity: 360, airDrag: 0.34,
  burstParticles: 512, burstChaos: 0.82, explosionPower: 360, burstPattern: 'peony', patternVariation: 0.34,
  secondaryChance: 0.42, secondaryDepth: 2, secondaryScale: 0.54, secondaryCount: 5, secondaryDelay: 0.48,
  secondaryInheritance: 0.32, secondarySpread: 0.72, secondaryPowerScale: 0.56,
  crackleIntensity: 0.78, terminalSparkleProbability: 0.52, terminalSparkleCount: 7,
  terminalSparklePower: 92, terminalSparkleLifetime: 0.58, terminalSparkleSize: 0.82,
  particleSize: 1.45, particleLength: 1.2, sparkSizeVariability: 0.38,
  paletteTransition: 0.72, colorMode: 'over-life', renderStyle: 'ultra',
  trailFade: 0.932, trailContinuity: 0.9, particleFidelity: 1, trailFidelity: 0.75,
  bloomStrength: 2.2, bloomThreshold: 0.72, bloomRadius: 1.2, bloomFidelity: 0.5, bloomSamples: 4,
  environmentLight: 0.58, lightShafts: 0.18, shaftLength: 0.72, heatDistortion: 0.05,
  lightingFidelity: 0.5, lightRadius: 240, autoFinaleRate: 2.6, rawParticleTextureSize: '384',
});

const enhancedUltra = ['enhanced', 'ultra'] as const;

export const FIREWORKS_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  number('launchPower', 'Launch Power', 'Launch', 420, 1560, 20, 940),
  number('launchSpread', 'Origin Spread', 'Launch', 0, 0.62, 0.01, 0.18),
  number('shellFuse', 'Target Fuse Time', 'Launch', 0.55, 2.8, 0.05, 1.28),
  number('gravity', 'Gravity', 'Physics', 120, 760, 10, 360),
  number('airDrag', 'Air Drag', 'Physics', 0, 1.8, 0.05, 0.34),
  { ...number('burstParticles', 'Burst Particle Budget', 'Primary Burst', 16, 131_072, 1, 512), numericScale: 'powerOfTwo' },
  select('burstPattern', 'Burst Pattern', 'Primary Burst', 'peony', [
    ['Peony', 'peony'], ['Ring', 'ring'], ['Chrysanthemum', 'chrysanthemum'], ['Willow', 'willow'],
    ['Palm', 'palm'], ['Spiral', 'spiral'], ['Crossette', 'crossette'], ['Comet', 'comet'],
  ]),
  number('patternVariation', 'Pattern Variation', 'Primary Burst', 0, 1, 0.01, 0.34),
  number('burstChaos', 'Burst Chaos', 'Primary Burst', 0, 1, 0.01, 0.82),
  number('explosionPower', 'Burst Power', 'Primary Burst', 90, 720, 10, 360),
  number('secondaryChance', 'Secondary Chance', 'Secondary Burst', 0, 0.95, 0.01, 0.42),
  number('secondaryDepth', 'Generation Depth', 'Secondary Burst', 0, 3, 1, 2),
  number('secondaryScale', 'Particle Scale', 'Secondary Burst', 0.18, 0.9, 0.01, 0.54),
  number('secondaryCount', 'Children Per Event', 'Secondary Burst', 1, 32, 1, 5),
  number('secondaryDelay', 'Event Delay', 'Secondary Burst', 0.12, 0.9, 0.01, 0.48),
  number('secondaryInheritance', 'Velocity Inheritance', 'Secondary Burst', 0, 1, 0.01, 0.32),
  number('secondarySpread', 'Secondary Spread', 'Secondary Burst', 0.05, 1, 0.01, 0.72),
  number('secondaryPowerScale', 'Secondary Power', 'Secondary Burst', 0.1, 1.25, 0.01, 0.56),
  number('terminalSparkleProbability', 'Sparkle Chance', 'Terminal Sparkle', 0, 1, 0.01, 0.52),
  number('terminalSparkleCount', 'Sparkle Count', 'Terminal Sparkle', 0, 32, 1, 7),
  number('terminalSparklePower', 'Sparkle Power', 'Terminal Sparkle', 0, 240, 2, 92),
  number('terminalSparkleLifetime', 'Sparkle Lifespan', 'Terminal Sparkle', 0.12, 1.8, 0.02, 0.58),
  number('terminalSparkleSize', 'Sparkle Size', 'Terminal Sparkle', 0.2, 3.8, 0.02, 0.82),
  number('crackleIntensity', 'Crackle Flicker', 'Terminal Sparkle', 0, 1.5, 0.05, 0.78),
  number('particleSize', 'Spark Size', 'Rendering', 0.45, 3.8, 0.05, 1.45),
  { ...number('particleLength', 'Spark Length', 'Rendering', 0, 4, 0.05, 1.2), visibleRenderStyles: enhancedUltra },
  number('sparkSizeVariability', 'Spark Size Variability', 'Rendering', 0, 2, 0.01, 0.38),
  select('colorMode', 'Color Mode', 'Rendering', 'over-life', [
    ['Per Shell', 'shell'], ['Radial Gradient', 'radial-gradient'], ['Color Over Life', 'over-life'], ['Secondary Accent', 'secondary-accent'],
  ]),
  number('paletteTransition', 'Palette Transition', 'Rendering', 0, 1, 0.01, 0.72),
  select('renderStyle', 'Render Style', 'Rendering', 'ultra', [['Basic', 'basic'], ['Enhanced', 'enhanced'], ['Ultra', 'ultra']]),
  { ...number('trailFade', 'Trail Persistence', 'Rendering', 0.72, 0.995, 0.005, 0.932), visibleRenderStyles: enhancedUltra },
  { ...number('trailContinuity', 'Trail Continuity', 'Rendering', 0, 4, 0.01, 0.9), visibleRenderStyles: enhancedUltra },
  { ...number('particleFidelity', 'Particle Fidelity', 'Rendering', 0.25, 1, 0.05, 1), visibleRenderStyles: ['ultra'] },
  { ...number('trailFidelity', 'Trail Fidelity', 'Rendering', 0.25, 1, 0.05, 0.75), visibleRenderStyles: ['ultra'] },
  { ...number('bloomStrength', 'Bloom Strength', 'Rendering', 0, 7.2, 0.05, 2.2), visibleRenderStyles: ['ultra'] },
  { ...number('bloomThreshold', 'Bloom Threshold', 'Rendering', 0, 1, 0.01, 0.72), visibleRenderStyles: ['ultra'] },
  { ...number('bloomRadius', 'Bloom Radius', 'Rendering', 0.25, 8, 0.05, 1.2), visibleRenderStyles: ['ultra'] },
  { ...number('bloomFidelity', 'Bloom Fidelity', 'Rendering', 0.125, 1, 0.025, 0.5), visibleRenderStyles: ['ultra'] },
  { ...number('bloomSamples', 'Bloom Samples', 'Rendering', 1, 8, 1, 4), visibleRenderStyles: ['ultra'] },
  { ...number('environmentLight', 'Environmental Light', 'Rendering', 0, 3, 0.01, 0.58), visibleRenderStyles: ['ultra'] },
  { ...number('lightShafts', 'Light Shafts', 'Rendering', 0, 2, 0.01, 0.18), visibleRenderStyles: ['ultra'] },
  { ...number('shaftLength', 'Shaft Length', 'Rendering', 0.05, 2, 0.01, 0.72), visibleRenderStyles: ['ultra'] },
  { ...number('heatDistortion', 'Heat Distortion', 'Rendering', 0, 1, 0.01, 0.05), visibleRenderStyles: ['ultra'] },
  { ...number('lightingFidelity', 'Lighting Fidelity', 'Rendering', 0.125, 1, 0.025, 0.5), visibleRenderStyles: ['ultra'] },
  { ...number('lightRadius', 'Light Radius', 'Rendering', 32, 640, 4, 240), visibleRenderStyles: ['ultra'] },
  { ...number('autoFinaleRate', 'Stream Rate', 'Input Mode', 0.2, 6, 0.1, 2.6), visibleModes: ['stream'] },
  { key: 'rawParticleTextureSize', label: 'GPU Particle Capacity', section: 'Rendering', type: 'select', default: '384', advanced: true, options: [
    { label: '128² = 16k preview', value: '128' }, { label: '256² = 65k light', value: '256' },
    { label: '384² = 147k reference', value: '384' }, { label: '512² = 262k dense', value: '512' },
    { label: '768² = 590k stream', value: '768' }, { label: '1024² = 1.05M extreme', value: '1024' },
  ] },
]);

export function createFireworksConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): FireworksConfig {
  const result: Record<string, number | string> = {};
  for (const setting of FIREWORKS_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max) throw new Error(`Fireworks setting ${setting.key} is outside its supported range`);
      result[setting.key] = value;
    } else if (setting.type === 'select') {
      const text = String(value);
      if (!setting.options.some((option) => option.value === text)) throw new Error(`Unknown Fireworks setting ${setting.key}: ${text}`);
      result[setting.key] = text;
    }
  }
  return Object.freeze(result) as unknown as FireworksConfig;
}

function number(key: string, label: string, section: string, min: number, max: number, step: number, defaultValue: number) {
  return Object.freeze({ key, label, section, type: 'number' as const, min, max, step, default: defaultValue });
}

function select(key: string, label: string, section: string, defaultValue: string, options: readonly (readonly [string, string])[]) {
  return Object.freeze({ key, label, section, type: 'select' as const, default: defaultValue, options: options.map(([optionLabel, value]) => ({ label: optionLabel, value })) });
}
