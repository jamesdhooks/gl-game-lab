import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { ballPitDefinition } from './ball-pit/definition.js';

export { BALL_PIT_TUTORIAL_PAGES, ballPitDefinition } from './ball-pit/definition.js';
export {
  BALL_PIT_PLUGIN_ID,
  BallPitControllerService,
  createBallPitPlugin,
  type BallPitController,
} from './ball-pit/BallPitPlugin.js';
export {
  BALL_PIT_DEFAULTS,
  BALL_PIT_SETTINGS,
  ballPitConfigForProfile,
  ballPitConfigForQuality,
  createBallPitConfig,
  type BallPitConfig,
  type BallPitMode,
} from './ball-pit/config.js';
export { BALL_PIT_STYLE_MANIFEST, rgbHexToRgba } from './ball-pit/styles.js';
export { referenceArenaDefinition } from './reference-arena/definition.js';
export {
  REFERENCE_ARENA_PLUGIN_ID,
  ReferenceArenaControllerService,
  createReferenceArenaPlugin,
  type ReferenceArenaController,
} from './reference-arena/ReferenceArenaPlugin.js';

export const GAME_REGISTRY = new ExperienceRegistry().register(ballPitDefinition);
