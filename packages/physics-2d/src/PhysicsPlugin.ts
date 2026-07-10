import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineSchedule } from '@hooksjam/gl-game-lab-engine';
import { PhysicsWorld2D, type PhysicsWorld2DOptions } from './PhysicsWorld2D.js';

export const PhysicsWorld2DService = createExtensionToken<PhysicsWorld2D>('gl-game-lab.physics-2d.world');
export const PHYSICS_2D_PLUGIN_ID = 'gl-game-lab.physics-2d';

export function createPhysics2DPlugin(options: PhysicsWorld2DOptions = {}): EnginePlugin {
  const world = new PhysicsWorld2D(options);
  return {
    id: PHYSICS_2D_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      context.provide(PhysicsWorld2DService, world);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.physics-2d.step',
        stage: 'fixedUpdate',
        run: ({ time }) => { world.step(time.deltaSeconds); },
      });
    },
    dispose: () => { world.clear(); },
  };
}
