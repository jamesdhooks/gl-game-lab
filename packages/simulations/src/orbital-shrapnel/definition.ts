import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createOrbitalShrapnelConfig, ORBITAL_SHRAPNEL_DEFAULTS, ORBITAL_SHRAPNEL_SETTINGS } from './config.js';
import { createOrbitalShrapnelPlugin } from './OrbitalShrapnelPlugin.js';
import { ORBITAL_SHRAPNEL_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const orbitalShrapnelDefinition: ExperienceDefinition = {
  id: 'orbital-shrapnel',
  kind: 'simulation',
  name: 'Space Debris',
  short: 'Add debris and bend it around a planet.',
  long: 'Add debris, pull it with gravity, and launch asteroids around a planet.',
  icon: '\uD83E\uDE90',
  tags: [
    'simulation',
    'particles',
    'space',
    'trails'
  ],
  paletteHint: 'cosmic',
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
    ...ORBITAL_SHRAPNEL_DEFAULTS
  },
  modes: [
    {
      id: 'add',
      label: 'Add',
      icon: '+',
      description: 'Tap or drag to add debris.'
    },
    {
      id: 'interact',
      label: 'Interact',
      icon: '\u270B',
      description: 'Drag debris around.'
    },
    {
      id: 'well',
      label: 'Well',
      icon: '\u25CE',
      description: 'Hold to pull debris toward a gravity well.'
    },
    {
      id: 'asteroid',
      label: 'Asteroid',
      icon: '\u2197',
      description: 'Drag and release to launch an asteroid.'
    }
  ],
  settings: describeSimulationSettings('orbital-shrapnel', ORBITAL_SHRAPNEL_SETTINGS),
  styleManifest: ORBITAL_SHRAPNEL_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '+',
      title: 'Add Debris',
      body: 'Tap or drag to add shards that inherit your pointer motion.'
    },
    {
      icon: '\u270B',
      title: 'Interact',
      body: 'Drag through the ring with the shared faded interaction radius.'
    },
    {
      icon: '\u25CE',
      title: 'Gravity Well',
      body: 'Hold to attract nearby debris into a tunable well.'
    },
    {
      icon: '\u2197',
      title: 'Asteroid Slingshot',
      body: 'Drag to aim, then release to launch a larger asteroid with local orbital velocity plus drag-distance boost.'
    },
    {
      icon: '\u25CE',
      title: 'Mode Controls',
      body: 'Add emits while held, Interact drags an influence field, Well pulls while held, and Asteroid launches on release.'
    }
  ],
  physics: {
    renderer: 'webgl2-gpu-particles',
    engine: 'gpu-orbital-field-simulation',
    portability: 'reusable-core',
    supportedShapes: [
      'circle'
    ],
    reusableFor: [
      'high-count GPU particle rendering',
      'gravity-well simulations',
      'trail-field compositing',
      'orbital debris effects'
    ],
    caveats: [
      'Space Debris keeps a custom orbital force model on the shared GPU state pipeline.'
    ]
  },
  createPlugins: (options = {}) => [
    createOrbitalShrapnelPlugin(createOrbitalShrapnelConfig(options.settings), options)
  ]
};
