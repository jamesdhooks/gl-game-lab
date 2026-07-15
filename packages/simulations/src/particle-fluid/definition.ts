import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createParticleFluidConfig, PARTICLE_FLUID_DEFAULTS, PARTICLE_FLUID_SETTINGS } from './config.js';
import { createParticleFluidPlugin } from './ParticleFluidPlugin.js';
import { PARTICLE_FLUID_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';
export const particleFluidDefinition: ExperienceDefinition = {
  id: 'particle-fluid',
  kind: 'simulation',
  name: 'Particle Fluid',
  short: 'Stir a glowing cloud of fluid-like particles.',
  long: 'Stir a glowing cloud of particles and watch the current flow.',
  icon: '~',
  tags: [
    'simulation',
    'fluid',
    'particles',
    'gpu'
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
    ...PARTICLE_FLUID_DEFAULTS
  },
  settings: describeSimulationSettings('particle-fluid', PARTICLE_FLUID_SETTINGS),
  styleManifest: PARTICLE_FLUID_STYLE_MANIFEST,
  attributions: [
    {
      label: 'GPU Fluid Experiments',
      href: 'https://github.com/haxiomic/GPU-Fluid-Experiments',
      author: 'Haxiomic',
      license: 'GPL-3.0'
    }
  ],
  tutorialPages: [
    {
      icon: '~',
      title: 'Drag the Current',
      body: 'Press and drag through the scene to disturb the velocity field.'
    },
    {
      icon: '*',
      title: 'Contained Flow',
      body: 'Soft inward boundary forces keep moving particles inside the tank without pinning them to its walls.'
    }
  ],
  physics: {
    renderer: 'webgl2-gpu-particle-textures',
    engine: 'gpu-velocity-field-and-particle-advection',
    portability: 'reusable-core',
    supportedShapes: [
      'circle',
      'field'
    ],
    reusableFor: [
      'particle fluid studies',
      'velocity advection references',
      'fluid-like point renderers'
    ],
    caveats: [
      'The flow field and particle state are separate GPU resources composed through shared render passes.'
    ]
  },
  createPlugins: (options = {}) => [
    createParticleFluidPlugin(createParticleFluidConfig(options.settings), options)
  ]
};
