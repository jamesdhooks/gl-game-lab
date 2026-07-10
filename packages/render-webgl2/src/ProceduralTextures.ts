import type { SpriteTexture } from './SpriteRenderer.js';
import { WebGL2Device, type WebGLTextureResource } from './WebGL2Device.js';

export interface ManagedSpriteTexture extends SpriteTexture {
  readonly width: number;
  readonly height: number;
  readonly resource: WebGLTextureResource;
}

export function createCircleSpriteTexture(
  device: WebGL2Device,
  id = 'engine.circle',
  size = 64,
): ManagedSpriteTexture {
  if (!Number.isSafeInteger(size) || size < 4) throw new Error('Circle texture size must be an integer of at least four');
  const pixels = createCirclePixels(size);
  const resource = device.createTextureFromRgbaPixels(pixels, {
    width: size,
    height: size,
    filter: 'linear',
  });
  return Object.freeze({ id, texture: resource.texture, width: size, height: size, resource });
}

export function createCirclePixels(size: number): Uint8Array {
  if (!Number.isSafeInteger(size) || size < 4) throw new Error('Circle texture size must be an integer of at least four');
  const pixels = new Uint8Array(size * size * 4);
  const center = size * 0.5;
  const radius = size * 0.5 - 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const alpha = Math.max(0, Math.min(1, radius + 0.75 - distance));
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}
