import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createHarmonicSandConfig, HARMONIC_SAND_DEFAULTS, HARMONIC_SAND_SETTINGS } from './config.js';
import { createHarmonicSandPlugin } from './HarmonicSandPlugin.js';
import { HARMONIC_SAND_STYLE_MANIFEST } from './styles.js';

export const harmonicSandDefinition: ExperienceDefinition = {
  id: 'harmonic-sand',
  kind: 'simulation',
  name: 'Haromonics',
  short: 'Glowing sand gathers into shifting wave patterns.',
  long: 'Place and move wave sources to shape glowing sand patterns.',
  icon: '≋',
  tags: ['simulation', 'particles', 'resonance', 'ambient'],
  paletteHint: 'neon',
  capabilities: {
    interactive: true, reset: true, demo: true, tutorial: true, settings: true,
    qualityModes: ['basic', 'enhanced', 'raw'],
  },
  configDefaults: { ...HARMONIC_SAND_DEFAULTS },
  modes: [{ id: 'shape', label: 'Shape', icon: '↔', description: 'Place and drag wave sources.' }],
  settings: HARMONIC_SAND_SETTINGS,
  styleManifest: HARMONIC_SAND_STYLE_MANIFEST,
  tutorialPages: [
    { icon: '•', title: 'Seed Resonance', body: 'Tap an empty spot to place a new wave source on the plate.' },
    { icon: '↔', title: 'Shape the Field', body: 'Drag any emitter to reposition it and reshape the pattern.' },
    { icon: '✕', title: 'Remove a Source', body: 'Double-tap an emitter to delete it.' },
  ],
  physics: {
    renderer: 'webgl2-analytic-field',
    engine: 'gpu-analytic-field-shader',
    portability: 'reusable-core',
    supportedShapes: ['circle'],
    reusableFor: ['field-driven particle visualizations', 'procedural fullscreen effects', 'quality-scaled GPU rendering'],
    caveats: ['This is a shader-field simulation, not a collision benchmark.'],
  },
  createPlugins: (options = {}) => [createHarmonicSandPlugin(createHarmonicSandConfig(options.settings), options)],
};
