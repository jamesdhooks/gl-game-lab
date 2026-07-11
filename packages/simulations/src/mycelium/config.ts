import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
export type MyceliumConfig = Readonly<Record<string, ExperienceSettingValue>>;
export const MYCELIUM_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Style',
    section: 'Rendering',
    type: 'select',
    default: 'enhanced',
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
        value: 'bloom'
      }
    ]
  },
  {
    key: 'topology',
    label: 'Topology',
    section: 'Simulation',
    type: 'select',
    default: 'triangle',
    options: [
      {
        label: 'Triangle',
        value: 'triangle'
      },
      {
        label: 'Square',
        value: 'square'
      }
    ]
  },
  n('timeScale', 'Timescale', 'Simulation', 0, 2, 0.05, 1),
  {
    ...n('resolution', 'Resolution', 'Simulation', 64, 4096, 1, 128),
    numericScale: 'powerOfTwo'
  },
  n('branchChance', 'Branch Chance', 'Growth', 0, 1, 0.01, 0.22),
  n('overwriteChance', 'Overwrite Chance', 'Growth', 0, 1, 0.01, 0.08),
  n('growthClumping', 'Growth Clumping', 'Growth', 0, 1, 0.01, 0.38),
  n('growthRate', 'Growth Rate', 'Growth', 0.05, 8, 0.05, 0.9),
  n('colorMutation', 'Color Mutation', 'Growth', 0, 1, 0.01, 0.32),
  n('colorDriftFrequency', 'Color Drift Frequency', 'Growth', 0, 1, 0.01, 0.08),
  n('branchColorSplit', 'Branch Color Split', 'Growth', 0, 1, 0.01, 0.45),
  n('substrateColorBias', 'Substrate Color Bias', 'Growth', 0, 1, 0.01, 0.12),
  n('brushRadius', 'Paint Brush Size', 'Input Mode', 0.002, 0.04, 0.001, 0.008, [
    'paint'
  ]),
  n('fieldSpread', 'Spore Glow', 'Rendering', 0.4, 5.5, 0.1, 2.4),
  n('pruneRate', 'Decay Rate', 'Growth', 0.01, 1.4, 0.01, 0.18),
  n('demoSeedColonies', 'Demo Seed Colonies', 'Demo', 0, 16, 1, 0, [
    '__demo__'
  ]),
  n('demoSeedRadius', 'Demo Seed Radius', 'Demo', 0.001, 0.08, 0.001, 0.012, [
    '__demo__'
  ])
]);
export const MYCELIUM_DEFAULTS: MyceliumConfig = Object.freeze(Object.fromEntries(MYCELIUM_SETTINGS.map(setting => [
  setting.key,
  setting.default
])));
export function createMyceliumConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): MyceliumConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...MYCELIUM_DEFAULTS
  };
  for (const setting of MYCELIUM_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Mycelium setting ${setting.key} is outside its supported range`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Mycelium ${setting.label}: ${String(value)}`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function myceliumNumber(config: MyceliumConfig, key: string) {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Mycelium numeric setting unavailable: ${key}`);
  return value;
}
export function myceliumString(config: MyceliumConfig, key: string) {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Mycelium string setting unavailable: ${key}`);
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
