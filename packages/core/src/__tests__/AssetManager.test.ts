import { describe, expect, it, vi } from 'vitest';
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
    await expect(manager.load({
      id: 'copy', type: TextAsset, source: 'copy.txt', options: { uppercase: true },
    })).rejects.toThrow('different options');
    await lease.release();
    await manager.destroy();
  });

  it('deduplicates concurrent group loads without leaking a lease', async () => {
    const manager = new AssetManager({ releaseUnused: true });
    const load = vi.fn(async (_context, request: Parameters<ReturnType<typeof textLoader>['load']>[1]) => {
      await Promise.resolve();
      return request.source;
    });
    manager.registerLoader({ ...textLoader(), load });
    const group = manager.createGroup('concurrent');
    const request = { id: 'copy', type: TextAsset, source: 'copy.txt' } as const;

    const [first, second] = await Promise.all([group.load(request), group.load(request)]);

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledOnce();
    expect(manager.snapshot('copy')?.references).toBe(1);
    await group.release();
    expect(manager.snapshot('copy')).toBeUndefined();
  });

  it('waits for in-flight group loads and releases their leases', async () => {
    let resolveLoad: ((value: string) => void) | undefined;
    const manager = new AssetManager({ releaseUnused: true });
    manager.registerLoader({
      ...textLoader(),
      load: () => new Promise<string>((resolve) => { resolveLoad = resolve; }),
    });
    const group = manager.createGroup('closing');
    const loading = group.load({ id: 'copy', type: TextAsset, source: 'copy.txt' });
    const releasing = group.release();
    resolveLoad?.('copy.txt');

    await expect(loading).rejects.toThrow('released while loading');
    await releasing;
    expect(manager.snapshot('copy')).toBeUndefined();
  });

  it('settles unawaited dependency loads before cleaning up a failed parent', async () => {
    const ParentAsset = createAssetType<string>('asset.parent');
    let resolveDependency: ((value: string) => void) | undefined;
    const manager = new AssetManager({ releaseUnused: true });
    manager.registerLoader({
      ...textLoader(),
      load: () => new Promise<string>((resolve) => { resolveDependency = resolve; }),
    });
    manager.registerLoader({
      id: 'test.parent-loader',
      type: ParentAsset,
      canLoad: () => true,
      load(context) {
        void context.load({ id: 'dependency', type: TextAsset, source: 'dependency.txt' });
        throw new Error('parent failed');
      },
    });

    const loading = manager.load({ id: 'parent', type: ParentAsset, source: 'parent.data' });
    await Promise.resolve();
    resolveDependency?.('dependency.txt');

    await expect(loading).rejects.toThrow('parent failed');
    expect(manager.snapshots()).toEqual([]);
  });

  it('deduplicates structurally equivalent option objects', async () => {
    const manager = new AssetManager();
    manager.registerLoader(textLoader());
    const first = manager.load({
      id: 'copy', type: TextAsset, source: 'copy.txt', options: { uppercase: false },
    });
    const second = manager.load({
      id: 'copy', type: TextAsset, source: 'copy.txt', options: { uppercase: false },
    });

    const leases = await Promise.all([first, second]);
    expect(manager.snapshot('copy')?.references).toBe(2);
    await Promise.all(leases.map((lease) => lease.release()));
    await manager.destroy();
  });
});
