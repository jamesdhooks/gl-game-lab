import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createTuringSkinConfig, TURING_SKIN_DEFAULTS, TURING_SKIN_SETTINGS } from './config.js';
import { createTuringSkinPlugin } from './TuringSkinPlugin.js';
import { TURING_SKIN_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const turingSkinDefinition: ExperienceDefinition = {
  id: 'turing-skin',
  kind: 'simulation',
  name: 'Turing Skin',
  short: 'Paint pigment that grows into spots and stripes.',
  long: 'Paint and erase pigment to grow spots, stripes, and scars.',
  icon: '\u25E9',
  tags: [
    'simulation',
    'reaction-diffusion',
    'chemistry',
    'field'
  ],
  paletteHint: 'morphogen skin',
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
    ...TURING_SKIN_DEFAULTS
  },
  modes: [
    {
      id: 'paint',
      label: 'Paint',
      icon: '+',
      description: 'Add pigment to the surface.'
    },
    {
      id: 'erase',
      label: 'Erase',
      icon: '-',
      description: 'Cut holes in the pattern.'
    }
  ],
  settings: describeSimulationSettings('turing-skin', TURING_SKIN_SETTINGS),
  styleManifest: TURING_SKIN_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '+',
      title: 'Paint Pigment',
      body: 'Tap or drag in Paint mode to seed pigment. The reaction spreads it into spots or bands over time.'
    },
    {
      icon: '-',
      title: 'Carve Holes',
      body: 'Switch to Erase to cut holes, scars, and negative space into the pattern.'
    }
  ],
  physics: {
    renderer: 'webgl2-gpu-field',
    engine: 'gpu-ping-pong-field',
    portability: 'reusable-core',
    supportedShapes: [
      'field'
    ],
    reusableFor: [
      'reaction diffusion',
      'scalar fields',
      'chemical pattern formation'
    ],
    caveats: [
      'Simulation state lives in GPU framebuffer textures; float render-target support is required.'
    ]
  },
  createPlugins: (options = {}) => [
    createTuringSkinPlugin(createTuringSkinConfig(options.settings), options)
  ]
};
