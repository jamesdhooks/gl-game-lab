import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { harmonicSandDefinition } from './harmonic-sand/definition.js';
import { fireworksDefinition } from './fireworks/definition.js';
import { sparksDefinition } from './sparks/definition.js';
import { orbitalShrapnelDefinition } from './orbital-shrapnel/definition.js';
import { turingSkinDefinition } from './turing-skin/definition.js';
import { myceliumDefinition } from './mycelium/definition.js';

export { harmonicSandDefinition } from './harmonic-sand/definition.js';
export { fireworksDefinition } from './fireworks/definition.js';
export { sparksDefinition } from './sparks/definition.js';
export { orbitalShrapnelDefinition } from './orbital-shrapnel/definition.js';
export { turingSkinDefinition } from './turing-skin/definition.js';
export { myceliumDefinition } from './mycelium/definition.js';
export { MYCELIUM_DEFAULTS, MYCELIUM_SETTINGS, createMyceliumConfig, myceliumNumber, myceliumString, type MyceliumConfig } from './mycelium/config.js';
export { MYCELIUM_PLUGIN_ID, MyceliumControllerService, createMyceliumPlugin, type MyceliumController } from './mycelium/MyceliumPlugin.js';
export { MYCELIUM_STYLE_MANIFEST } from './mycelium/styles.js';
export { TURING_SKIN_DEFAULTS, TURING_SKIN_SETTINGS, createTuringSkinConfig, type TuringSkinConfig } from './turing-skin/config.js';
export { TURING_SKIN_PLUGIN_ID, TuringSkinControllerService, createTuringSkinPlugin, type TuringSkinController, type TuringSkinMode } from './turing-skin/TuringSkinPlugin.js';
export { TURING_SKIN_STYLE_MANIFEST } from './turing-skin/styles.js';
export { ORBITAL_SHRAPNEL_DEFAULTS, ORBITAL_SHRAPNEL_SETTINGS, createOrbitalShrapnelConfig, orbitalBoolean, orbitalNumber, orbitalString, type OrbitalShrapnelConfig } from './orbital-shrapnel/config.js';
export { ORBITAL_SHRAPNEL_PLUGIN_ID, OrbitalShrapnelControllerService, createOrbitalShrapnelPlugin, type OrbitalShrapnelController, type OrbitalShrapnelMode } from './orbital-shrapnel/OrbitalShrapnelPlugin.js';
export { ORBITAL_SHRAPNEL_STYLE_MANIFEST } from './orbital-shrapnel/styles.js';
export { SPARKS_DEFAULTS, SPARKS_SETTINGS, createSparksConfig, sparksNumber, sparksString, type SparksConfig } from './sparks/config.js';
export { SPARKS_PLUGIN_ID, SparksControllerService, createSparksPlugin, type SparksController, type SparksMode } from './sparks/SparksPlugin.js';
export { SPARKS_STYLE_MANIFEST } from './sparks/styles.js';
export { FIREWORKS_DEFAULTS, FIREWORKS_SETTINGS, createFireworksConfig, type FireworksConfig } from './fireworks/config.js';
export { FIREWORKS_PLUGIN_ID, FireworksControllerService, createFireworksPlugin, type FireworksController, type FireworksMode } from './fireworks/FireworksPlugin.js';
export { FIREWORKS_STYLE_MANIFEST } from './fireworks/styles.js';
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

export const SIMULATION_REGISTRY = new ExperienceRegistry().register(harmonicSandDefinition).register(fireworksDefinition).register(sparksDefinition).register(orbitalShrapnelDefinition).register(turingSkinDefinition).register(myceliumDefinition);
