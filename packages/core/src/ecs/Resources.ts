const resourceIdentity = Symbol('GLGameLabResourceToken');

export interface ResourceToken<T> {
  readonly id: string;
  readonly [resourceIdentity]: T;
}

export function createResourceToken<T>(id: string): ResourceToken<T> {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Resource token id cannot be empty');
  return Object.freeze({ id: normalized }) as ResourceToken<T>;
}

interface ResourceEntry {
  readonly token: ResourceToken<unknown>;
  value: unknown;
}

export class Resources {
  private readonly entries = new Map<string, ResourceEntry>();

  insert<T>(token: ResourceToken<T>, value: T): void {
    const existing = this.entries.get(token.id);
    if (existing && existing.token !== token) {
      throw new Error(`Resource id is already registered by another token: ${token.id}`);
    }
    this.entries.set(token.id, { token: token as ResourceToken<unknown>, value });
  }

  has<T>(token: ResourceToken<T>): boolean {
    return this.entry(token) !== undefined;
  }

  get<T>(token: ResourceToken<T>): T {
    const entry = this.entry(token);
    if (!entry) throw new Error(`Required world resource is unavailable: ${token.id}`);
    return entry.value as T;
  }

  tryGet<T>(token: ResourceToken<T>): T | undefined {
    return this.entry(token)?.value as T | undefined;
  }

  remove<T>(token: ResourceToken<T>): T | undefined {
    const entry = this.entry(token);
    if (!entry) return undefined;
    this.entries.delete(token.id);
    return entry.value as T;
  }

  clear(): void {
    this.entries.clear();
  }

  private entry<T>(token: ResourceToken<T>): ResourceEntry | undefined {
    const existing = this.entries.get(token.id);
    if (existing && existing.token !== token) {
      throw new Error(`Resource id is already registered by another token: ${token.id}`);
    }
    return existing;
  }
}
