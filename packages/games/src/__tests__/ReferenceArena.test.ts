import { describe, expect, it } from 'vitest';
import { NameComponent, TransformComponent, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import {
  DEFAULT_FONT_2D_ID,
  EngineAccessibility,
  EngineAudio,
  EngineRender2D,
  EngineSchedule,
  EngineStorage,
  EngineWorkers,
  EngineWorld,
  GameEngine,
  extractSprite2D,
  type AccessibilityService,
  type AudioService,
  type AudioVoice,
  type BitmapFont2DHandle,
  type Camera2DState,
  type Render2DService,
  type Sprite2DDraw,
  type StorageService,
  type StoredValue,
  type Text2DDraw,
  type Texture2DHandle,
  type WorkerService,
} from '@hooksjam/gl-game-lab-engine';
import { ReferenceArenaControllerService, referenceArenaDefinition } from '../index.js';

describe('Reference Arena', () => {
  it('integrates scenes, ECS sprites, animation, camera, input, physics, audio, saves, and accessibility', async () => {
    const renderer = new FakeRender2D();
    const accessibility = new FakeAccessibility();
    const plugins = referenceArenaDefinition.createPlugins();
    const engine = new GameEngine({ plugins: [createFakePlatform(renderer, accessibility), ...plugins] });

    await engine.initialize();
    await engine.start();
    const controller = engine.kernel.get(ReferenceArenaControllerService);
    expect(controller.loaded).toBe(true);
    expect(controller.highScore).toBe(25);
    expect(engine.scenes.snapshot('gl-game-lab.games.reference-arena.scene')?.state).toBe('active');
    expect(controller.entityCount).toBeGreaterThan(8);

    engine.frame(1 / 60);
    expect(renderer.draws.length).toBeGreaterThan(5);
    expect(renderer.text.some((draw) => draw.text.includes('SCORE'))).toBe(true);
    expect(renderer.camera).toBeDefined();
    const before = playerX(engine);
    engine.input.ingest({ kind: 'key', phase: 'down', code: 'KeyD', key: 'd' });
    for (let frame = 0; frame < 12; frame += 1) engine.frame(1 / 60);
    expect(playerX(engine)).toBeGreaterThan(before);
    expect(accessibility.status).toBe('Reference Arena score 0, best 25.');

    await engine.destroy();
    expect(renderer.textures.size).toBe(0);
  });
});

function createFakePlatform(renderer: FakeRender2D, accessibility: FakeAccessibility): EnginePlugin {
  const storage = new Map<string, StoredValue>([['reference-arena.high-score', 25]]);
  const audio: AudioService = {
    state: 'ready', masterVolume: 1,
    unlock: async () => undefined,
    load: async () => undefined,
    unload: () => undefined,
    play: () => ({ id: 1, playing: true, stop: () => undefined, setVolume: () => undefined } satisfies AudioVoice),
    setMasterVolume: () => undefined,
  };
  const saves: StorageService = {
    get: async <T extends StoredValue>(key: string) => storage.get(key) as T | undefined,
    set: async (key, value) => { storage.set(key, value); },
    remove: async (key) => { storage.delete(key); },
    keys: async () => [...storage.keys()],
  };
  const workers: WorkerService = { execute: async <TInput, TOutput>(_url: string, input: TInput) => input as unknown as TOutput };
  return {
    id: 'test.reference-arena-platform', version: '1.0.0', dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      context.provide(EngineRender2D, renderer);
      context.provide(EngineAudio, audio);
      context.provide(EngineStorage, saves);
      context.provide(EngineWorkers, workers);
      context.provide(EngineAccessibility, accessibility);
      context.get(EngineSchedule).addSystem({
        id: 'test.reference-arena.extract', stage: 'renderExtract',
        run: () => { extractSprite2D(context.get(EngineWorld), renderer); },
      });
    },
  };
}

function playerX(engine: GameEngine): number {
  for (const { components: [name, transform] } of engine.world.query(NameComponent, TransformComponent)) {
    if (name === 'Player') return transform.translation.x;
  }
  throw new Error('Reference Arena player is missing');
}

class FakeRender2D implements Render2DService {
  readonly textures = new Map<string, Texture2DHandle>();
  readonly draws: Sprite2DDraw[] = [];
  readonly text: Text2DDraw[] = [];
  readonly font: BitmapFont2DHandle = Object.freeze({ id: DEFAULT_FONT_2D_ID, characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ?', columns: 12, glyphWidth: 6, glyphHeight: 8, lineHeight: 8 });
  camera: Camera2DState | undefined;
  readonly viewport = { width: 960, height: 540 };
  createRgbaTexture(id: string, width: number, height: number): Texture2DHandle {
    const handle = Object.freeze({ id, width, height }); this.textures.set(id, handle); return handle;
  }
  destroyTexture(texture: Texture2DHandle): void { this.textures.delete(texture.id); }
  hasTexture(id: string): boolean { return this.textures.has(id); }
  texture(id: string): Texture2DHandle { const value = this.textures.get(id); if (!value) throw new Error(id); return value; }
  createBitmapFont(): BitmapFont2DHandle { return this.font; }
  destroyBitmapFont(): void {}
  hasBitmapFont(id: string): boolean { return id === DEFAULT_FONT_2D_ID; }
  bitmapFont(): BitmapFont2DHandle { return this.font; }
  submit(sprite: Sprite2DDraw): void { this.draws.push(sprite); }
  submitText(text: Text2DDraw): void { this.text.push(text); }
  submitParticles(): void {}
  submitSegments(): void {}
  submitTriangleMesh(): void {}
  submitMetaballs(): void {}
  submitFullscreenEffect(): void {}
  createFluidField(): never { throw new Error('not used'); }
  submitFluidField(): void {}
  setCamera(camera: Camera2DState): void { this.camera = camera; }
  setClearColor(): void {}
  setBloom(): void {}
  setBackdrop(): void {}
}

class FakeAccessibility implements AccessibilityService {
  readonly enabled = true;
  status = '';
  announce(): void {}
  setStatus(message: string): void { this.status = message; }
}
