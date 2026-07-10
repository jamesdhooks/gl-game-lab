import { describe, expect, it } from 'vitest';
import { createWebTextureLoader } from '../index.js';

describe('createWebTextureLoader', () => {
  it('decodes a fetched image, uploads it once, and releases the bitmap', async () => {
    let closed = false;
    const texture = {} as WebGLTexture;
    const resource = {
      texture,
      dispose: () => undefined,
    } as never;
    const loader = createWebTextureLoader({
      createTextureFromImage: (source, descriptor) => {
        expect(source).toMatchObject({ width: 16, height: 8 });
        expect(descriptor).toMatchObject({ width: 16, height: 8, filter: 'nearest' });
        return resource;
      },
    }, {
      fetch: async () => new Response(new Blob(['image']), { status: 200 }),
      createImageBitmap: async () => ({
        width: 16,
        height: 8,
        close: () => { closed = true; },
      }) as ImageBitmap,
    });

    const loaded = await loader.load({ signal: new AbortController().signal, load: async () => { throw new Error('not used'); } }, {
      id: 'hero',
      type: loader.type,
      source: 'hero.png',
      options: { filter: 'nearest' },
    });

    expect(loaded).toMatchObject({ id: 'hero', texture, width: 16, height: 8 });
    expect(closed).toBe(true);
  });

  it('reports failed texture requests with their source', async () => {
    const loader = createWebTextureLoader({ createTextureFromImage: () => ({} as never) }, {
      fetch: async () => new Response(null, { status: 404 }),
      createImageBitmap: async () => ({} as ImageBitmap),
    });
    await expect(loader.load({ signal: new AbortController().signal, load: async () => { throw new Error('not used'); } }, {
      id: 'missing',
      type: loader.type,
      source: 'missing.png',
    })).rejects.toThrow('404');
  });
});
