import { describe, expect, it } from 'vitest';
import { DENSE_CIRCLE_PARTICLE_PLUGIN_ID, DenseCircleParticleWorld2DService } from '@hooksjam/gl-game-lab-physics-2d';
import {
  DEFAULT_FONT_2D_ID,
  EngineRender2D,
  GameEngine,
  type BitmapFont2DHandle,
  type Camera2DState,
  type ParticleBatch2D,
  type Render2DService,
  type Sprite2DDraw,
  type Text2DDraw,
  type Texture2DHandle,
} from '@hooksjam/gl-game-lab-engine';
import {
  BALL_PIT_DEFAULTS,
  BALL_PIT_PLUGIN_ID,
  BALL_PIT_SETTINGS,
  BALL_PIT_STYLE_MANIFEST,
  BALL_PIT_TUTORIAL_PAGES,
  BallPitControllerService,
  GAME_REGISTRY,
  ballPitDefinition,
  ballPitConfigForProfile,
  createBallPitConfig,
} from '../index.js';

describe('Ball Pit experience', () => {
  it('preserves the frozen identity, modes, settings, and defaults', () => {
    expect(GAME_REGISTRY.get('ball-pit')).toBe(ballPitDefinition);
    expect(ballPitDefinition.kind).toBe('simulation');
    expect(ballPitDefinition.modes?.map(({ id }) => id)).toEqual(['single', 'stream', 'interact', 'explosion']);
    expect(ballPitDefinition.settings).toHaveLength(17);
    expect(BALL_PIT_SETTINGS.map((setting) => [
      setting.key,
      setting.type,
      setting.default,
      setting.type === 'number' ? setting.min : null,
      setting.type === 'number' ? setting.max : null,
      setting.type === 'number' ? setting.step : null,
      setting.type === 'number' ? setting.numericScale ?? 'linear' : null,
      setting.advanced ?? false,
      setting.visibleModes?.join(',') ?? '',
    ])).toEqual([
      ['maxParticles', 'number', 65_536, 1_024, 262_144, 1, 'powerOfTwo', false, ''],
      ['radius', 'number', 12, 2, 64, 0.5, 'linear', false, ''],
      ['radiusVariation', 'number', 0.15, 0, 1, 0.01, 'linear', false, ''],
      ['spawnRate', 'number', 1200, 50, 6_000, 50, 'linear', false, 'stream'],
      ['interactionRadius', 'number', 56, 16, 240, 2, 'linear', false, 'interact'],
      ['solverPasses', 'number', 3, 1, 8, 1, 'linear', false, ''],
      ['substeps', 'number', 2, 1, 5, 1, 'linear', false, ''],
      ['gravity', 'number', 1300, 0, 3000, 25, 'linear', false, ''],
      ['burstCount', 'number', 5000, 100, 10_000, 100, 'linear', true, 'explosion'],
      ['wallBounce', 'boolean', false, null, null, null, null, true, ''],
      ['friction', 'number', 0.72, 0, 2, 0.05, 'linear', true, ''],
      ['collisionSoftness', 'number', 1.05, 0.05, 1.5, 0.01, 'linear', true, ''],
      ['maxPairPush', 'number', 0.75, 0.02, 2, 0.01, 'linear', true, ''],
      ['airDrag', 'number', 0.998, 0.9, 1, 0.001, 'linear', true, ''],
      ['solverDamping', 'number', 0.982, 0.9, 1, 0.001, 'linear', true, ''],
      ['wallBounceAmount', 'number', 0.16, 0, 1, 0.01, 'linear', true, ''],
      ['impactBounceThreshold', 'number', 150, 0, 500, 10, 'linear', true, ''],
    ]);
    expect(ballPitDefinition.styleManifest).toBe(BALL_PIT_STYLE_MANIFEST);
    expect(BALL_PIT_STYLE_MANIFEST.styles.map(({ id }) => id)).toEqual([
      'rainbow', 'pastel', 'neon', 'ocean', 'candy', 'rubber-room', 'soda-pop', 'moon-gym', 'jungle-bounce', 'monochrome-pop',
    ]);
    expect(ballPitDefinition.tutorialPages).toBe(BALL_PIT_TUTORIAL_PAGES);
    expect(BALL_PIT_TUTORIAL_PAGES).toHaveLength(3);
    expect(BALL_PIT_DEFAULTS).toMatchObject({
      screensaverMs: 60_000,
      maxParticles: 65_536,
      radius: 12,
      spawnRate: 1200,
      gravity: 1300,
      solverPasses: 3,
    });
  });

  it('composes reusable physics before its content plugin', () => {
    expect(ballPitDefinition.createPlugins().map(({ id }) => id)).toEqual([
      DENSE_CIRCLE_PARTICLE_PLUGIN_ID,
      BALL_PIT_PLUGIN_ID,
    ]);
  });

  it('normalizes scaled settings and preserves the frozen preview profile', () => {
    expect(createBallPitConfig({ maxParticles: 2000 }).maxParticles).toBe(2048);
    expect(createBallPitConfig({ gravity: 1312 }).gravity).toBe(1300);
    expect(ballPitConfigForProfile(BALL_PIT_DEFAULTS, 'preview')).toMatchObject({
      maxParticles: 96,
      radius: 9,
      radiusVariation: 0.18,
      solverPasses: 2,
      substeps: 1,
      gravity: 1050,
    });
    expect(() => createBallPitConfig({ radius: 100 })).toThrow('outside its supported range');
  });

  it('runs as a vertical engine plugin and responds to pointer input', async () => {
    let clearColor: readonly number[] = [];
    let bloomEnabled = false;
    const renderer = new FakeRender2D(
      (color) => { clearColor = color; },
      (enabled) => { bloomEnabled = enabled; },
    );
    const fakeRendererPlugin = {
      id: 'test.render-2d',
      version: '1.0.0',
      dependencies: [{ id: 'gl-game-lab.runtime' }],
      install: (context: import('@hooksjam/gl-game-lab-core').PluginInstallContext) => { context.provide(EngineRender2D, renderer); },
    };
    const engine = new GameEngine({ plugins: [fakeRendererPlugin, ...ballPitDefinition.createPlugins()] });
    await engine.initialize();
    await engine.start();

    engine.frame(1 / 60);
    const controller = engine.kernel.get(BallPitControllerService);
    expect(controller.bodyCount).toBe(0);
    expect(renderer.particleCount).toBe(0);
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 1, x: 400, y: 100, buttons: 1 });
    engine.frame(1 / 60);
    expect(controller.bodyCount).toBe(1);
    expect(renderer.particleCount).toBe(1);
    controller.setStyle('neon');
    expect(bloomEnabled).toBe(false);
    controller.setStyle('ocean');
    expect(controller.styleId).toBe('ocean');
    expect(bloomEnabled).toBe(false);
    expect(clearColor).toEqual([3 / 255, 21 / 255, 37 / 255, 1]);
    controller.setMode('stream');
    controller.setSetting('spawnRate', 50);
    expect(controller.mode).toBe('stream');
    expect(controller.settings.spawnRate).toBe(50);
    controller.reset();
    expect(controller.bodyCount).toBe(0);

    controller.setMode('stream');
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 2, x: 400, y: 90, buttons: 1 });
    for (let frame = 0; frame < 60; frame += 1) engine.frame(1 / 60);
    expect(controller.bodyCount).toBe(50);
    engine.input.ingest({ kind: 'pointer', phase: 'up', id: 2, x: 400, y: 90, buttons: 0 });
    engine.frame(1 / 60);

    controller.reset();
    controller.setMode('single');
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 3, x: 400, y: 300, buttons: 1 });
    engine.frame(1 / 60);
    engine.input.ingest({ kind: 'pointer', phase: 'up', id: 3, x: 400, y: 300, buttons: 0 });
    engine.frame(1 / 60);
    const world = engine.kernel.get(DenseCircleParticleWorld2DService);
    const beforeDragX = world.positions[0] ?? 0;
    const beforeDragY = world.positions[1] ?? 0;
    const beforeDragVelocityX = world.velocities[0] ?? 0;
    controller.setMode('interact');
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 4, x: beforeDragX, y: beforeDragY, buttons: 1 });
    engine.frame(1 / 60);
    engine.input.ingest({ kind: 'pointer', phase: 'move', id: 4, x: beforeDragX + 100, y: beforeDragY, buttons: 1 });
    engine.frame(1 / 60);
    expect(world.velocities[0]).toBeGreaterThan(beforeDragVelocityX);
    engine.input.ingest({ kind: 'pointer', phase: 'up', id: 4, x: beforeDragX + 100, y: beforeDragY, buttons: 0 });
    engine.frame(1 / 60);

    const beforeExplosionVelocityX = world.velocities[0] ?? 0;
    const ballX = world.positions[0] ?? 0;
    const ballY = world.positions[1] ?? 0;
    controller.setMode('explosion');
    engine.input.ingest({ kind: 'pointer', phase: 'down', id: 5, x: ballX - 20, y: ballY, buttons: 1 });
    engine.frame(1 / 60);
    expect(world.velocities[0]).toBeGreaterThan(beforeExplosionVelocityX);

    await engine.destroy();
  });

  it('uses deterministic automatic spawning only for preview and demo profiles', async () => {
    const renderer = new FakeRender2D();
    const fakeRendererPlugin = {
      id: 'test.render-2d',
      version: '1.0.0',
      dependencies: [{ id: 'gl-game-lab.runtime' }],
      install: (context: import('@hooksjam/gl-game-lab-core').PluginInstallContext) => { context.provide(EngineRender2D, renderer); },
    };
    const engine = new GameEngine({ plugins: [fakeRendererPlugin, ...ballPitDefinition.createPlugins({ profile: 'preview', seed: 7 })] });
    await engine.initialize();
    await engine.start();
    engine.frame(0.25);
    expect(engine.kernel.get(BallPitControllerService).bodyCount).toBe(3);
    await engine.destroy();

    const demoEngine = new GameEngine({ plugins: [fakeRendererPlugin, ...ballPitDefinition.createPlugins({ profile: 'demo', seed: 7 })] });
    await demoEngine.initialize();
    await demoEngine.start();
    for (let frame = 0; frame < 60; frame += 1) demoEngine.frame(1 / 60);
    expect(demoEngine.kernel.get(BallPitControllerService).bodyCount).toBe(BALL_PIT_DEFAULTS.spawnRate);
    expect(renderer.batches.at(-1)?.colorSeeds?.[0]).toBeCloseTo(7147.87598, 4);
    await demoEngine.destroy();
  });
});

class FakeRender2D implements Render2DService {
  readonly viewport = { width: 800, height: 600 };
  readonly batches: ParticleBatch2D[] = [];
  constructor(
    private readonly onClear: (color: readonly number[]) => void = () => undefined,
    private readonly onBloom: (enabled: boolean) => void = () => undefined,
  ) {}
  get particleCount(): number { return this.batches.at(-1)?.count ?? 0; }
  createRgbaTexture(): Texture2DHandle { throw new Error('not used'); }
  destroyTexture(): void {}
  hasTexture(): boolean { return false; }
  texture(): Texture2DHandle { throw new Error('not used'); }
  createBitmapFont(): BitmapFont2DHandle { throw new Error('not used'); }
  destroyBitmapFont(): void {}
  hasBitmapFont(id: string): boolean { return id === DEFAULT_FONT_2D_ID; }
  bitmapFont(): BitmapFont2DHandle { throw new Error('not used'); }
  submit(_sprite: Sprite2DDraw): void {}
  submitText(_text: Text2DDraw): void {}
  submitParticles(batch: ParticleBatch2D): void { this.batches.push(batch); }
  submitSegments(): void {}
  submitTriangleMesh(): void {}
  submitMetaballs(): void {}
  submitFullscreenEffect(): void {}
  setCamera(_camera: Camera2DState): void {}
  setClearColor(color: readonly [number, number, number, number]): void { this.onClear(color); }
  setBloom(options: { readonly enabled: boolean }): void { this.onBloom(options.enabled); }
  setBackdrop(): void {}
}
