import type { Entity } from '../ecs/Entity.js';
import type { World } from '../ecs/World.js';
import { mat4FromTransform, mat4Multiply, type Mat4 } from '../math/Mat4.js';
import {
  ChildrenComponent,
  GlobalTransformComponent,
  ParentComponent,
  TransformComponent,
  createGlobalTransform,
} from './Transform.js';

export class Hierarchy {
  private readonly unsubscribeDespawn: () => void;

  constructor(private readonly world: World) {
    this.unsubscribeDespawn = world.onBeforeDespawn((_world, entity) => this.onBeforeDespawn(entity));
  }

  setParent(child: Entity, parent: Entity): void {
    if (!this.world.isAlive(child) || !this.world.isAlive(parent)) {
      throw new Error('Hierarchy entities must be alive');
    }
    if (child.index === parent.index && child.generation === parent.generation) {
      throw new Error('Entity cannot be parented to itself');
    }
    this.assertNoCycle(child, parent);
    this.clearParent(child);

    this.world.insert(child, ParentComponent, parent);
    const children = this.world.tryGet(parent, ChildrenComponent) ?? [];
    this.world.insert(parent, ChildrenComponent, [...children, child]);
  }

  clearParent(child: Entity): void {
    const currentParent = this.world.tryGet(child, ParentComponent);
    if (!currentParent) return;
    const siblings = this.world.tryGet(currentParent, ChildrenComponent);
    if (siblings) {
      const next = siblings.filter((candidate) => !sameEntity(candidate, child));
      if (next.length === 0) this.world.remove(currentParent, ChildrenComponent);
      else this.world.insert(currentParent, ChildrenComponent, next);
    }
    this.world.remove(child, ParentComponent);
  }

  updateGlobalTransforms(): void {
    const transformEntities = [...this.world.query(TransformComponent)].map(({ entity }) => entity);
    for (const entity of transformEntities) {
      if (!this.world.has(entity, GlobalTransformComponent)) {
        this.world.insert(entity, GlobalTransformComponent, createGlobalTransform());
      }
    }

    const visited = new Set<string>();
    const active = new Set<string>();
    for (const entity of transformEntities) this.updateEntity(entity, visited, active);
  }

  despawnSubtree(root: Entity): void {
    const failures: unknown[] = [];
    this.despawnSubtreeCollectingFailures(root, failures);
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Hierarchy subtree despawn failed');
  }

  private despawnSubtreeCollectingFailures(root: Entity, failures: unknown[]): void {
    const children = [...(this.world.tryGet(root, ChildrenComponent) ?? [])];
    for (const child of children) {
      if (this.world.isAlive(child)) this.despawnSubtreeCollectingFailures(child, failures);
    }
    if (this.world.isAlive(root)) {
      try {
        this.world.despawn(root);
      } catch (error) {
        failures.push(error);
      }
    }
  }

  destroy(): void {
    this.unsubscribeDespawn();
  }

  private updateEntity(entity: Entity, visited: Set<string>, active: Set<string>): Mat4 {
    const key = entityKey(entity);
    const existing = this.world.get(entity, GlobalTransformComponent).matrix;
    if (visited.has(key)) return existing;
    if (active.has(key)) throw new Error(`Hierarchy cycle detected while updating entity ${key}`);
    active.add(key);

    const local = this.world.get(entity, TransformComponent);
    const localMatrix = mat4FromTransform(local.translation, local.rotation, local.scale);
    const parent = this.world.tryGet(entity, ParentComponent);
    if (parent && this.world.isAlive(parent) && this.world.has(parent, TransformComponent)) {
      if (!this.world.has(parent, GlobalTransformComponent)) {
        this.world.insert(parent, GlobalTransformComponent, createGlobalTransform());
      }
      mat4Multiply(this.updateEntity(parent, visited, active), localMatrix, existing);
    } else {
      existing.set(localMatrix);
    }

    active.delete(key);
    visited.add(key);
    return existing;
  }

  private onBeforeDespawn(entity: Entity): void {
    const children = [...(this.world.tryGet(entity, ChildrenComponent) ?? [])];
    for (const child of children) {
      if (this.world.isAlive(child) && this.world.has(child, ParentComponent)) {
        this.world.remove(child, ParentComponent);
      }
    }
    const parent = this.world.tryGet(entity, ParentComponent);
    if (parent && this.world.isAlive(parent)) {
      const siblings = this.world.tryGet(parent, ChildrenComponent) ?? [];
      const next = siblings.filter((candidate) => !sameEntity(candidate, entity));
      if (next.length === 0 && this.world.has(parent, ChildrenComponent)) {
        this.world.remove(parent, ChildrenComponent);
      } else if (next.length > 0) {
        this.world.insert(parent, ChildrenComponent, next);
      }
    }
  }

  private assertNoCycle(child: Entity, parent: Entity): void {
    let cursor: Entity | undefined = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (sameEntity(cursor, child)) throw new Error('Hierarchy parenting would create a cycle');
      const key = entityKey(cursor);
      if (visited.has(key)) throw new Error('Existing hierarchy contains a cycle');
      visited.add(key);
      cursor = this.world.tryGet(cursor, ParentComponent);
    }
  }
}

function sameEntity(left: Entity, right: Entity): boolean {
  return left.index === right.index && left.generation === right.generation;
}

function entityKey(entity: Entity): string {
  return `${entity.index}:${entity.generation}`;
}
