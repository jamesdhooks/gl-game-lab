import { describe, expect, it } from 'vitest';
import { WebStorageService, type StorageArea } from '../index.js';

class MemoryStorage implements StorageArea {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('WebStorageService', () => {
  it('isolates, validates, and enumerates namespaced save data', async () => {
    const area = new MemoryStorage();
    const saves = new WebStorageService('arena', area);
    const other = new WebStorageService('other', area);
    await saves.set('slot-b', { score: 42, flags: [true, false] });
    await saves.set('slot-a', 'ready');
    await other.set('slot-a', 'hidden');

    await expect(saves.get('slot-b')).resolves.toEqual({ score: 42, flags: [true, false] });
    await expect(saves.keys()).resolves.toEqual(['slot-a', 'slot-b']);
    await saves.remove('slot-a');
    await expect(saves.get('slot-a')).resolves.toBeUndefined();
    await expect(other.get('slot-a')).resolves.toBe('hidden');
  });

  it('rejects empty keys and values that JSON cannot preserve', async () => {
    const saves = new WebStorageService('arena', new MemoryStorage());
    await expect(saves.set(' ', 1)).rejects.toThrow('key');
    await expect(saves.set('score', Number.POSITIVE_INFINITY)).rejects.toThrow('unsupported');
  });
});
