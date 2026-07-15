import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createSplashMpmConfig, SPLASH_MPM_DEFAULTS, SPLASH_MPM_SETTINGS } from './config.js';
import { createSplashMpmPlugin } from './SplashMpmPlugin.js';
import { SPLASH_MPM_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const splashMpmDefinition: ExperienceDefinition = {
  id: 'splash-mpm',
  kind: 'simulation',
  name: 'Splash PIC/FLIP',
  short: 'Splash, pour, and shape a sheet of water.',
  long: 'Splash, pour, and build surfaces for a sheet of water.',
  icon: '~',
  tags: [
    'simulation',
    'water',
    'particles',
    'pic',
    'flip',
    'webgl2'
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
    ...SPLASH_MPM_DEFAULTS
  },
  modes: [
    {
      id: 'splash',
      label: 'Splash',
      icon: '~',
      description: 'Drag to stir the water.'
    },
    {
      id: 'pour',
      label: 'Pour',
      icon: '+',
      description: 'Drag to pour more water.'
    },
    {
      id: 'build',
      label: 'Build',
      icon: '\u2B21',
      description: 'Tap for circular pegs or drag for pill-shaped collision surfaces.'
    }
  ],
  settings: describeSimulationSettings('splash-mpm', SPLASH_MPM_SETTINGS),
  styleManifest: SPLASH_MPM_STYLE_MANIFEST,
  attributions: [
    {
      label: 'Splash',
      href: 'https://github.com/matsuoka-601/Splash',
      author: 'matsuoka-601',
      license: 'MIT'
    }
  ],
  tutorialPages: [
    {
      icon: '+',
      title: 'Pour',
      body: 'Use Pour to inject fresh particles while the pointer is held.'
    },
    {
      icon: '~',
      title: 'Splash',
      body: 'Drag through the water sheet to transfer momentum into the particle-grid solver.'
    },
    {
      icon: '\u2B21',
      title: 'Build',
      body: 'Tap in a circular peg or drag out a round-ended pill collision surface.'
    }
  ],
  physics: {
    renderer: 'webgl2-density-metaballs',
    engine: 'cpu-2d-pic-flip-particle-grid',
    portability: 'reusable-core',
    supportedShapes: [
      'circle',
      'capsule',
      'field'
    ],
    reusableFor: [
      '2D PIC/FLIP water scenes',
      'particle-grid liquid toys',
      'screen-space fluid surfaces'
    ],
    caveats: [
      'This is a compact PIC/FLIP-style particle-grid solver, not a material point method solver; GPU rendering reconstructs the surface.'
    ]
  },
  createPlugins: (options = {}) => [
    createSplashMpmPlugin(createSplashMpmConfig(options.settings), options)
  ]
};
