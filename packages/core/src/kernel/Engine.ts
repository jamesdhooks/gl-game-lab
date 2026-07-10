import { ExtensionRegistry } from './ExtensionRegistry.js';
import type {
  EnginePlugin,
  ExtensionToken,
  PluginDependency,
  PluginInstallContext,
} from './EnginePlugin.js';

export type EngineState =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'destroying'
  | 'destroyed'
  | 'failed';

export interface EngineOptions {
  readonly plugins?: readonly EnginePlugin[];
}

export class EngineLifecycleError extends Error {
  constructor(
    message: string,
    readonly state: EngineState,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EngineLifecycleError';
  }
}

export class Engine {
  private readonly plugins = new Map<string, EnginePlugin>();
  private readonly extensions = new ExtensionRegistry();
  private orderedPlugins: EnginePlugin[] = [];
  private installedPlugins: EnginePlugin[] = [];
  private startedPlugins: EnginePlugin[] = [];
  private currentState: EngineState = 'created';

  constructor(options: EngineOptions = {}) {
    for (const plugin of options.plugins ?? []) this.use(plugin);
  }

  get state(): EngineState {
    return this.currentState;
  }

  use(plugin: EnginePlugin): this {
    this.requireState('created', 'Plugins can only be registered before initialization');
    const id = normalizePluginId(plugin.id);
    if (this.plugins.has(id)) throw new Error(`Engine plugin is already registered: ${id}`);
    if (plugin.version.trim().length === 0) throw new Error(`Engine plugin ${id} must declare a version`);
    this.plugins.set(id, plugin);
    return this;
  }

  has<T>(token: ExtensionToken<T>): boolean {
    return this.extensions.has(token);
  }

  get<T>(token: ExtensionToken<T>): T {
    return this.extensions.get(token);
  }

  tryGet<T>(token: ExtensionToken<T>): T | undefined {
    return this.extensions.tryGet(token);
  }

  async initialize(): Promise<void> {
    this.requireState('created', 'Engine can only be initialized once');
    this.currentState = 'initializing';
    try {
      this.orderedPlugins = resolvePluginOrder(this.plugins);
      for (const plugin of this.orderedPlugins) {
        const context = this.contextFor(plugin);
        await plugin.install(context);
        this.installedPlugins.push(plugin);
      }
      this.currentState = 'ready';
    } catch (cause) {
      await this.rollbackInstalledPlugins();
      this.currentState = 'failed';
      throw new EngineLifecycleError('Engine initialization failed', 'failed', { cause });
    }
  }

  async start(): Promise<void> {
    if (this.currentState !== 'ready' && this.currentState !== 'stopped') {
      throw new EngineLifecycleError('Engine must be ready or stopped before start', this.currentState);
    }
    this.currentState = 'starting';
    try {
      for (const plugin of this.orderedPlugins) {
        await plugin.start?.(this.contextFor(plugin));
        this.startedPlugins.push(plugin);
      }
      this.currentState = 'running';
    } catch (cause) {
      await this.stopStartedPlugins();
      this.currentState = 'failed';
      throw new EngineLifecycleError('Engine start failed', 'failed', { cause });
    }
  }

  async stop(): Promise<void> {
    if (this.currentState === 'stopped' || this.currentState === 'ready') return;
    this.requireState('running', 'Engine must be running before stop');
    this.currentState = 'stopping';
    await this.stopStartedPlugins();
    this.currentState = 'stopped';
  }

  async destroy(): Promise<void> {
    if (this.currentState === 'destroyed') return;
    if (this.currentState === 'running') await this.stop();
    if (this.currentState === 'initializing' || this.currentState === 'starting' || this.currentState === 'stopping') {
      throw new EngineLifecycleError('Engine cannot be destroyed during a lifecycle transition', this.currentState);
    }

    this.currentState = 'destroying';
    let firstFailure: unknown;
    for (const plugin of [...this.installedPlugins].reverse()) {
      try {
        await plugin.dispose?.(this.contextFor(plugin));
      } catch (error) {
        firstFailure ??= error;
      } finally {
        this.extensions.removeOwner(plugin.id);
      }
    }
    this.installedPlugins = [];
    this.startedPlugins = [];
    this.extensions.clear();
    this.currentState = firstFailure === undefined ? 'destroyed' : 'failed';
    if (firstFailure !== undefined) {
      throw new EngineLifecycleError('Engine destruction failed', 'failed', { cause: firstFailure });
    }
  }

  private contextFor(plugin: EnginePlugin): PluginInstallContext {
    return this.extensions.contextFor(plugin.id);
  }

  private async stopStartedPlugins(): Promise<void> {
    let firstFailure: unknown;
    for (const plugin of [...this.startedPlugins].reverse()) {
      try {
        await plugin.stop?.(this.contextFor(plugin));
      } catch (error) {
        firstFailure ??= error;
      }
    }
    this.startedPlugins = [];
    if (firstFailure !== undefined) throw firstFailure;
  }

  private async rollbackInstalledPlugins(): Promise<void> {
    for (const plugin of [...this.installedPlugins].reverse()) {
      try {
        await plugin.dispose?.(this.contextFor(plugin));
      } finally {
        this.extensions.removeOwner(plugin.id);
      }
    }
    this.installedPlugins = [];
    this.extensions.clear();
  }

  private requireState(expected: EngineState, message: string): void {
    if (this.currentState !== expected) throw new EngineLifecycleError(message, this.currentState);
  }
}

function resolvePluginOrder(plugins: ReadonlyMap<string, EnginePlugin>): EnginePlugin[] {
  const ordered: EnginePlugin[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (plugin: EnginePlugin, path: readonly string[]): void => {
    if (visited.has(plugin.id)) return;
    if (visiting.has(plugin.id)) {
      throw new Error(`Engine plugin dependency cycle: ${[...path, plugin.id].join(' -> ')}`);
    }
    visiting.add(plugin.id);
    for (const dependency of plugin.dependencies ?? []) {
      visitDependency(plugin, dependency, plugins, path, visit);
    }
    visiting.delete(plugin.id);
    visited.add(plugin.id);
    ordered.push(plugin);
  };

  for (const plugin of plugins.values()) visit(plugin, []);
  return ordered;
}

function visitDependency(
  owner: EnginePlugin,
  dependency: PluginDependency,
  plugins: ReadonlyMap<string, EnginePlugin>,
  path: readonly string[],
  visit: (plugin: EnginePlugin, path: readonly string[]) => void,
): void {
  const dependencyId = normalizePluginId(dependency.id);
  const installed = plugins.get(dependencyId);
  if (!installed) {
    if (dependency.optional === true) return;
    throw new Error(`Engine plugin ${owner.id} requires missing plugin ${dependencyId}`);
  }
  if (dependency.accepts && !dependency.accepts(installed.version)) {
    throw new Error(
      `Engine plugin ${owner.id} does not accept ${dependencyId} version ${installed.version}`,
    );
  }
  visit(installed, [...path, owner.id]);
}

function normalizePluginId(id: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Engine plugin id cannot be empty');
  return normalized;
}
