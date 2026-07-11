import { describe, expect, it } from 'vitest';
import { TransformComponent, World, createTransform2D } from '@hooksjam/gl-game-lab-core';
import {
  Camera2DComponent,
  Sprite2DComponent,
  SpriteAnimation2DComponent,
  advanceSpriteAnimations,
  createCamera2D,
  createSprite2D,
  createSpriteAnimation2D,
  extractSprite2D,
  type Camera2DState,
  type Render2DService,
  type Sprite2DDraw,
  type Texture2DHandle,
} from '../index.js';

describe('2D authoring', () => {
  it('advances atlas animation and extracts ECS transforms into backend-neutral draws', () => {
    const world = new World();
    const actor = world.spawn();
    world.insert(actor, TransformComponent, createTransform2D(12, 24, Math.PI / 2, 2, 3, 4));
    world.insert(actor, Sprite2DComponent, createSprite2D('hero', 16, 8));
    world.insert(actor, SpriteAnimation2DComponent, createSpriteAnimation2D([
      [0, 0, 0.5, 1], [0.5, 0, 1, 1],
    ], 10));
    const camera = world.spawn();
    world.insert(camera, TransformComponent, createTransform2D(100, 50));
    world.insert(camera, Camera2DComponent, createCamera2D(1.5));
    const renderer = new FakeRender2D();

    advanceSpriteAnimations(world, 0.1);
    expect(extractSprite2D(world, renderer)).toBe(1);
    expect(renderer.draws[0]).toMatchObject({
      x: 12, y: 24, width: 32, height: 24, rotation: Math.PI / 2,
      uv: [0.5, 0, 1, 1], zIndex: 4,
    });
    expect(renderer.camera).toEqual({ centerX: 100, centerY: 50, zoom: 1.5 });
  });

  it('stops non-looping animation on its final frame', () => {
    const world = new World();
    const actor = world.spawn();
    const sprite = createSprite2D('hero', 1, 1);
    const animation = createSpriteAnimation2D([[0, 0, 0.5, 1], [0.5, 0, 1, 1]], 4, { loop: false });
    world.insert(actor, Sprite2DComponent, sprite);
    world.insert(actor, SpriteAnimation2DComponent, animation);

    advanceSpriteAnimations(world, 1);
    expect(animation).toMatchObject({ frame: 1, playing: false });
    expect(sprite.uv).toEqual([0.5, 0, 1, 1]);
  });
});

class FakeRender2D implements Render2DService {
  readonly draws: Sprite2DDraw[] = [];
  readonly handle = Object.freeze({ id: 'hero', width: 32, height: 8 });
  camera: Camera2DState | undefined;
  createRgbaTexture(): Texture2DHandle { return this.handle; }
  destroyTexture(): void {}
  hasTexture(id: string): boolean { return id === 'hero'; }
  texture(): Texture2DHandle { return this.handle; }
  submit(sprite: Sprite2DDraw): void { this.draws.push(sprite); }
  setCamera(camera: Camera2DState): void { this.camera = camera; }
}
