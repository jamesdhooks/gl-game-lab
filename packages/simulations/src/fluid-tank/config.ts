import type { ExperienceSetting, ExperienceSettingValue } from '@hooksjam/gl-game-lab-engine';
export type FluidTankConfig = Readonly<Record<string, ExperienceSettingValue>>;
export const FLUID_TANK_SETTINGS: readonly ExperienceSetting[] = Object.freeze([
  {
    key: 'renderStyle',
    label: 'Initialization',
    section: 'Initialization',
    description: 'Chooses the GPU dye initialization texture.',
    type: 'select',
    default: 'cloud',
    options: [
      {
        label: 'Cloud',
        value: 'cloud'
      },
      {
        label: 'Voronoi',
        value: 'voronoi'
      },
      {
        label: 'Random',
        value: 'random'
      },
      {
        label: 'Blank',
        value: 'blank'
      },
      {
        label: 'Image',
        value: 'image'
      }
    ]
  },
  n('cellSize', 'Cell Size', 'Simulation', 0.25, 3.2, 0.05, 1.2),
  n('viscosity', 'Viscosity', 'Simulation', 0, 1, 0.01, 0.22),
  n('curl', 'Vorticity', 'Simulation', 0, 60, 0.5, 30),
  n('velocityPersistence', 'Velocity Dissipation', 'Simulation', 0, 1, 0.01, 0.2),
  n('dyePersistence', 'Density Dissipation', 'Simulation', 0, 2, 0.01, 1),
  n('pressureIterations', 'Pressure Solve', 'Simulation', 10, 36, 1, 24),
  {
    key: 'ambient',
    label: 'Ambient Stir',
    section: 'Simulation',
    type: 'boolean',
    default: false
  },
  n('shadingStrength', 'Surface Shading', 'Visual Style', 0, 1, 0.01, 1),
  n('bloomStrength', 'Bloom', 'Visual Style', 0, 1.8, 0.01, 0.8),
  n('bloomThreshold', 'Bloom Threshold', 'Visual Style', 0.08, 1.4, 0.01, 0.6),
  n('sunraysStrength', 'Sun Rays', 'Visual Style', 0, 1, 0.01, 1),
  n('fingerForce', 'Stir Force', 'Input Mode', 1, 80, 0.5, 18, [
    'stir',
    'inject'
  ]),
  n('fingerRadius', 'Input Radius', 'Input Mode', 0.01, 0.09, 0.001, 0.05, [
    'stir',
    'inject'
  ]),
  n('eddyAssist', 'Eddy Assist', 'Input Mode', 0, 0.35, 0.01, 0, [
    'stir'
  ]),
  n('injectAmount', 'Ink Amount', 'Input Mode', 0, 2, 0.01, 1, [
    'inject'
  ]),
  n('injectTurbulence', 'Ink Turbulence', 'Input Mode', 0, 1.5, 0.01, 0.45, [
    'inject'
  ]),
  {
    key: 'injectPalette',
    label: 'Inject Color',
    section: 'Input Mode',
    type: 'select',
    default: 'style',
    visibleModes: [
      'inject'
    ],
    options: [
      'style',
      'cyan',
      'magenta',
      'amber',
      'green',
      'blue',
      'red',
      'white',
      'rainbow'
    ].map(value => ({
      label: value === 'style' ? 'Palette' : value[0]?.toUpperCase() + value.slice(1),
      value
    }))
  },
  {
    key: 'initImageUrl',
    label: 'Image Source',
    section: 'Initialization',
    description: 'Optional direct image URL.',
    type: 'string',
    default: '',
    visibleRenderStyles: [
      'image'
    ],
    placeholder: 'https://\u2026'
  }
]);
export const FLUID_TANK_DEFAULTS: FluidTankConfig = Object.freeze({
  timescale: 1,
  ...Object.fromEntries(FLUID_TANK_SETTINGS.map(setting => [
    setting.key,
    setting.default
  ])),
  screensaverMs: 60000
});
export function createFluidTankConfig(values: Readonly<Record<string, ExperienceSettingValue>> = {}): FluidTankConfig {
  const result: Record<string, ExperienceSettingValue> = {
    ...FLUID_TANK_DEFAULTS
  };
  for (const setting of FLUID_TANK_SETTINGS) {
    const value = values[setting.key] ?? setting.default;
    if (setting.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < setting.min || value > setting.max))
      throw new Error(`Fluid Tank setting ${setting.key} is outside its supported range`);
    if (setting.type === 'boolean' && typeof value !== 'boolean')
      throw new Error(`Fluid Tank setting ${setting.key} must be boolean`);
    if (setting.type === 'select' && !setting.options.some(option => option.value === value))
      throw new Error(`Unknown Fluid Tank ${setting.label}: ${String(value)}`);
    if (setting.type === 'string' && typeof value !== 'string')
      throw new Error(`Fluid Tank setting ${setting.key} must be text`);
    result[setting.key] = value;
  }
  return Object.freeze(result);
}
export function fluidNumber(config: FluidTankConfig, key: string): number {
  const value = config[key];
  if (typeof value !== 'number')
    throw new Error(`Fluid Tank numeric setting is unavailable: ${key}`);
  return value;
}
export function fluidString(config: FluidTankConfig, key: string): string {
  const value = config[key];
  if (typeof value !== 'string')
    throw new Error(`Fluid Tank string setting is unavailable: ${key}`);
  return value;
}
export function fluidBoolean(config: FluidTankConfig, key: string): boolean {
  const value = config[key];
  if (typeof value !== 'boolean')
    throw new Error(`Fluid Tank boolean setting is unavailable: ${key}`);
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
