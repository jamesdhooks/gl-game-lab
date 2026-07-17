import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createFireworksConfig, FIREWORKS_DEFAULTS, FIREWORKS_SETTINGS } from './config.js';
import { createCompiledFireworksPlugin } from './CompiledFireworksPlugin.js';
import { FIREWORKS_STYLE_MANIFEST } from './styles.js';
import { describeSimulationSettings } from '../settingDescriptions.js';

export const fireworksDefinition: ExperienceDefinition = {
  id: 'fireworks', kind: 'simulation', name: 'Fireworks',
  short: 'Launch fireworks that bloom into colorful bursts.', long: 'Launch fireworks and build a colorful sky show.',
  icon: '✹', tags: ['simulation', 'particles', 'fireworks', 'trails', 'gpu'], paletteHint: 'neon',
  capabilities: { interactive: true, reset: true, demo: true, tutorial: true, settings: true, qualityModes: ['raw'] },
  configDefaults: { ...FIREWORKS_DEFAULTS },
  modes: [
    { id: 'single', label: 'Single', icon: '^', description: 'Tap to launch one firework.' },
    { id: 'stream', label: 'Stream', icon: '*', description: 'Hold or drag to keep launching fireworks.' },
  ],
  settings: describeSimulationSettings('fireworks', FIREWORKS_SETTINGS),
  styleManifest: FIREWORKS_STYLE_MANIFEST,
  tutorialPages: [
    { icon: '^', title: 'Single Mode', body: 'Single mode treats each press as exactly one targeted shell.' },
    { icon: '*', title: 'Stream Mode', body: 'Stream mode keeps a rolling show alive while drags add extra shells.' },
    { icon: '+', title: 'Secondary Bursts', body: 'Raise Secondary Chance and Depth to get smaller recursive fireworks.' },
    { icon: 'GPU', title: 'GPU Particle Engine', body: 'Spark state is stepped in GPU textures and rendered as point sprites with persistent trails.' },
  ],
  physics: {
    renderer: 'webgl2-gpu-particles', engine: 'gpu-texture-particle-simulation', portability: 'reusable-core', supportedShapes: ['circle'],
    reusableFor: ['high-count GPU particle stepping', 'trail feedback compositing', 'event-command particle spawning'],
    caveats: ['Launch shells are CPU-scheduled actors; dense spark motion and rendering stay GPU-resident.'],
  },
  createPlugins: (options = {}) => [createCompiledFireworksPlugin(createFireworksConfig(options.settings), options)],
};
