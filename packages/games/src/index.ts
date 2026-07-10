import { ExperienceRegistry } from '@hooksjam/gl-game-lab-engine';
import { ballPitDefinition } from './ball-pit/definition.js';

export { ballPitDefinition } from './ball-pit/definition.js';
export {
  BALL_PIT_PLUGIN_ID,
  BallPitControllerService,
  createBallPitPlugin,
  type BallPitController,
} from './ball-pit/BallPitPlugin.js';
export {
  BALL_PIT_DEFAULTS,
  BALL_PIT_SETTINGS,
  type BallPitConfig,
  type BallPitMode,
} from './ball-pit/config.js';

export const GAME_REGISTRY = new ExperienceRegistry().register(ballPitDefinition);
