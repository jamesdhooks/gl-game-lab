import { describe, expect, it, vi } from 'vitest';
import { normalizeTextureDescriptor, WebGL2Device, WebGLTextureResource } from '../index.js';

describe('normalizeTextureDescriptor', () => {
  it('applies explicit GPU-safe defaults', () => {
    expect(normalizeTextureDescriptor({ width: 320, height: 180 })).toEqual({
      width: 320,
      height: 180,
      format: 'rgba8',
      filter: 'linear',
      wrap: 'clamp',
      renderTarget: false,
    });
  });

  it('rejects invalid render-target dimensions before WebGL allocation', () => {
    expect(() => normalizeTextureDescriptor({ width: 0, height: 1 })).toThrow('Texture width');
    expect(() => normalizeTextureDescriptor({ width: 1.5, height: 1 })).toThrow('Texture width');
  });
});

describe('WebGLTextureResource', () => {
  it('swaps invalidated WebGL handles during context restoration', () => {
    const deletedTextures: WebGLTexture[] = [];
    const deletedFramebuffers: WebGLFramebuffer[] = [];
    const gl = {
      deleteTexture: (texture: WebGLTexture) => { deletedTextures.push(texture); },
      deleteFramebuffer: (framebuffer: WebGLFramebuffer) => { deletedFramebuffers.push(framebuffer); },
    } as unknown as WebGL2RenderingContext;
    const originalTexture = {} as WebGLTexture;
    const originalFramebuffer = {} as WebGLFramebuffer;
    const restoredTexture = {} as WebGLTexture;
    const restoredFramebuffer = {} as WebGLFramebuffer;
    const resource = new WebGLTextureResource(
      gl,
      originalTexture,
      originalFramebuffer,
      normalizeTextureDescriptor({ width: 4, height: 4, renderTarget: true }),
    );

    resource.invalidate();
    resource.restore(restoredTexture, restoredFramebuffer);

    expect(resource.texture).toBe(restoredTexture);
    expect(resource.framebuffer).toBe(restoredFramebuffer);
    resource.dispose();
    resource.dispose();
    expect(deletedTextures).toEqual([originalTexture, restoredTexture]);
    expect(deletedFramebuffers).toEqual([originalFramebuffer, restoredFramebuffer]);
  });

  it('rejects restoration after disposal', () => {
    const gl = {
      deleteTexture: () => undefined,
      deleteFramebuffer: () => undefined,
    } as unknown as WebGL2RenderingContext;
    const resource = new WebGLTextureResource(
      gl,
      {} as WebGLTexture,
      undefined,
      normalizeTextureDescriptor({ width: 1, height: 1 }),
    );
    resource.dispose();

    expect(() => resource.restore({} as WebGLTexture, undefined)).toThrow('Disposed WebGL texture');
  });
});

describe('WebGL2Device context restoration', () => {
  it('allows registered restorers to use device APIs after the restored event', async () => {
    let driverLost = false;
    const viewport = vi.fn();
    const gl = {
      isContextLost: () => driverLost,
      viewport,
      getExtension: () => null,
    } as unknown as WebGL2RenderingContext;
    const events = new EventTarget();
    const canvas = Object.assign(events, {
      width: 8,
      height: 8,
      getContext: () => gl,
    }) as unknown as HTMLCanvasElement;
    const device = new WebGL2Device(canvas);
    device.registerContextResource({
      id: 'device-api-restorer',
      restore: () => { device.resize(16, 9); },
    });

    driverLost = true;
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(device.isContextLost).toBe(true);

    driverLost = false;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    await device.waitForContextRestoration();

    expect(device.isContextLost).toBe(false);
    expect(viewport).toHaveBeenCalledWith(0, 0, 16, 9);
    expect(device.contextGeneration).toBe(1);
    device.destroy();
  });

});
