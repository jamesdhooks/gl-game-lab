import { describe, expect, it } from 'vitest';
import type { PluginInstallContext } from '@hooksjam/gl-game-lab-core';
import { PHYSICS_2D_PLUGIN_ID } from '@hooksjam/gl-game-lab-physics-2d';
import { GameEngine } from '@hooksjam/gl-game-lab-engine';
import {
  SpriteRenderQueue,
  SpriteRenderQueueService,
  WEBGL2_RENDERER_PLUGIN_ID,
  WebGL2RendererService,
  type WebGL2Renderer,
  type WebGLTextureResource,
} from '@hooksjam/gl-game-lab-render-webgl2';
import {
  BALL_PIT_DEFAULTS,
  BALL_PIT_PLUGIN_ID,
  BallPitControllerService,
  GAME_REGISTRY,
  ballPitDefinition,
} from '../index.js';

describe('Ball Pit experience', () => {
  it('preserves the frozen identity, modes, settings, and defaults', () => {
    expect(GAME_REGISTRY.get('ball-pit')).toBe(ballPitDefinition);
    expect(ballPitDefinition.kind).toBe('simulation');
    expect(ballPitDefinition.modes?.map(({ id }) => id)).toEqual(['single', 'stream', 'interact', 'explosion']);
    expect(ballPitDefinition.settings).toHaveLength(17);
    expect(BALL_PIT_DEFAULTS).toMatchObject({
      maxParticles: 65_536,
      radius: 12,
      spawnRate: 1200,
      gravity: 1300,
      solverPasses: 3,
    });
  });

  it('composes reusable physics before its content plugin', () => {
    expect(ballPitDefinition.createPlugins().map(({ id }) => id)).toEqual([
      PHYSICS_2D_PLUGIN_ID,
      BALL_PIT_PLUGIN_ID,
    ]);
  });

  it('runs as a vertical engine plugin and responds to pointer input', async () => {
    let textureDisposed = false;
    const queue = new SpriteRenderQueue(800, 600);
    const resource = {
      texture: {} as WebGLTexture,
      dispose: () => { textureDisposed = true; },
    } as unknown as WebGLTextureResource;
    const renderer = {
      device: { createTextureFromRgbaPixels: () => resource },
      sprites: queue,
    } as unknown as WebGL2Renderer;
    const fakeRendererPlugin = {
      id: WEBGL2_RENDERER_PLUGIN_ID,
      version: '1.0.0',
      dependencies: [{ id: 'gl-game-lab.runtime' }],
      install: (context: PluginInstallContext) => {
        context.provide(WebGL2RendererService, renderer);
        context.provide(SpriteRenderQueueService, queue);
      },
    };
    const engine = new GameEngine({ plugins: [fakeRendererPlugin, ...ballPitDefinition.createPlugins()] });
    await engine.initialize();
    await engine.start();

    engine.frame(1 / 60);
    const controller = engine.kernel.get(BallPitControllerService);
    expect(controller.bodyCount).toBe(180);
    expect(queue.count).toBe(180);
    queue.clear();
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 1, x: 400, y: 100, buttons: 1 });
    engine.frame(1 / 60);
    expect(controller.bodyCount).toBe(181);
    expect(queue.count).toBe(181);

    await engine.destroy();
    expect(textureDisposed).toBe(true);
  });
});
