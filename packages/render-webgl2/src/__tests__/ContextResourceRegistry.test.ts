import { describe, expect, it } from 'vitest';
import { ContextResourceRegistry } from '../index.js';

describe('ContextResourceRegistry', () => {
  it('invalidates in reverse order and restores in priority order', () => {
    const registry = new ContextResourceRegistry();
    const calls: string[] = [];
    registry.register({
      id: 'pipeline', priority: 100,
      invalidate: () => { calls.push('pipeline:invalidate'); },
      restore: () => { calls.push('pipeline:restore'); },
    });
    registry.register({
      id: 'texture', priority: 0,
      invalidate: () => { calls.push('texture:invalidate'); },
      restore: () => { calls.push('texture:restore'); },
    });

    registry.invalidate();
    registry.restore();

    expect(calls).toEqual([
      'pipeline:invalidate', 'texture:invalidate',
      'texture:restore', 'pipeline:restore',
    ]);
    expect(registry.generation).toBe(1);
  });

  it('attempts every restoration and advances generation only on success', () => {
    const registry = new ContextResourceRegistry();
    const restored: string[] = [];
    registry.register({ id: 'broken', restore: () => { throw new Error('failed'); } });
    registry.register({ id: 'later', restore: () => { restored.push('later'); } });

    expect(() => registry.restore()).toThrow('failed');
    expect(restored).toEqual(['later']);
    expect(registry.generation).toBe(0);
  });
});
