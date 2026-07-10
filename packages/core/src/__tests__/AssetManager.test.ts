import { describe, expect, it } from 'vitest';
import {
  AssetManager,
  AssetReadyEvent,
  createAssetType,
  type AssetLoader,
} from '../index.js';

const TextAsset = createAssetType<string, { readonly uppercase?: boolean }>('asset.text');

function textLoader(disposed: string[] = []): AssetLoader<string, { readonly uppercase?: boolean }> {
  return {
    id: 'test.text-loader',
    type: TextAsset,
    canLoad: ({ source }) => source.endsWith('.txt'),
    load: (_context, request) => request.options?.uppercase ? request.source.toUpperCase() : request.source,
    dispose: (value) => { disposed.push(value); },
  };
}

describe('AssetManager', () => {
  it('deduplicates concurrent loads and reference-counts typed leases', async () => {
    const manager = new AssetManager();
    let loads = 0;
    manager.registerLoader({
      ...textLoader(),
      load: async (_context, request) => {
        loads += 1;
        await Promise.resolve();
        return request.source;
      },
    });

    const request = { id: 'intro', type: TextAsset, source: 'intro.txt' } as const;
    const [first, second] = await Promise.all([manager.load(request), manager.load(request)]);

    expect(loads).toBe(1);
    expect(first.value).toBe('intro.txt');
    expect(manager.snapshot('intro')?.references).toBe(2);
    await first.release();
    expect(manager.snapshot('intro')?.references).toBe(1);
    await second.release();
    expect(manager.snapshot('intro')?.state).toBe('ready');
    await manager.destroy();
  });

  it('releases dependency assets after their parent', async () => {
    const disposed: string[] = [];
    const CompositeAsset = createAssetType<string>('asset.composite');
    const manager = new AssetManager({ releaseUnused: true });
    manager.registerLoader(textLoader(disposed));
    manager.registerLoader({
      id: 'test.composite-loader',
      type: CompositeAsset,
      canLoad: () => true,
      load: async (context) => `composite:${await context.load({
        id: 'dependency',
        type: TextAsset,
        source: 'dependency.txt',
      })}`,
      dispose: (value) => { disposed.push(value); },
    });

    const lease = await manager.load({ id: 'parent', type: CompositeAsset, source: 'parent.data' });
    expect(manager.snapshot('dependency')?.references).toBe(1);
    await lease.release();

    expect(manager.snapshots()).toEqual([]);
    expect(disposed).toEqual(['composite:dependency.txt', 'dependency.txt']);
  });

  it('detects dependency cycles and cleans failed records', async () => {
    const CyclicAsset = createAssetType<string>('asset.cyclic');
    const manager = new AssetManager();
    manager.registerLoader({
      id: 'test.cyclic-loader',
      type: CyclicAsset,
      canLoad: () => true,
      load: (context) => context.load({ id: 'a', type: CyclicAsset, source: 'a.cycle' }),
    });

    await expect(manager.load({ id: 'a', type: CyclicAsset, source: 'a.cycle' })).rejects.toThrow(
      'Asset dependency cycle: a -> a',
    );
    expect(manager.snapshot('a')).toBeUndefined();
  });

  it('supports group ownership and emits lifecycle events', async () => {
    const manager = new AssetManager({ releaseUnused: true });
    manager.registerLoader(textLoader());
    const ready: string[] = [];
    manager.events.on(AssetReadyEvent, ({ asset }) => { ready.push(asset.id); });
    const group = manager.createGroup('menu');

    const first = await group.load({ id: 'copy', type: TextAsset, source: 'copy.txt' });
    const second = await group.load({ id: 'copy', type: TextAsset, source: 'copy.txt' });

    expect(first).toBe(second);
    expect(manager.snapshot('copy')?.references).toBe(1);
    expect(ready).toEqual(['copy']);
    await group.release();
    expect(manager.snapshot('copy')).toBeUndefined();
  });

  it('rejects id, source, and type collisions', async () => {
    const OtherTextAsset = createAssetType<string>('asset.other-text');
    const manager = new AssetManager();
    manager.registerLoader(textLoader());
    const lease = await manager.load({ id: 'copy', type: TextAsset, source: 'copy.txt' });

    await expect(manager.load({ id: 'copy', type: TextAsset, source: 'other.txt' })).rejects.toThrow(
      'another source',
    );
    await expect(manager.load({ id: 'copy', type: OtherTextAsset, source: 'copy.txt' })).rejects.toThrow(
      'another type',
    );
    await lease.release();
    await manager.destroy();
  });
});
