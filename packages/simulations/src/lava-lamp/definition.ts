import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createLavaLampConfig, LAVA_LAMP_DEFAULTS, LAVA_LAMP_SETTINGS } from './config.js';
import { createLavaLampPlugin } from './LavaLampPlugin.js';
import { LAVA_LAMP_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const lavaLampDefinition: ExperienceDefinition = {
  id: 'lava-lamp',
  kind: 'simulation',
  name: 'Lava Lamp',
  short: 'Warm wax blobs rise and drift like a lava lamp.',
  long: 'Grow and release wax blobs, or remove them, and watch them rise, drift, and fall.',
  icon: '\u25D6',
  tags: [
    'simulation',
    'metaball',
    'thermal',
    'gpu-surface'
  ],
  paletteHint: 'plasma',
  capabilities: {
    interactive: true,
    reset: true,
    demo: true,
    tutorial: true,
    settings: true,
    qualityModes: [
      'raw'
    ]
  },
  configDefaults: {
    ...LAVA_LAMP_DEFAULTS
  },
  modes: [
    {
      id: 'add',
      label: 'Add',
      icon: '+',
      description: 'Hold to grow one wax blob, then release it.'
    },
    {
      id: 'remove',
      label: 'Remove',
      icon: '-',
      description: 'Remove wax from the brush.'
    }
  ],
  settings: describeSimulationSettings('lava-lamp', LAVA_LAMP_SETTINGS),
  styleManifest: LAVA_LAMP_STYLE_MANIFEST,
  attributions: [
    {
      label: 'WebGL Lava Lamp',
      href: 'https://github.com/brybrant/lava-lamp',
      author: 'Matt Bryant',
      license: 'GPL-3.0'
    }
  ],
  tutorialPages: [
    {
      icon: '+',
      title: 'Add Warm Wax',
      body: 'Press and hold to grow one warm wax blob. Release to let it rise and drift.'
    },
    {
      icon: '-',
      title: 'Remove Wax',
      body: 'Switch to Remove and brush away nearby wax.'
    },
    {
      icon: '\u25D6',
      title: 'Thermal Cycle',
      body: 'Wax heats at the bottom, rises, cools at the top, and falls through a slow coherent convection field.'
    }
  ],
  physics: {
    renderer: 'webgl2-density-metaballs-and-raymarch',
    engine: 'dense-thermal-metaball-particles',
    portability: 'reusable-core',
    supportedShapes: [
      'circle',
      'metaball'
    ],
    reusableFor: [
      'thermal buoyancy toys',
      'screen-space liquid surfaces',
      'density metaballs'
    ],
    caveats: [
      'Thermal wax particles remain CPU-side while the visible connected surface and far-depth layer are GPU-rendered.'
    ]
  },
  createPlugins: (options = {}) => [
    createLavaLampPlugin(createLavaLampConfig(options.settings), options)
  ]
};
