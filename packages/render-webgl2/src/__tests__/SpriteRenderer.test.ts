import { describe, expect, it } from 'vitest';
import { buildSpriteDrawPlan, createSpriteCamera2D, type SpriteTexture } from '../index.js';

const FirstTexture = { id: 'first', texture: {} as WebGLTexture } satisfies SpriteTexture;
const SecondTexture = { id: 'second', texture: {} as WebGLTexture } satisfies SpriteTexture;

describe('buildSpriteDrawPlan', () => {
  it('preserves z order while batching adjacent compatible sprites', () => {
    const camera = createSpriteCamera2D(100, 100);
    const plan = buildSpriteDrawPlan([
      { texture: FirstTexture, x: 0, y: 0, width: 10, height: 10, zIndex: 2 },
      { texture: FirstTexture, x: 0, y: 0, width: 10, height: 10, zIndex: 1 },
      { texture: SecondTexture, x: 0, y: 0, width: 10, height: 10, zIndex: 2 },
      { texture: FirstTexture, x: 0, y: 0, width: 10, height: 10, zIndex: 2 },
    ], camera);

    expect(plan.spriteCount).toBe(4);
    expect(plan.batches.map((batch) => [batch.texture.id, batch.sprites.length])).toEqual([
      ['first', 2],
      ['second', 1],
      ['first', 1],
    ]);
  });

  it('culls off-camera and hidden sprites before GPU upload', () => {
    const camera = createSpriteCamera2D(100, 100);
    const plan = buildSpriteDrawPlan([
      { texture: FirstTexture, x: 500, y: 500, width: 10, height: 10 },
      { texture: FirstTexture, x: 0, y: 0, width: 10, height: 10, visible: false },
      { texture: FirstTexture, x: 0, y: 0, width: 10, height: 10 },
    ], camera);

    expect(plan.spriteCount).toBe(1);
    expect(plan.culledCount).toBe(2);
  });

  it('rejects invalid sprite transforms that would corrupt instance buffers', () => {
    const camera = createSpriteCamera2D(100, 100);
    expect(() => buildSpriteDrawPlan([
      { texture: FirstTexture, x: Number.NaN, y: 0, width: 10, height: 10 },
    ], camera)).toThrow('finite');
  });
});
