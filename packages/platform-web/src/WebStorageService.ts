import type { StorageService, StoredValue } from '@hooksjam/gl-game-lab-engine';

export interface StorageArea {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebStorageService implements StorageService {
  private readonly prefix: string;

  constructor(namespace: string, private readonly storage: StorageArea = requireLocalStorage()) {
    const normalized = namespace.trim();
    if (normalized.length === 0) throw new Error('Storage namespace cannot be empty');
    this.prefix = `${normalized}:`;
  }

  async get<T extends StoredValue>(key: string): Promise<T | undefined> {
    const value = this.storage.getItem(this.storageKey(key));
    if (value === null) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (!isStoredValue(parsed)) throw new Error(`Stored value is invalid JSON data: ${key}`);
    return parsed as T;
  }

  async set(key: string, value: StoredValue): Promise<void> {
    if (!isStoredValue(value)) throw new Error(`Storage value contains unsupported data: ${key}`);
    this.storage.setItem(this.storageKey(key), JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(this.storageKey(key));
  }

  async keys(): Promise<readonly string[]> {
    const keys: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(this.prefix)) keys.push(key.slice(this.prefix.length));
    }
    return Object.freeze(keys.sort());
  }

  private storageKey(key: string): string {
    const normalized = key.trim();
    if (normalized.length === 0) throw new Error('Storage key cannot be empty');
    return `${this.prefix}${normalized}`;
  }
}

function isStoredValue(value: unknown, seen = new Set<object>()): value is StoredValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isStoredValue(entry, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value as Record<string, unknown>).every((entry) => isStoredValue(entry, seen));
  seen.delete(value);
  return valid;
}

function requireLocalStorage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('WebStorageService requires browser localStorage');
  return localStorage;
}
