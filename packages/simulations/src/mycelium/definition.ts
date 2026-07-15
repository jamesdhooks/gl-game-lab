import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createMyceliumConfig, MYCELIUM_DEFAULTS, MYCELIUM_SETTINGS } from './config.js';
import { createMyceliumPlugin } from './MyceliumPlugin.js';
import { MYCELIUM_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const myceliumDefinition: ExperienceDefinition = {
  id: 'mycelium',
  kind: 'simulation',
  name: 'Mycelium',
  short: 'Paint colonies and watch branching threads spread.',
  long: 'Paint colonies and watch branching threads spread across the surface.',
  icon: '\uD83C\uDF44',
  tags: [
    'simulation',
    'growth',
    'lattice',
    'mycelium'
  ],
  paletteHint: 'synaptic fungus',
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
    ...MYCELIUM_DEFAULTS
  },
  modes: [
    {
      id: 'paint',
      label: 'Paint',
      icon: '\u270E',
      description: 'Paint new growth onto the surface.'
    }
  ],
  settings: describeSimulationSettings('mycelium', MYCELIUM_SETTINGS),
  styleManifest: MYCELIUM_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '\u270E',
      title: 'Paint Threads',
      body: 'Tap to seed a colony or drag to lay down a wider band of hyphae.'
    },
    {
      icon: '*',
      title: 'Switch Structure',
      body: 'Use Topology to pick triangular or square growth geometry. Style changes only the GPU rendering treatment.'
    }
  ],
  physics: {
    renderer: 'webgl2-gpu-field',
    engine: 'gpu-cellular-field',
    portability: 'reusable-core',
    supportedShapes: [
      'field'
    ],
    reusableFor: [
      'lattice growth',
      'fungal networks',
      'cellular automata'
    ],
    caveats: [
      'Square and triangle styles use distinct GPU neighbor kernels and surface-area constants.'
    ]
  },
  createPlugins: (options = {}) => [
    createMyceliumPlugin(createMyceliumConfig(options.settings), options)
  ]
};
