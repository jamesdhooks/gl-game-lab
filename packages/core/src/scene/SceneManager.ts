import { createComponentType } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import type { ComponentEntry, World } from '../ecs/World.js';
import { EventBus, createEventToken } from '../events/EventBus.js';
import type { Hierarchy } from './Hierarchy.js';
import {
  PrefabRegistry,
  type PrefabDefinition,
  type PrefabInstanceMetadata,
} from './Prefab.js';
import { NameComponent, StableIdComponent, TransformComponent, createTransform } from './Transform.js';

export type SceneState = 'loading' | 'loaded' | 'active' | 'suspended' | 'unloading';

export interface SceneDefinition {
  readonly id: string;
  readonly name?: string;
  setup(context: SceneContext): void | Promise<void>;
  activate?(context: SceneContext): void | Promise<void>;
  suspend?(context: SceneContext): void | Promise<void>;
  teardown?(context: SceneContext): void | Promise<void>;
}

export interface SceneSnapshot {
  readonly id: string;
  readonly name: string;
  readonly state: SceneState;
  readonly root: Entity;
}

export interface SceneEvent {
  readonly scene: SceneSnapshot;
}

export interface SceneFailure {
  readonly id: string;
  readonly phase: 'setup' | 'activate' | 'suspend' | 'teardown';
  readonly error: unknown;
}

export const SceneRootComponent = createComponentType<string>('engine.scene-root');
export const SceneLoadedEvent = createEventToken<SceneEvent>('engine.scene-loaded');
export const SceneActivatedEvent = createEventToken<SceneEvent>('engine.scene-activated');
export const SceneSuspendedEvent = createEventToken<SceneEvent>('engine.scene-suspended');
export const SceneUnloadedEvent = createEventToken<SceneEvent>('engine.scene-unloaded');
export const SceneFailureEvent = createEventToken<SceneFailure>('engine.scene-failure');

interface SceneRecord {
  readonly definition: SceneDefinition;
  readonly context: SceneContext;
  readonly controller: AbortController;
  state: SceneState;
}

export interface LoadSceneOptions {
  readonly activate?: boolean;
  readonly exclusive?: boolean;
}

export class SceneContext {
  constructor(
    readonly world: World,
    readonly hierarchy: Hierarchy,
    readonly events: EventBus,
    readonly prefabs: PrefabRegistry,
    readonly root: Entity,
    readonly signal: AbortSignal,
  ) {}

  spawn(entries: readonly ComponentEntry<unknown>[] = []): Entity {
    const entity = this.world.spawn(entries);
    try {
      this.hierarchy.setParent(entity, this.root);
      return entity;
    } catch (error) {
      this.world.despawn(entity);
      throw error;
    }
  }

  instantiate<Props>(
    prefab: PrefabDefinition<Props>,
    props: Props,
    metadata: PrefabInstanceMetadata = {},
  ): Entity {
    return this.prefabs.instantiate(prefab, props, this.root, metadata);
  }
}

export class SceneManager {
  readonly events: EventBus;
  readonly prefabs: PrefabRegistry;
  private readonly definitions = new Map<string, SceneDefinition>();
  private readonly records = new Map<string, SceneRecord>();
  private readonly pendingLoads = new Map<string, Promise<SceneSnapshot>>();
  private transitionTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly world: World,
    private readonly hierarchy: Hierarchy,
    events = new EventBus(),
  ) {
    this.events = events;
    this.prefabs = new PrefabRegistry(world, hierarchy);
  }

  register(definition: SceneDefinition): this {
    const id = normalizeSceneId(definition.id);
    if (id !== definition.id) throw new Error('Scene id cannot contain surrounding whitespace');
    const existing = this.definitions.get(id);
    if (existing && existing !== definition) throw new Error(`Scene is already registered: ${id}`);
    this.definitions.set(id, definition);
    return this;
  }

  snapshot(id: string): SceneSnapshot | undefined {
    const record = this.records.get(normalizeSceneId(id));
    return record ? snapshot(record) : undefined;
  }

  snapshots(): readonly SceneSnapshot[] {
    return [...this.records.values()].map(snapshot);
  }

  async load(id: string, options: LoadSceneOptions = {}): Promise<SceneSnapshot> {
    id = normalizeSceneId(id);
    const pending = this.pendingLoads.get(id);
    if (pending) {
      await pending;
      if (options.activate) await this.activate(id, options.exclusive);
      return snapshot(this.requireRecord(id));
    }
    const existing = this.records.get(id);
    if (existing && existing.state !== 'unloading') {
      if (options.activate && existing.state !== 'active') await this.activate(id, options.exclusive);
      return snapshot(existing);
    }
    const task = this.performLoad(id);
    this.pendingLoads.set(id, task);
    try {
      const loaded = await task;
      if (options.activate) return this.activate(id, options.exclusive);
      return loaded;
    } finally {
      this.pendingLoads.delete(id);
    }
  }

  async activate(id: string, exclusive = true): Promise<SceneSnapshot> {
    id = normalizeSceneId(id);
    return this.enqueueTransition(() => this.performActivate(id, exclusive));
  }

  async suspend(id: string): Promise<SceneSnapshot> {
    id = normalizeSceneId(id);
    return this.enqueueTransition(() => this.performSuspend(id));
  }

  private async performActivate(id: string, exclusive: boolean): Promise<SceneSnapshot> {
    const record = this.requireRecord(id);
    if (record.state === 'loading' || record.state === 'unloading') {
      throw new Error(`Scene ${id} cannot activate while ${record.state}`);
    }
    if (record.state === 'active') return snapshot(record);
    const suspended: SceneRecord[] = [];
    if (exclusive) {
      try {
        for (const other of [...this.records.values()]) {
          if (other !== record && other.state === 'active') {
            try {
              await this.suspendRecord(other);
            } finally {
              if (currentSceneState(other) === 'suspended') suspended.push(other);
            }
          }
        }
      } catch (error) {
        throw await this.restoreSuspendedScenes('Exclusive scene suspension failed', error, suspended);
      }
    }
    try {
      await this.activateRecord(record);
    } catch (error) {
      if (currentSceneState(record) === 'active') throw error;
      throw await this.restoreSuspendedScenes(`Scene ${id} activation failed`, error, suspended);
    }
    return snapshot(record);
  }

  private async performSuspend(id: string): Promise<SceneSnapshot> {
    const record = this.requireRecord(id);
    if (record.state !== 'active') return snapshot(record);
    await this.suspendRecord(record);
    return snapshot(record);
  }

  private async activateRecord(record: SceneRecord): Promise<void> {
    const id = record.definition.id;
    try {
      await record.definition.activate?.(record.context);
    } catch (error) {
      this.events.emit(SceneFailureEvent, { id, phase: 'activate', error });
      throw error;
    }
    record.state = 'active';
    this.events.emit(SceneActivatedEvent, { scene: snapshot(record) });
  }

  private async suspendRecord(record: SceneRecord): Promise<void> {
    const id = record.definition.id;
    try {
      await record.definition.suspend?.(record.context);
    } catch (error) {
      this.events.emit(SceneFailureEvent, { id, phase: 'suspend', error });
      throw error;
    }
    record.state = 'suspended';
    this.events.emit(SceneSuspendedEvent, { scene: snapshot(record) });
  }

  async unload(id: string): Promise<void> {
    id = normalizeSceneId(id);
    const loading = this.records.get(id);
    if (loading?.state === 'loading') loading.controller.abort(`Scene ${id} unload requested`);
    return this.enqueueTransition(() => this.performUnload(id));
  }

  private async performUnload(id: string): Promise<void> {
    let record = this.records.get(id);
    if (!record) return;
    if (record.state === 'loading') {
      const pending = this.pendingLoads.get(id);
      if (pending) {
        try {
          await pending;
        } catch (error) {
          if (containsSceneCancellation(error)) return;
          throw error;
        }
      }
      record = this.records.get(id);
      if (!record) return;
    }
    const previous = snapshot(record);
    const failures: unknown[] = [];
    if (record.state === 'active') {
      try {
        await this.suspendRecord(record);
      } catch (error) {
        failures.push(error);
      }
    }
    record.state = 'unloading';
    try {
      await record.definition.teardown?.(record.context);
    } catch (error) {
      failures.push(error);
      this.events.emit(SceneFailureEvent, { id, phase: 'teardown', error });
    } finally {
      try {
        if (this.world.isAlive(record.context.root)) this.hierarchy.despawnSubtree(record.context.root);
      } catch (error) {
        failures.push(error);
      }
      this.records.delete(id);
      try {
        this.events.emit(SceneUnloadedEvent, { scene: previous });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw sceneFailures(`Scene ${id} unload failed`, failures);
  }

  async unloadAll(): Promise<void> {
    const failures: unknown[] = [];
    for (const id of [...this.records.keys()].reverse()) {
      try {
        await this.unload(id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw sceneFailures('Scene unload-all failed', failures);
  }

  private async performLoad(id: string): Promise<SceneSnapshot> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Scene is not registered: ${id}`);
    const root = this.world.spawn([
      { type: NameComponent, value: definition.name ?? id },
      { type: StableIdComponent, value: id },
      { type: SceneRootComponent, value: id },
      { type: TransformComponent, value: createTransform() },
    ]);
    const controller = new AbortController();
    const context = new SceneContext(
      this.world,
      this.hierarchy,
      this.events,
      this.prefabs,
      root,
      controller.signal,
    );
    const record: SceneRecord = { definition, context, controller, state: 'loading' };
    this.records.set(id, record);
    try {
      await definition.setup(context);
      if (controller.signal.aborted) {
        throw new SceneLoadCancelledError(id, controller.signal.reason);
      }
      record.state = 'loaded';
      const loaded = snapshot(record);
      this.events.emit(SceneLoadedEvent, { scene: loaded });
      return loaded;
    } catch (error) {
      const failures: unknown[] = [error];
      if (!(error instanceof SceneLoadCancelledError)) {
        this.events.emit(SceneFailureEvent, { id, phase: 'setup', error });
      }
      try {
        await definition.teardown?.(context);
      } catch (teardownError) {
        failures.push(teardownError);
        this.events.emit(SceneFailureEvent, { id, phase: 'teardown', error: teardownError });
      }
      try {
        if (this.world.isAlive(root)) this.hierarchy.despawnSubtree(root);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
      this.records.delete(id);
      throw sceneFailures(`Scene ${id} setup failed`, failures);
    }
  }

  private requireRecord(id: string): SceneRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Scene is not loaded: ${id}`);
    return record;
  }

  private enqueueTransition<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = this.transitionTail.then(operation, operation);
    this.transitionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async restoreSuspendedScenes(
    message: string,
    primaryFailure: unknown,
    suspended: readonly SceneRecord[],
  ): Promise<unknown> {
    const failures = [primaryFailure];
    for (const previous of [...suspended].reverse()) {
      try {
        await this.activateRecord(previous);
      } catch (error) {
        failures.push(error);
      }
    }
    return sceneFailures(message, failures);
  }
}

export class SceneLoadCancelledError extends Error {
  constructor(readonly sceneId: string, reason: unknown) {
    super(`Scene load cancelled: ${sceneId}`, { cause: reason });
    this.name = 'SceneLoadCancelledError';
  }
}

function snapshot(record: SceneRecord): SceneSnapshot {
  return Object.freeze({
    id: record.definition.id,
    name: record.definition.name ?? record.definition.id,
    state: record.state,
    root: record.context.root,
  });
}

function normalizeSceneId(id: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error('Scene id cannot be empty');
  return normalized;
}

function currentSceneState(record: SceneRecord): SceneState {
  return record.state;
}

function sceneFailures(message: string, failures: readonly unknown[]): unknown {
  return failures.length === 1 ? failures[0] : new AggregateError(failures, message);
}

function containsSceneCancellation(error: unknown): boolean {
  if (error instanceof SceneLoadCancelledError) return true;
  return error instanceof AggregateError
    && error.errors.length > 0
    && error.errors.every((failure: unknown) => containsSceneCancellation(failure));
}
