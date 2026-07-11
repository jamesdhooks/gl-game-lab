import { describe, expect, it } from 'vitest';
import { createWebTextureLoader } from '../index.js';

describe('createWebTextureLoader', () => {
  it('transfers the decoded bitmap lifetime to the uploaded texture resource', async () => {
    let closed = false;
    let releaseSource: (() => void) | undefined;
    const texture = {} as WebGLTexture;
    const resource = {
      texture,
      dispose: () => undefined,
    } as never;
    const loader = createWebTextureLoader({
      createTextureFromImage: (source, descriptor) => {
        expect(source).toMatchObject({ width: 16, height: 8 });
        expect(descriptor).toMatchObject({ width: 16, height: 8, filter: 'nearest' });
        releaseSource = descriptor.releaseSource;
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
    expect(closed).toBe(false);
    expect(releaseSource).toBeTypeOf('function');
    releaseSource?.();
    expect(closed).toBe(true);
  });

  it('releases the decoded bitmap when upload fails before ownership transfers', async () => {
    let closed = false;
    const loader = createWebTextureLoader({
      createTextureFromImage: () => { throw new Error('upload failed'); },
    }, {
      fetch: async () => new Response(new Blob(['image']), { status: 200 }),
      createImageBitmap: async () => ({
        width: 16,
        height: 8,
        close: () => { closed = true; },
      }) as ImageBitmap,
    });

    await expect(loader.load({
      signal: new AbortController().signal,
      load: async () => { throw new Error('not used'); },
    }, {
      id: 'broken',
      type: loader.type,
      source: 'broken.png',
    })).rejects.toThrow('upload failed');
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
