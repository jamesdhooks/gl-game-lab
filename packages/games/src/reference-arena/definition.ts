import type { ExperienceDefinition } from '@hooksjam/gl-game-lab-engine';
import { createPhysics2DPlugin } from '@hooksjam/gl-game-lab-physics-2d';
import { createReferenceArenaPlugin } from './ReferenceArenaPlugin.js';

/** Internal vertical slice used to prove the complete conventional 2D authoring path. */
export const referenceArenaDefinition: ExperienceDefinition = {
  id: 'reference-arena',
  kind: 'game',
  name: 'Reference Arena',
  short: 'Engine integration arena for sprites, input, physics, audio, saves, scenes, and accessibility.',
  long: 'A compact conventional 2D game slice that exercises GLGameLab public engine services without renderer-private APIs.',
  icon: '◆',
  tags: ['reference', '2d', 'ecs', 'engine-validation'],
  capabilities: {
    interactive: true,
    reset: true,
    demo: true,
    tutorial: false,
    settings: false,
    score: true,
    aiAutoplay: false,
    screensaver: false,
    qualityModes: ['standard'],
  },
  modes: [{ id: 'play', label: 'Play', icon: '◆', description: 'Collect every energy marker.' }],
  createPlugins: () => [
    createPhysics2DPlugin({
      gravityY: 0,
      bounds: { left: 0, top: 0, right: 960, bottom: 540 },
      solverIterations: 3,
      substeps: 2,
      boundaryRestitution: 0.45,
    }),
    createReferenceArenaPlugin(),
  ],
};
