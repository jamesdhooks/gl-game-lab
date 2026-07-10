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
  private livingCount = 0;
  private readonly beforeDespawnListeners = new Set<(world: World, entity: Entity) => void>();

  get entityCount(): number {
    return this.livingCount;
  }

  spawn(entries: readonly ComponentEntry<unknown>[] = []): Entity {
    this.assertStructurallyMutable();
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
    for (const listener of this.beforeDespawnListeners) listener(this, entity);
    for (const storage of this.storages.values()) storage.values.delete(entity.index);
    this.alive[entity.index] = false;
    this.generations[entity.index] = entity.generation + 1;
    this.freeIndices.push(entity.index);
    this.livingCount -= 1;
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

  private entityAt(index: number): Entity {
    const generation = this.generations[index];
    if (generation === undefined) throw new Error(`Entity generation is unavailable for index ${index}`);
    return Object.freeze({ index, generation });
  }

  private assertAlive(entity: Entity): void {
    if (!this.isAlive(entity)) throw new Error(`Entity is not alive: ${formatEntity(entity)}`);
  }

  private assertStructurallyMutable(): void {
    if (this.queryDepth > 0) {
      throw new WorldMutationError('World structure cannot change while a query is being iterated');
    }
  }
}

function formatEntity(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}
