import { createComponentType } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import type { ComponentEntry, World } from '../ecs/World.js';
import type { Hierarchy } from './Hierarchy.js';
import { NameComponent, TransformComponent, createTransform } from './Transform.js';
import type { JsonValue } from '../serialization/Json.js';

export interface PrefabInstance {
  readonly id: string;
  readonly variant?: string;
  readonly overrides?: Readonly<Record<string, JsonValue>>;
}

export type PrefabInstanceMetadata = Omit<PrefabInstance, 'id'>;

export interface PrefabDefinition<Props = void> {
  readonly id: string;
  readonly name?: string;
  build(context: PrefabBuildContext, props: Props): void;
}

export const PrefabInstanceComponent = createComponentType<PrefabInstance>('engine.prefab-instance');

export class PrefabBuildContext {
  constructor(
    readonly world: World,
    readonly hierarchy: Hierarchy,
    readonly root: Entity,
    private readonly prefabs: PrefabRegistry,
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
    definition: PrefabDefinition<Props>,
    props: Props,
    metadata: PrefabInstanceMetadata = {},
  ): Entity {
    return this.prefabs.instantiate(definition, props, this.root, metadata);
  }
}

export class PrefabRegistry {
  private readonly definitions = new Map<string, PrefabDefinition<unknown>>();

  constructor(
    private readonly world: World,
    private readonly hierarchy: Hierarchy,
  ) {}

  register<Props>(definition: PrefabDefinition<Props>): this {
    const id = normalizeId(definition.id, 'Prefab');
    if (id !== definition.id) throw new Error('Prefab id cannot contain surrounding whitespace');
    const existing = this.definitions.get(id);
    if (existing && existing !== definition) throw new Error(`Prefab is already registered: ${id}`);
    this.definitions.set(id, definition as PrefabDefinition<unknown>);
    return this;
  }

  get(id: string): PrefabDefinition<unknown> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Prefab is not registered: ${id}`);
    return definition;
  }

  instantiate<Props>(
    definition: PrefabDefinition<Props>,
    props: Props,
    parent?: Entity,
    metadata: PrefabInstanceMetadata = {},
  ): Entity {
    this.register(definition);
    const root = this.world.spawn([
      { type: NameComponent, value: definition.name ?? definition.id },
      { type: PrefabInstanceComponent, value: createPrefabInstance(definition.id, metadata) },
      { type: TransformComponent, value: createTransform() },
    ]);
    try {
      if (parent) this.hierarchy.setParent(root, parent);
      const context = new PrefabBuildContext(this.world, this.hierarchy, root, this);
      definition.build(context, props);
      return root;
    } catch (error) {
      this.hierarchy.despawnSubtree(root);
      throw error;
    }
  }
}

function createPrefabInstance(id: string, metadata: PrefabInstanceMetadata): PrefabInstance {
  return {
    id,
    ...(metadata.variant === undefined ? {} : { variant: metadata.variant }),
    ...(metadata.overrides === undefined ? {} : { overrides: metadata.overrides }),
  };
}

function normalizeId(id: string, label: string): string {
  const normalized = id.trim();
  if (normalized.length === 0) throw new Error(`${label} id cannot be empty`);
  return normalized;
}
