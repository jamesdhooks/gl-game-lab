import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';
import type { Hierarchy } from '../scene/Hierarchy.js';
import {
  ChildrenComponent,
  ParentComponent,
  RuntimeOnlyComponent,
  StableIdComponent,
} from '../scene/Transform.js';
import { assertJsonValue, requireJsonObject } from './Json.js';
import {
  ComponentSchemaRegistry,
  type SerializationReadContext,
  type SerializationWriteContext,
  type SerializedComponent,
} from './SchemaRegistry.js';

export interface SerializedEntity {
  readonly id: string;
  readonly parent?: string;
  readonly components: readonly SerializedComponent[];
}

export interface SerializedWorld {
  readonly format: 'gl-game-lab.world';
  readonly version: 1;
  readonly roots: readonly string[];
  readonly entities: readonly SerializedEntity[];
}

export interface DeserializeWorldOptions {
  readonly parent?: Entity;
  readonly unknownComponents?: 'error' | 'ignore';
}

export interface DeserializedWorld {
  readonly entities: ReadonlyMap<string, Entity>;
  readonly roots: readonly Entity[];
}

export class WorldSerializer {
  constructor(private readonly schemas: ComponentSchemaRegistry) {}

  serialize(world: World, roots?: readonly Entity[]): SerializedWorld {
    const selectedRoots = roots ?? this.discoverRoots(world);
    const stableIds = new Map<string, Entity>();
    for (const { entity, components: [id] } of world.query(StableIdComponent)) {
      const existing = stableIds.get(id);
      if (existing) throw new Error(`Duplicate stable entity id in world: ${id}`);
      stableIds.set(id, entity);
    }
    const context: SerializationWriteContext = {
      entityId: (entity) => {
        if (!world.isAlive(entity)) throw new Error('Cannot serialize reference to dead entity');
        const id = world.tryGet(entity, StableIdComponent);
        if (!id) throw new Error(`Referenced entity ${entity.index}:${entity.generation} has no stable id`);
        return id;
      },
    };
    const entities: SerializedEntity[] = [];
    const rootIds: string[] = [];
    const visited = new Set<string>();
    for (const root of selectedRoots) {
      if (!world.isAlive(root)) throw new Error('Cannot serialize a dead root entity');
      if (world.tryGet(root, RuntimeOnlyComponent) === true) continue;
      const rootId = context.entityId(root);
      rootIds.push(rootId);
      this.serializeEntity(world, root, undefined, context, visited, entities);
    }
    return Object.freeze({
      format: 'gl-game-lab.world',
      version: 1,
      roots: Object.freeze(rootIds),
      entities: Object.freeze(entities),
    });
  }

  deserialize(
    world: World,
    hierarchy: Hierarchy,
    input: unknown,
    options: DeserializeWorldOptions = {},
  ): DeserializedWorld {
    const document = parseWorld(input);
    const existingIds = new Set<string>();
    for (const { components: [id] } of world.query(StableIdComponent)) existingIds.add(id);
    for (const entity of document.entities) {
      if (existingIds.has(entity.id)) throw new Error(`Stable entity id already exists in world: ${entity.id}`);
    }

    const entities = new Map<string, Entity>();
    const spawned: Entity[] = [];
    try {
      for (const serialized of document.entities) {
        const entity = world.spawn([{ type: StableIdComponent, value: serialized.id }]);
        entities.set(serialized.id, entity);
        spawned.push(entity);
      }
      const readContext: SerializationReadContext = {
        entity: (id) => {
          const entity = entities.get(id);
          if (!entity) throw new Error(`Serialized entity reference cannot be resolved: ${id}`);
          return entity;
        },
      };
      for (const serialized of document.entities) {
        const entity = requireEntity(entities, serialized.id);
        for (const component of serialized.components) {
          if (!this.schemas.get(component.type)) {
            if (options.unknownComponents === 'ignore') continue;
            throw new Error(`No component schema is registered for ${component.type}`);
          }
          const decoded = this.schemas.decode(component, readContext);
          world.insert(entity, decoded.type, decoded.value);
        }
      }
      for (const serialized of document.entities) {
        if (serialized.parent) {
          hierarchy.setParent(
            requireEntity(entities, serialized.id),
            requireEntity(entities, serialized.parent),
          );
        }
      }
      const roots = document.roots.map((id) => requireEntity(entities, id));
      if (options.parent) {
        for (const root of roots) hierarchy.setParent(root, options.parent);
      }
      return { entities, roots: Object.freeze(roots) };
    } catch (error) {
      for (const entity of spawned.reverse()) {
        if (world.isAlive(entity)) world.despawn(entity);
      }
      throw error;
    }
  }

  private discoverRoots(world: World): Entity[] {
    const roots: Array<{ readonly id: string; readonly entity: Entity }> = [];
    for (const entity of world.entities()) {
      if (world.has(entity, ParentComponent) || world.tryGet(entity, RuntimeOnlyComponent) === true) continue;
      const id = world.tryGet(entity, StableIdComponent);
      if (!id) throw new Error(`Serializable root entity ${entity.index}:${entity.generation} has no stable id`);
      roots.push({ id, entity });
    }
    roots.sort((left, right) => left.id.localeCompare(right.id));
    return roots.map(({ entity }) => entity);
  }

  private serializeEntity(
    world: World,
    entity: Entity,
    parent: string | undefined,
    context: SerializationWriteContext,
    visited: Set<string>,
    output: SerializedEntity[],
  ): void {
    if (world.tryGet(entity, RuntimeOnlyComponent) === true) return;
    const id = context.entityId(entity);
    if (visited.has(id)) throw new Error(`Entity appears more than once in serialized hierarchy: ${id}`);
    visited.add(id);
    const components: SerializedComponent[] = [];
    for (const schema of this.schemas.schemas()) {
      const value = world.tryGet(entity, schema.type);
      if (value !== undefined) components.push(this.schemas.encode(schema, value, context));
    }
    output.push(Object.freeze({
      id,
      ...(parent === undefined ? {} : { parent }),
      components: Object.freeze(components),
    }));
    for (const child of world.tryGet(entity, ChildrenComponent) ?? []) {
      this.serializeEntity(world, child, id, context, visited, output);
    }
  }
}

function parseWorld(input: unknown): SerializedWorld {
  assertJsonValue(input);
  const object = requireJsonObject(input, 'world');
  if (object.format !== 'gl-game-lab.world') throw new Error('Unsupported serialized world format');
  if (object.version !== 1) throw new Error(`Unsupported serialized world version: ${String(object.version)}`);
  if (!Array.isArray(object.roots) || !object.roots.every((value) => typeof value === 'string')) {
    throw new Error('Serialized world roots must be string ids');
  }
  if (!Array.isArray(object.entities)) throw new Error('Serialized world entities must be an array');
  const ids = new Set<string>();
  const entities: SerializedEntity[] = object.entities.map((value, index) => {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      throw new Error(`Serialized entity ${index} must be an object`);
    }
    if (typeof value.id !== 'string' || value.id.trim().length === 0) {
      throw new Error(`Serialized entity ${index} has invalid id`);
    }
    if (ids.has(value.id)) throw new Error(`Duplicate serialized entity id: ${value.id}`);
    ids.add(value.id);
    if (value.parent !== undefined && typeof value.parent !== 'string') {
      throw new Error(`Serialized entity ${value.id} has invalid parent`);
    }
    if (!Array.isArray(value.components)) {
      throw new Error(`Serialized entity ${value.id} components must be an array`);
    }
    const componentTypes = new Set<string>();
    const components = value.components.map((component: unknown, componentIndex: number) => {
      const parsed = parseComponent(component, value.id as string, componentIndex);
      if (componentTypes.has(parsed.type)) throw new Error(`Duplicate component ${parsed.type} on entity ${value.id as string}`);
      componentTypes.add(parsed.type);
      return parsed;
    });
    return {
      id: value.id,
      ...(value.parent === undefined ? {} : { parent: value.parent }),
      components,
    };
  });
  const roots = object.roots as string[];
  const rootSet = new Set(roots);
  if (rootSet.size !== roots.length) throw new Error('Serialized world contains duplicate roots');
  for (const root of roots) {
    if (!ids.has(root)) throw new Error(`Serialized root does not exist: ${root}`);
  }
  for (const entity of entities) {
    if (entity.parent && !ids.has(entity.parent)) throw new Error(`Serialized parent does not exist: ${entity.parent}`);
    if (entity.parent && rootSet.has(entity.id)) throw new Error(`Serialized root cannot have a parent: ${entity.id}`);
    if (!entity.parent && !rootSet.has(entity.id)) throw new Error(`Parentless serialized entity is not a root: ${entity.id}`);
  }
  return { format: 'gl-game-lab.world', version: 1, roots, entities };
}

function parseComponent(input: unknown, entityId: string, index: number): SerializedComponent {
  assertJsonValue(input, `entities.${entityId}.components[${index}]`);
  const object = requireJsonObject(input, `entities.${entityId}.components[${index}]`);
  if (typeof object.type !== 'string' || object.type.length === 0) {
    throw new Error(`Serialized component ${entityId}[${index}] has invalid type`);
  }
  if (typeof object.version !== 'number' || !Number.isSafeInteger(object.version) || object.version < 1) {
    throw new Error(`Serialized component ${entityId}[${index}] has invalid version`);
  }
  if (object.data === undefined) throw new Error(`Serialized component ${entityId}[${index}] has no data`);
  return { type: object.type, version: object.version, data: object.data };
}

function requireEntity(entities: ReadonlyMap<string, Entity>, id: string): Entity {
  const entity = entities.get(id);
  if (!entity) throw new Error(`Serialized entity cannot be resolved: ${id}`);
  return entity;
}
