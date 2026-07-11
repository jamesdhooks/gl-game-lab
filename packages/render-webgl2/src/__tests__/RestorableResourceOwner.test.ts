import { describe, expect, it, vi } from 'vitest';
import { ContextResourceRegistry, RestorableResourceOwner } from '../index.js';

describe('RestorableResourceOwner', () => {
  it('atomically replaces a logical resource during context restoration', () => {
    const registry = new ContextResourceRegistry();
    const disposed: number[] = [];
    const restored = vi.fn();
    let generation = 0;
    const owner = new RestorableResourceOwner(registry, {
      id: 'simulation.state',
      create: () => ({ generation: generation += 1 }),
      dispose: (resource) => { disposed.push(resource.generation); },
      restored,
    });

    expect(owner.value.generation).toBe(1);
    registry.restore();
    expect(owner.value.generation).toBe(2);
    expect(disposed).toEqual([1]);
    expect(restored).toHaveBeenCalledWith({ generation: 2 });

    owner.dispose();
    owner.dispose();
    expect(disposed).toEqual([1, 2]);
    expect(registry.size).toBe(0);
  });

  it('releases an initial resource when registration fails', () => {
    const registry = new ContextResourceRegistry();
    registry.register({ id: 'duplicate', restore: () => undefined });
    const dispose = vi.fn();

    expect(() => new RestorableResourceOwner(registry, {
      id: 'duplicate',
      create: () => ({ id: 1 }),
      dispose,
    })).toThrow('already registered');
    expect(dispose).toHaveBeenCalledWith({ id: 1 });
  });

  it('keeps the recreated resource owned when post-restore cleanup fails', () => {
    const registry = new ContextResourceRegistry();
    let generation = 0;
    const owner = new RestorableResourceOwner(registry, {
      id: 'failing-cleanup',
      create: () => ({ generation: generation += 1 }),
      dispose: (resource) => {
        if (resource.generation === 1) throw new Error('stale cleanup failed');
      },
    });

    expect(() => registry.restore()).toThrow('stale cleanup failed');
    expect(owner.value.generation).toBe(2);
    owner.dispose();
  });
});
