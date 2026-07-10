import { describe, expect, it } from 'vitest';
import { SpriteRenderQueue, createSpriteCamera2D, type SpriteTexture } from '../index.js';

const Texture = { id: 'test', texture: {} as WebGLTexture } satisfies SpriteTexture;

describe('SpriteRenderQueue', () => {
  it('collects game submissions, applies the active camera, and clears at a frame boundary', () => {
    const queue = new SpriteRenderQueue(100, 100);
    queue.submit({ texture: Texture, x: 0, y: 0, width: 10, height: 10 });
    queue.setCamera(createSpriteCamera2D(100, 100, { centerX: 10 }));

    expect(queue.count).toBe(1);
    expect(queue.buildPlan().spriteCount).toBe(1);
    expect(queue.activeCamera.centerX).toBe(10);
    queue.clear();
    expect(queue.count).toBe(0);
  });
});
