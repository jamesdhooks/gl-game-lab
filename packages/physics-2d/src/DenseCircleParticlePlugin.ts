import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineSchedule } from '@hooksjam/gl-game-lab-engine';
import {
  DenseCircleParticleWorld2D,
  type DenseCircleParticleSettings,
} from './DenseCircleParticleWorld2D.js';

export interface DenseCircleParticlePluginOptions {
  readonly capacity: number;
  readonly settings?: Partial<DenseCircleParticleSettings>;
  readonly seed?: number;
}

export const DenseCircleParticleWorld2DService = createExtensionToken<DenseCircleParticleWorld2D>(
  'gl-game-lab.physics-2d.dense-circle-world',
);
export const DENSE_CIRCLE_PARTICLE_PLUGIN_ID = 'gl-game-lab.physics-2d.dense-circles';

export function createDenseCircleParticlePlugin(options: DenseCircleParticlePluginOptions): EnginePlugin {
  const world = new DenseCircleParticleWorld2D(options.capacity, options.settings, options.seed);
  return {
    id: DENSE_CIRCLE_PARTICLE_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      context.provide(DenseCircleParticleWorld2DService, world);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.physics-2d.dense-circles.step',
        stage: 'fixedUpdate',
        run: ({ time }) => { world.step(time.deltaSeconds); },
      });
    },
    dispose: () => { world.clear(); },
  };
}
