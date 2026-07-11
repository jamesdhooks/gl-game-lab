import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createFluidTankConfig, FLUID_TANK_DEFAULTS, FLUID_TANK_SETTINGS } from './config.js';
import { createFluidTankPlugin } from './FluidTankPlugin.js';
import { FLUID_TANK_STYLE_MANIFEST } from './styles.js';
export const fluidTankDefinition: ExperienceDefinition = {
  id: 'fluid-tank',
  kind: 'simulation',
  name: 'Fluid Tank',
  short: 'Stir colorful dye through a fluid tank.',
  long: 'Stir colorful dye and watch it swirl through the tank.',
  icon: '~',
  tags: [
    'simulation',
    'fluid',
    'webgl',
    'shader',
    'ambient'
  ],
  paletteHint: 'plasma',
  capabilities: {
    interactive: true,
    reset: true,
    demo: true,
    tutorial: true,
    settings: true,
    screensaver: true,
    qualityModes: [
      'raw'
    ]
  },
  configDefaults: {
    ...FLUID_TANK_DEFAULTS
  },
  modes: [
    {
      id: 'inject',
      label: 'Inject',
      icon: '+',
      description: 'Tap or drag to add dye.'
    },
    {
      id: 'stir',
      label: 'Stir',
      icon: '~',
      description: 'Drag to stir the fluid.'
    }
  ],
  settings: FLUID_TANK_SETTINGS,
  styleManifest: FLUID_TANK_STYLE_MANIFEST,
  attributions: [
    {
      label: 'WebGL Fluid Simulation',
      href: 'https://github.com/PavelDoGreat/WebGL-Fluid-Simulation',
      author: 'Pavel Dobryakov',
      license: 'MIT'
    }
  ],
  tutorialPages: [
    {
      icon: '~',
      title: 'Stir the Tank',
      body: 'Drag through the canvas to inject velocity along the path.'
    },
    {
      icon: '+',
      title: 'Inject Mode',
      body: 'Switch to Inject to drip dye while pushing a spreading force.'
    },
    {
      icon: '*',
      title: 'Fluid Controls',
      body: 'Tune pressure, curl, viscosity, dye persistence, bloom, and sun rays from settings.'
    }
  ],
  physics: {
    renderer: 'webgl2-stable-fluid-field',
    engine: 'gpu-stable-fluid',
    portability: 'reusable-core',
    supportedShapes: [
      'field'
    ],
    reusableFor: [
      'fluid tanks',
      'dye advection toys',
      'smoke feedback fields',
      'pointer-driven velocity fields'
    ],
    caveats: [
      'This is a field solver rather than a rigid-body collision engine.'
    ]
  },
  createPlugins: (options = {}) => [
    createFluidTankPlugin(createFluidTankConfig(options.settings), options)
  ]
};
