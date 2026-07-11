import { describe, expect, it, vi } from 'vitest';
import { ManagedRender2DResources } from '../ManagedRender2DResources.js';
import { SpriteRenderQueue } from '../SpriteRenderQueue.js';
import { WebGLTextureResource, normalizeTextureDescriptor, type WebGL2Device } from '../WebGL2Device.js';

describe('ManagedRender2DResources', () => {
  it('owns textures and fonts while expanding text into validated sprite submissions', () => {
    const deleteTexture = vi.fn();
    const gl = { deleteTexture, deleteFramebuffer: vi.fn() } as unknown as WebGL2RenderingContext;
    const createTextureFromRgbaPixels = vi.fn((pixels: Uint8Array, descriptor: { width: number; height: number }) => (
      new WebGLTextureResource(
        gl,
        Object.freeze({}) as WebGLTexture,
        undefined,
        normalizeTextureDescriptor({ ...descriptor, format: 'rgba8' }),
      )
    ));
    const device = { createTextureFromRgbaPixels } as unknown as Pick<WebGL2Device, 'createTextureFromRgbaPixels'>;
    const sprites = new SpriteRenderQueue(320, 180);
    const uploaded: number[] = [];
    const resources = new ManagedRender2DResources(device, sprites, (bytes) => { uploaded.push(bytes); });

    const texture = resources.createTexture('player', 1, 1, new Uint8Array(4));
    const font = resources.createFont('font', 'A?', 2, 1, 1, new Uint8Array(8));
    resources.submit({ texture, x: 1, y: 2, width: 3, height: 4 });
    resources.submitText({ font, text: 'AZ', x: 10, y: 20, size: 1, align: 'left' });

    expect(uploaded).toEqual([4, 8]);
    expect(resources.hasTexture('player')).toBe(true);
    expect(resources.hasFont('font')).toBe(true);
    expect(sprites.count).toBe(3);
    expect(sprites.buildPlan().spriteCount).toBe(3);
    expect(() => resources.createTexture('player', 1, 1, new Uint8Array(4))).toThrow('already registered');

    resources.destroy();
    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(resources.hasTexture('player')).toBe(false);
    expect(resources.hasFont('font')).toBe(false);
  });
});
