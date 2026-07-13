import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { CHAIN_RAIN_DEFAULTS, CHAIN_RAIN_SETTINGS, createChainRainConfig } from './config.js';
import { createChainRainPlugin } from './ChainRainPlugin.js';
import { CHAIN_RAIN_STYLE_MANIFEST } from './styles.js';
export const chainRainDefinition: ExperienceDefinition = {
  id: 'chain-rain',
  kind: 'simulation',
  name: 'Snakes',
  short: 'Draw soft snakes and let them pile up.',
  long: 'Draw soft snakes, build obstacles, and drag them around.',
  icon: '\u2301',
  tags: [
    'simulation',
    'physics',
    'constraints',
    'gpu-rendering'
  ],
  paletteHint: 'neon',
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
    ...CHAIN_RAIN_DEFAULTS
  },
  modes: [
    {
      id: 'draw',
      label: 'Draw',
      icon: '\u3030',
      description: 'Draw a line to make a snake.'
    },
    {
      id: 'build',
      label: 'Build',
      icon: '\u2B21',
      description: 'Tap for a circular peg or drag to make a pill-shaped barrier.'
    },
    {
      id: 'interact',
      label: 'Interact',
      icon: '\u270B',
      description: 'Drag snakes around.'
    }
  ],
  settings: CHAIN_RAIN_SETTINGS,
  styleManifest: CHAIN_RAIN_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '\u3030',
      title: 'Draw Snakes',
      body: 'Draw a path and release to create a soft linked snake.'
    },
    {
      icon: '\u2B21',
      title: 'Build Obstacles',
      body: 'Tap for a circular peg or drag to build a round-ended pill barrier.'
    },
    {
      icon: '\u270B',
      title: 'Move the Pile',
      body: 'Drag nearby snake nodes and watch their constraints pull the body along.'
    }
  ],
  physics: {
    renderer: 'webgl2-instanced-capsules-and-points',
    engine: 'dense-circle-pbd-with-distance-constraints',
    portability: 'reusable-core',
    supportedShapes: [
      'chain',
      'circle',
      'fixed-fixture'
    ],
    reusableFor: [
      'snake simulations',
      'rope simulations',
      'distance constraints',
      'dense collision plus constraints',
      'soft bodies'
    ],
    caveats: [
      'Snakes are particle constraints rather than rigid links with angular motors.'
    ]
  },
  createPlugins: (options = {}) => [
    createChainRainPlugin(createChainRainConfig(options.settings), options)
  ]
};
