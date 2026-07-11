/** A typed key used for engine extension registration. */
export interface ExtensionToken<T> {
  readonly id: string;
  /** Compile-time-only marker retaining the token value type. */
  readonly valueType?: T;
}

export function createExtensionToken<T>(id: string): ExtensionToken<T> {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Extension token id cannot be empty');
  return Object.freeze({ id: normalized });
}

export interface PluginDependency {
  readonly id: string;
  readonly optional?: boolean;
  /** Optional compatibility predicate evaluated against the installed version. */
  readonly accepts?: (version: string) => boolean;
}

export interface PluginInstallContext {
  readonly pluginId: string;
  provide<T>(token: ExtensionToken<T>, value: T): void;
  get<T>(token: ExtensionToken<T>): T;
  tryGet<T>(token: ExtensionToken<T>): T | undefined;
  /** Registers plugin-lifetime cleanup that the engine runs in reverse acquisition order. */
  own(label: string, dispose: () => void | Promise<void>): void;
}

export interface EnginePlugin {
  readonly id: string;
  readonly version: string;
  readonly dependencies?: readonly PluginDependency[];
  install(context: PluginInstallContext): void | Promise<void>;
  start?(context: PluginInstallContext): void | Promise<void>;
  stop?(context: PluginInstallContext): void | Promise<void>;
  dispose?(context: PluginInstallContext): void | Promise<void>;
}
