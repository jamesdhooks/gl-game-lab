import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createSoftBodyBlobConfig, SOFT_BODY_BLOB_DEFAULTS, SOFT_BODY_BLOB_SETTINGS } from './config.js';
import { createSoftBodyBlobPlugin } from './SoftBodyBlobPlugin.js';
import { SOFT_BODY_BLOB_STYLE_MANIFEST } from './styles.js';
export const softBodyBlobDefinition: ExperienceDefinition = {
  id: 'soft-body-blob',
  kind: 'simulation',
  name: 'Soft-Body Blobs',
  short: 'Draw squishy blobs and watch them pile up.',
  long: 'Draw squishy blobs, build obstacles, and drag them around.',
  icon: '\u25CF',
  tags: [
    'simulation',
    'physics',
    'soft-body',
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
    ...SOFT_BODY_BLOB_DEFAULTS
  },
  modes: [
    {
      id: 'draw',
      label: 'Draw',
      icon: '\u2B21',
      description: 'Draw a loop to make a blob.'
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
      description: 'Drag blobs around.'
    }
  ],
  settings: SOFT_BODY_BLOB_SETTINGS,
  styleManifest: SOFT_BODY_BLOB_STYLE_MANIFEST,
  tutorialPages: [
    {
      icon: '\u2B21',
      title: 'Draw a Body',
      body: 'Draw and close a loop to create a filled squishy body.'
    },
    {
      icon: '\u2B21',
      title: 'Build Obstacles',
      body: 'Tap for a circular peg or drag to create a round-ended pill barrier.'
    },
    {
      icon: '\u270B',
      title: 'Squish and Drag',
      body: 'Drag nearby membrane nodes and the whole soft body deforms with them.'
    }
  ],
  physics: {
    renderer: 'webgl2-dynamic-mesh-and-particles',
    engine: 'dense-circle-pbd-with-area-and-distance-constraints',
    portability: 'reusable-core',
    supportedShapes: [
      'soft-body',
      'circle',
      'fixed-fixture'
    ],
    reusableFor: [
      'blob piles',
      'viscous connected bodies',
      'closed-body mesh rendering',
      'soft-body collision stress tests'
    ],
    caveats: [
      'Closed-body area pressure remains a specialized simulation layer over the reusable constraint world.'
    ]
  },
  createPlugins: (options = {}) => [
    createSoftBodyBlobPlugin(createSoftBodyBlobConfig(options.settings), options)
  ]
};
