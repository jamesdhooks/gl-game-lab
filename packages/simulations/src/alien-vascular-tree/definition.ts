import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createVascularTreeConfig, VASCULAR_TREE_DEFAULTS, VASCULAR_TREE_SETTINGS } from './config.js';
import { createVascularTreePlugin } from './VascularTreePlugin.js';
import { VASCULAR_TREE_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const alienVascularTreeDefinition: ExperienceDefinition = {
  id: 'alien-vascular-tree',
  kind: 'simulation',
  name: 'Alien Vascular Tree',
  short: 'Guide branching vessels as they grow and thicken.',
  long: 'Guide branching vessels, feed them, or prune them back.',
  icon: '\uD83E\uDEC0',
  tags: [
    'simulation',
    'growth',
    'branching',
    'transport'
  ],
  paletteHint: 'glowing xeno veins',
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
    ...VASCULAR_TREE_DEFAULTS
  },
  modes: [
    {
      id: 'guide',
      label: 'Guide',
      icon: '*',
      description: 'Move the guide point for new growth.'
    },
    {
      id: 'feed',
      label: 'Feed',
      icon: '+',
      description: 'Thicken nearby vessels.'
    },
    {
      id: 'prune',
      label: 'Prune',
      icon: '-',
      description: 'Trim nearby branch tips.'
    }
  ],
  settings: describeSimulationSettings('alien-vascular-tree', VASCULAR_TREE_SETTINGS),
  styleManifest: VASCULAR_TREE_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '*',
      title: 'Guide Growth',
      body: 'Move the guide light to bias where new vessels grow.'
    },
    {
      icon: '+',
      title: 'Feed Tissue',
      body: 'Feed local vessels to reactivate tips and thicken successful branches.'
    },
    {
      icon: '-',
      title: 'Prune Tips',
      body: 'Switch to Prune and tap or drag over branch tips to trim them back.'
    }
  ],
  physics: {
    renderer: 'webgl2-instanced-segments',
    engine: 'sparse-vascular-growth-graph',
    portability: 'reusable-core',
    supportedShapes: [
      'instanced-capsule-segments'
    ],
    reusableFor: [
      'branching networks',
      'vascular growth',
      'transport graphs'
    ],
    caveats: [
      'Sparse graph topology remains CPU-side by design; vessel rendering and glow are GPU-instanced.'
    ]
  },
  createPlugins: (options = {}) => [
    createVascularTreePlugin(createVascularTreeConfig(options.settings), options)
  ]
};
