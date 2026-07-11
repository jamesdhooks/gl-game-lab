import type { ExtensionToken, PluginInstallContext } from './EnginePlugin.js';

interface ExtensionEntry {
  readonly owner: string;
  readonly value: unknown;
}

export class ExtensionRegistry {
  private readonly entries = new Map<string, ExtensionEntry>();

  has<T>(token: ExtensionToken<T>): boolean {
    return this.entries.has(token.id);
  }

  get<T>(token: ExtensionToken<T>): T {
    const entry = this.entries.get(token.id);
    if (!entry) throw new Error(`Required engine extension is unavailable: ${token.id}`);
    return entry.value as T;
  }

  tryGet<T>(token: ExtensionToken<T>): T | undefined {
    return this.entries.get(token.id)?.value as T | undefined;
  }

  contextFor(owner: string, own: PluginInstallContext['own'] = () => undefined): PluginInstallContext {
    return {
      pluginId: owner,
      provide: <T>(token: ExtensionToken<T>, value: T) => this.provide(owner, token, value),
      get: <T>(token: ExtensionToken<T>) => this.get(token),
      tryGet: <T>(token: ExtensionToken<T>) => this.tryGet(token),
      own,
    };
  }

  removeOwner(owner: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.owner === owner) this.entries.delete(id);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  idsForOwner(owner: string): readonly string[] {
    return Object.freeze([...this.entries].filter(([, entry]) => entry.owner === owner).map(([id]) => id).sort());
  }

  private provide<T>(owner: string, token: ExtensionToken<T>, value: T): void {
    const existing = this.entries.get(token.id);
    if (existing) {
      throw new Error(
        `Engine extension ${token.id} is already provided by ${existing.owner}; ${owner} cannot replace it`,
      );
    }
    this.entries.set(token.id, { owner, value });
  }
}
