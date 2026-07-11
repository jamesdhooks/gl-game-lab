import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';
import type { Hierarchy } from '../scene/Hierarchy.js';
import { NameComponent, ParentComponent, StableIdComponent } from '../scene/Transform.js';
import type { JsonValue } from './Json.js';
import type { ComponentSchemaRegistry, SerializedComponent } from './SchemaRegistry.js';

export interface InspectedComponent extends SerializedComponent {
  readonly editable: true;
}

export interface InspectedEntity {
  readonly entity: Entity;
  readonly handle: string;
  readonly stableId?: string;
  readonly name?: string;
  readonly parentHandle?: string;
  readonly components: readonly InspectedComponent[];
}

export interface WorldInspectionSnapshot {
  readonly entityCount: number;
  readonly entities: readonly InspectedEntity[];
}

/**
 * Schema-backed editing boundary for inspectors and future editor tooling.
 * Only registered, serializable components are exposed or mutated; component
 * validation and migrations therefore stay identical to save/load behavior.
 */
export class WorldInspector {
  constructor(
    private readonly world: World,
    private readonly hierarchy: Hierarchy,
    private readonly schemas: ComponentSchemaRegistry,
  ) {}

  snapshot(): WorldInspectionSnapshot {
    const entities = [...this.world.entities()];
    const context = { entityId: (entity: Entity) => this.requireStableId(entity) };
    const inspected = entities.map((entity): InspectedEntity => {
      const components: InspectedComponent[] = [];
      for (const schema of this.schemas.schemas()) {
        const value = this.world.tryGet(entity, schema.type);
        if (value === undefined) continue;
        components.push({ ...this.schemas.encode(schema, value, context), editable: true });
      }
      const stableId = this.world.tryGet(entity, StableIdComponent);
      const name = this.world.tryGet(entity, NameComponent);
      const parent = this.world.tryGet(entity, ParentComponent);
      return Object.freeze({
        entity,
        handle: entityHandle(entity),
        ...(stableId === undefined ? {} : { stableId }),
        ...(name === undefined ? {} : { name }),
        ...(parent === undefined ? {} : { parentHandle: entityHandle(parent) }),
        components: Object.freeze(components),
      });
    });
    return Object.freeze({ entityCount: this.world.entityCount, entities: Object.freeze(inspected) });
  }

  setComponent(entity: Entity, typeId: string, data: JsonValue, version?: number): void {
    if (!this.world.isAlive(entity)) throw new Error(`Cannot edit dead entity ${entityHandle(entity)}`);
    const schema = this.schemas.get(typeId);
    if (!schema) throw new Error(`Inspector cannot edit unregistered component: ${typeId}`);
    const decoded = this.schemas.decode(
      { type: typeId, version: version ?? schema.version, data },
      { entity: (stableId) => this.resolveStableId(stableId) },
    );
    this.world.insert(entity, decoded.type, decoded.value);
  }

  removeComponent(entity: Entity, typeId: string): boolean {
    if (!this.world.isAlive(entity)) throw new Error(`Cannot edit dead entity ${entityHandle(entity)}`);
    const schema = this.schemas.get(typeId);
    if (!schema) throw new Error(`Inspector cannot remove unregistered component: ${typeId}`);
    return this.world.remove(entity, schema.type);
  }

  setParent(entity: Entity, parent?: Entity): void {
    if (parent) this.hierarchy.setParent(entity, parent);
    else this.hierarchy.clearParent(entity);
  }

  private requireStableId(entity: Entity): string {
    if (!this.world.isAlive(entity)) throw new Error(`Inspector cannot encode dead entity ${entityHandle(entity)}`);
    const stableId = this.world.tryGet(entity, StableIdComponent);
    if (!stableId) throw new Error(`Inspector component references entity without stable id: ${entityHandle(entity)}`);
    return stableId;
  }

  private resolveStableId(stableId: string): Entity {
    for (const { entity, components: [candidate] } of this.world.query(StableIdComponent)) {
      if (candidate === stableId) return entity;
    }
    throw new Error(`Inspector cannot resolve stable entity id: ${stableId}`);
  }
}

function entityHandle(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}
