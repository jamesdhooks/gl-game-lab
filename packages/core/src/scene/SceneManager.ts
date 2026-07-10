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
    const record = this.requireRecord(id);
    if (record.state === 'loading' || record.state === 'unloading') {
      throw new Error(`Scene ${id} cannot activate while ${record.state}`);
    }
    if (record.state === 'active') return snapshot(record);
    try {
      await record.definition.activate?.(record.context);
    } catch (error) {
      this.events.emit(SceneFailureEvent, { id, phase: 'activate', error });
      throw error;
    }
    record.state = 'active';
    this.events.emit(SceneActivatedEvent, { scene: snapshot(record) });
    if (exclusive) {
      for (const other of [...this.records.values()]) {
        if (other !== record && other.state === 'active') await this.suspend(other.definition.id);
      }
    }
    return snapshot(record);
  }

  async suspend(id: string): Promise<SceneSnapshot> {
    id = normalizeSceneId(id);
    const record = this.requireRecord(id);
    if (record.state !== 'active') return snapshot(record);
    try {
      await record.definition.suspend?.(record.context);
    } catch (error) {
      this.events.emit(SceneFailureEvent, { id, phase: 'suspend', error });
      throw error;
    }
    record.state = 'suspended';
    this.events.emit(SceneSuspendedEvent, { scene: snapshot(record) });
    return snapshot(record);
  }

  async unload(id: string): Promise<void> {
    id = normalizeSceneId(id);
    const record = this.records.get(id);
    if (!record) return;
    if (record.state === 'loading') throw new Error(`Scene ${id} cannot unload while loading`);
    const previous = snapshot(record);
    let firstFailure: unknown;
    if (record.state === 'active') {
      try {
        await record.definition.suspend?.(record.context);
      } catch (error) {
        firstFailure = error;
        this.events.emit(SceneFailureEvent, { id, phase: 'suspend', error });
      }
    }
    record.state = 'unloading';
    try {
      await record.definition.teardown?.(record.context);
    } catch (error) {
      firstFailure ??= error;
      this.events.emit(SceneFailureEvent, { id, phase: 'teardown', error });
    } finally {
      if (this.world.isAlive(record.context.root)) this.hierarchy.despawnSubtree(record.context.root);
      this.records.delete(id);
      this.events.emit(SceneUnloadedEvent, { scene: previous });
    }
    if (firstFailure !== undefined) throw firstFailure;
  }

  async unloadAll(): Promise<void> {
    let firstFailure: unknown;
    for (const id of [...this.records.keys()].reverse()) {
      try {
        await this.unload(id);
      } catch (error) {
        firstFailure ??= error;
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
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
    const context = new SceneContext(this.world, this.hierarchy, this.events, this.prefabs, root);
    const record: SceneRecord = { definition, context, state: 'loading' };
    this.records.set(id, record);
    try {
      await definition.setup(context);
      record.state = 'loaded';
      const loaded = snapshot(record);
      this.events.emit(SceneLoadedEvent, { scene: loaded });
      return loaded;
    } catch (error) {
      this.events.emit(SceneFailureEvent, { id, phase: 'setup', error });
      try {
        await definition.teardown?.(context);
      } catch (teardownError) {
        this.events.emit(SceneFailureEvent, { id, phase: 'teardown', error: teardownError });
      }
      if (this.world.isAlive(root)) this.hierarchy.despawnSubtree(root);
      this.records.delete(id);
      throw error;
    }
  }

  private requireRecord(id: string): SceneRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Scene is not loaded: ${id}`);
    return record;
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
