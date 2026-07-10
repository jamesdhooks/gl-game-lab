import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createPhysics2DPlugin } from '@hooksjam/gl-game-lab-physics-2d';
import { createBallPitPlugin } from './BallPitPlugin.js';
import { BALL_PIT_DEFAULTS, BALL_PIT_SETTINGS } from './config.js';

export const ballPitDefinition: ExperienceDefinition = {
  id: 'ball-pit',
  kind: 'simulation',
  name: 'Ball Pit',
  short: 'Drop bouncy balls and push them around the pit.',
  long: 'Fill the screen with bouncy balls and stir them around.',
  icon: '🔴',
  tags: ['physics', 'simulation', 'webgl2', 'advanced-engine'],
  capabilities: { interactive: true, reset: true, demo: true, tutorial: true, settings: true },
  configDefaults: { ...BALL_PIT_DEFAULTS },
  modes: [
    { id: 'single', label: 'Single', icon: '•', description: 'Tap to drop one ball.' },
    { id: 'stream', label: 'Stream', icon: '⋯', description: 'Hold to pour balls into the pit.' },
    { id: 'interact', label: 'Interact', icon: '✋', description: 'Drag balls around.' },
    { id: 'explosion', label: 'Explosion', icon: '◎', description: 'Tap to blast nearby balls outward.' },
  ],
  settings: BALL_PIT_SETTINGS,
  createPlugins: () => [
    createPhysics2DPlugin({
      gravityY: BALL_PIT_DEFAULTS.gravity,
      solverIterations: BALL_PIT_DEFAULTS.solverPasses,
      cellSize: BALL_PIT_DEFAULTS.radius * 2.5,
      boundaryRestitution: BALL_PIT_DEFAULTS.wallBounce ? BALL_PIT_DEFAULTS.wallBounceAmount : 0,
    }),
    createBallPitPlugin(),
  ],
};
