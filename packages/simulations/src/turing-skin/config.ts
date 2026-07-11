import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
export interface TuringSkinConfig {
  readonly renderStyle: 'spots' | 'bands';
  readonly timeScale: number;
  readonly resolution: number;
  readonly feedRate: number;
  readonly killRate: number;
  readonly diffusionA: number;
  readonly diffusionB: number;
  readonly brushStrength: number;
}
export const TURING_SKIN_DEFAULTS: TuringSkinConfig = Object.freeze({
  renderStyle: 'spots',
  timeScale: 1,
  resolution: 128,
  feedRate: 0.044,
  killRate: 0.06,
  diffusionA: 1,
  diffusionB: 0.46,
  brushStrength: 0.75
});
export const TURING_SKIN_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Pattern',
    section: 'Rendering',
    type: 'select',
    default: 'spots',
    options: [
      {
        label: 'Animal Spots',
        value: 'spots'
      },
      {
        label: 'Zebra Bands',
        value: 'bands'
      }
    ]
  },
  n('timeScale', 'Timescale', 'Simulation', 0, 2, 0.05, 1),
  {
    ...n('resolution', 'Resolution', 'Simulation', 64, 4096, 1, 128),
    numericScale: 'powerOfTwo'
  },
  n('feedRate', 'Pattern Growth', 'Chemistry', 0.018, 0.082, 0.001, 0.044),
  n('killRate', 'Pattern Breakup', 'Chemistry', 0.042, 0.074, 0.001, 0.06),
  n('diffusionA', 'Background Spread', 'Chemistry', 0.55, 1.25, 0.01, 1),
  n('diffusionB', 'Pigment Spread', 'Chemistry', 0.18, 0.72, 0.01, 0.46),
  n('brushStrength', 'Paint Strength', 'Input Mode', 0.15, 1.8, 0.05, 0.75, [
    'paint',
    'erase'
  ])
]);
export function createTuringSkinConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): TuringSkinConfig {
  const renderStyle = values.renderStyle ?? TURING_SKIN_DEFAULTS.renderStyle;
  if (renderStyle !== 'spots' && renderStyle !== 'bands')
    throw new Error(`Unknown Turing Skin pattern: ${String(renderStyle)}`);
  const result: Record<string, number | string> = {
    renderStyle
  };
  for (const setting of TURING_SKIN_SETTINGS)
    if (setting.type === 'number') {
      const value = values[setting.key] ?? setting.default;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max)
        throw new Error(`Turing Skin setting ${setting.key} is outside its supported range`);
      result[setting.key] = value;
    }
  return Object.freeze(result) as unknown as TuringSkinConfig;
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
