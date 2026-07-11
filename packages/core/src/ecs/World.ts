import type { ComponentType, ComponentValue } from './Component.js';
import { assertEntityShape, type Entity } from './Entity.js';
import { Resources } from './Resources.js';
import { SparseSet } from './SparseSet.js';

export interface ComponentEntry<T> {
  readonly type: ComponentType<T>;
  readonly value: T;
}

export type QueryValues<Types extends readonly ComponentType<unknown>[]> = {
  readonly [Index in keyof Types]: ComponentValue<Types[Index]>;
};

export interface QueryItem<Types extends readonly ComponentType<unknown>[]> {
  readonly entity: Entity;
  readonly components: QueryValues<Types>;
}

interface RegisteredStorage {
  readonly type: ComponentType<unknown>;
  readonly values: SparseSet<unknown>;
}

export class WorldMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldMutationError';
  }
}

export class World {
  readonly resources = new Resources();
  private readonly generations: number[] = [];
  private readonly alive: boolean[] = [];
  private readonly freeIndices: number[] = [];
  private readonly storages = new Map<string, RegisteredStorage>();
  private queryDepth = 0;
  private structuralLockDepth = 0;
  private livingCount = 0;
  private readonly despawningIndices = new Set<number>();
  private readonly beforeDespawnListeners = new Set<(world: World, entity: Entity) => void>();

  get entityCount(): number {
    return this.livingCount;
  }

  spawn(entries: readonly ComponentEntry<unknown>[] = []): Entity {
    this.assertStructurallyMutable();
    this.validateSpawnEntries(entries);
    const recycledIndex = this.freeIndices.pop();
    const index = recycledIndex ?? this.generations.length;
    if (recycledIndex === undefined) this.generations.push(0);
    this.alive[index] = true;
    this.livingCount += 1;
    const entity = this.entityAt(index);
    for (const entry of entries) this.insertUnknown(entity, entry.type, entry.value);
    return entity;
  }

  despawn(entity: Entity): void {
    this.assertStructurallyMutable();
    this.assertAlive(entity);
    if (this.despawningIndices.has(entity.index)) {
      throw new WorldMutationError(`Entity is already being despawned: ${formatEntity(entity)}`);
    }
    const nextGeneration = entity.generation + 1;
    if (!Number.isSafeInteger(nextGeneration)) {
      throw new Error(`Entity generation overflow: ${formatEntity(entity)}`);
    }

    const listenerFailures: unknown[] = [];
    this.despawningIndices.add(entity.index);
    try {
      for (const listener of this.beforeDespawnListeners) {
        try {
          listener(this, entity);
        } catch (error) {
          listenerFailures.push(error);
        }
      }
      for (const storage of this.storages.values()) storage.values.delete(entity.index);
      this.alive[entity.index] = false;
      this.generations[entity.index] = nextGeneration;
      this.freeIndices.push(entity.index);
      this.livingCount -= 1;
    } finally {
      this.despawningIndices.delete(entity.index);
    }
    if (listenerFailures.length === 1) throw listenerFailures[0];
    if (listenerFailures.length > 1) {
      throw new AggregateError(listenerFailures, `Entity ${formatEntity(entity)} despawn listeners failed`);
    }
  }

  isAlive(entity: Entity): boolean {
    assertEntityShape(entity);
    return this.alive[entity.index] === true && this.generations[entity.index] === entity.generation;
  }

  onBeforeDespawn(listener: (world: World, entity: Entity) => void): () => void {
    this.beforeDespawnListeners.add(listener);
    return () => { this.beforeDespawnListeners.delete(listener); };
  }

  insert<T>(entity: Entity, type: ComponentType<T>, value: T): void {
    this.assertStructurallyMutable();
    this.assertAlive(entity);
    if (value === undefined) throw new Error(`Component ${type.id} cannot store undefined`);
    this.storage(type).set(entity.index, value);
  }

  remove<T>(entity: Entity, type: ComponentType<T>): boolean {
    this.assertStructurallyMutable();
    this.assertAlive(entity);
    return this.storage(type).delete(entity.index);
  }

  has<T>(entity: Entity, type: ComponentType<T>): boolean {
    this.assertAlive(entity);
    return this.storage(type).has(entity.index);
  }

  get<T>(entity: Entity, type: ComponentType<T>): T {
    this.assertAlive(entity);
    const value = this.storage(type).get(entity.index);
    if (value === undefined) throw new Error(`Entity ${formatEntity(entity)} lacks component ${type.id}`);
    return value;
  }

  tryGet<T>(entity: Entity, type: ComponentType<T>): T | undefined {
    this.assertAlive(entity);
    return this.storage(type).get(entity.index);
  }

  *query<Types extends readonly ComponentType<unknown>[]>(...types: Types): IterableIterator<QueryItem<Types>> {
    if (types.length === 0) throw new Error('World query requires at least one component type');
    const storages = types.map((type) => this.storage(type));
    const candidate = storages.reduce((smallest, storage) =>
      storage.size < smallest.size ? storage : smallest,
    );

    this.queryDepth += 1;
    try {
      for (const index of candidate.indices()) {
        if (this.alive[index] !== true) continue;
        const values = storages.map((storage) => storage.get(index));
        if (values.some((value) => value === undefined)) continue;
        yield {
          entity: this.entityAt(index),
          components: values as QueryValues<Types>,
        };
      }
    } finally {
      this.queryDepth -= 1;
    }
  }

  *entities(): IterableIterator<Entity> {
    this.queryDepth += 1;
    try {
      for (let index = 0; index < this.alive.length; index += 1) {
        if (this.alive[index] === true) yield this.entityAt(index);
      }
    } finally {
      this.queryDepth -= 1;
    }
  }

  withStructuralChangesDeferred<T>(operation: () => T): T {
    this.structuralLockDepth += 1;
    try {
      return operation();
    } finally {
      this.structuralLockDepth -= 1;
    }
  }

  private storage<T>(type: ComponentType<T>): SparseSet<T> {
    const existing = this.storages.get(type.id);
    if (existing) {
      if (existing.type !== type) {
        throw new Error(`Component type id is already registered by another token: ${type.id}`);
      }
      return existing.values as SparseSet<T>;
    }
    const values = new SparseSet<T>();
    this.storages.set(type.id, {
      type: type as ComponentType<unknown>,
      values: values as SparseSet<unknown>,
    });
    return values;
  }

  private insertUnknown(entity: Entity, type: ComponentType<unknown>, value: unknown): void {
    this.storage(type).set(entity.index, value);
  }

  private validateSpawnEntries(entries: readonly ComponentEntry<unknown>[]): void {
    const entryTypes = new Map<string, ComponentType<unknown>>();
    for (const entry of entries) {
      if (entry.value === undefined) throw new Error(`Component ${entry.type.id} cannot store undefined`);
      const duplicate = entryTypes.get(entry.type.id);
      if (duplicate) {
        const reason = duplicate === entry.type ? 'more than once' : 'with conflicting type tokens';
        throw new Error(`Spawn entries contain component ${entry.type.id} ${reason}`);
      }
      const registered = this.storages.get(entry.type.id);
      if (registered && registered.type !== entry.type) {
        throw new Error(`Component type id is already registered by another token: ${entry.type.id}`);
      }
      entryTypes.set(entry.type.id, entry.type);
    }
  }

  private entityAt(index: number): Entity {
    const generation = this.generations[index];
    if (generation === undefined) throw new Error(`Entity generation is unavailable for index ${index}`);
    return Object.freeze({ index, generation });
  }

  private assertAlive(entity: Entity): void {
    if (!this.isAlive(entity)) throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
  }

  private assertStructurallyMutable(): void {
    if (this.queryDepth > 0 || this.structuralLockDepth > 0) {
      throw new WorldMutationError('World structure cannot change during query or system execution; use commands');
    }
  }
}

function formatEntity(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}
