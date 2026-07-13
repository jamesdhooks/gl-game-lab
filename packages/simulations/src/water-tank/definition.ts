import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createWaterTankConfig, WATER_TANK_DEFAULTS, WATER_TANK_SETTINGS } from './config.js';
import { createWaterTankPlugin } from './WaterTankPlugin.js';
import { WATER_TANK_STYLE_MANIFEST } from './styles.js';
export const waterTankDefinition: ExperienceDefinition = {
  id: 'water-tank',
  kind: 'simulation',
  name: 'Water Tank',
  short: 'Pour water and build obstacles for it to splash around.',
  long: 'Pour water, splash it around, and build obstacles in the tank.',
  icon: '\u2248',
  tags: [
    'simulation',
    'water',
    'particles',
    'sph'
  ],
  paletteHint: 'cyan',
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
    ...WATER_TANK_DEFAULTS
  },
  modes: [
    {
      id: 'pour',
      label: 'Pour',
      icon: '+',
      description: 'Tap or drag to pour water.'
    },
    {
      id: 'splash',
      label: 'Splash',
      icon: '~',
      description: 'Drag to push the water around.'
    },
    {
      id: 'build',
      label: 'Build',
      icon: '\u2B21',
      description: 'Tap for circular pegs or drag for pill-shaped obstacles.'
    }
  ],
  settings: WATER_TANK_SETTINGS,
  styleManifest: WATER_TANK_STYLE_MANIFEST,
  attributions: [
    {
      label: 'gl-water2d',
      href: 'https://github.com/Erkaman/gl-water2d',
      author: 'Eric Arneb\u00E4ck',
      license: 'MIT'
    }
  ],
  tutorialPages: [
    {
      icon: '+',
      title: 'Pour Water',
      body: 'Tap or drag to add SPH-style liquid particles.'
    },
    {
      icon: '~',
      title: 'Splash Water',
      body: 'Switch to Splash and drag through the tank to push water around.'
    },
    {
      icon: '\u2B21',
      title: 'Build Surfaces',
      body: 'Tap for circular pegs or drag to place round-ended pill obstacles.'
    }
  ],
  physics: {
    renderer: 'webgl2-density-metaballs',
    engine: 'cpu-spatial-hash-double-density-relaxation',
    portability: 'reusable-core',
    supportedShapes: [
      'circle',
      'capsule'
    ],
    reusableFor: [
      'particle fluid tanks',
      'buildable obstacle flows',
      'SPH-inspired liquid toys'
    ],
    caveats: [
      'The stable solver uses CPU spatial hashing with GPU liquid-surface rendering.'
    ]
  },
  createPlugins: (options = {}) => [
    createWaterTankPlugin(createWaterTankConfig(options.settings), options)
  ]
};
