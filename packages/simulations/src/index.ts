import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { harmonicSandDefinition } from './harmonic-sand/definition.js';

export { harmonicSandDefinition } from './harmonic-sand/definition.js';
export {
  HARMONIC_SAND_DEFAULTS,
  HARMONIC_SAND_SETTINGS,
  createHarmonicSandConfig,
  type HarmonicRenderStyle,
  type HarmonicSandConfig,
} from './harmonic-sand/config.js';
export {
  HARMONIC_SAND_PLUGIN_ID,
  HarmonicSandControllerService,
  createHarmonicSandPlugin,
  type HarmonicSandController,
} from './harmonic-sand/HarmonicSandPlugin.js';
export { HARMONIC_SAND_STYLE_MANIFEST } from './harmonic-sand/styles.js';

export const SIMULATION_REGISTRY = new ExperienceRegistry().register(harmonicSandDefinition);
