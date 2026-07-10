import type { ComponentType } from './Component.js';
import type { Entity } from './Entity.js';
import type { World } from './World.js';

export type EntityTarget = Entity | DeferredEntity;

export class DeferredEntity {
  private resolved: Entity | undefined;

  get entity(): Entity {
    if (!this.resolved) throw new Error('Deferred entity is unavailable until its command buffer is applied');
    return this.resolved;
  }

  resolve(entity: Entity): void {
    if (this.resolved) throw new Error('Deferred entity has already been resolved');
    this.resolved = entity;
  }
}

type WorldCommand = (world: World) => void;

export class CommandBuffer {
  private commands: WorldCommand[] = [];

  get length(): number {
    return this.commands.length;
  }

  spawn(): DeferredEntity {
    const deferred = new DeferredEntity();
    this.commands.push((world) => deferred.resolve(world.spawn()));
    return deferred;
  }

  insert<T>(target: EntityTarget, type: ComponentType<T>, value: T): this {
    this.commands.push((world) => world.insert(resolveTarget(target), type, value));
    return this;
  }

  remove<T>(target: EntityTarget, type: ComponentType<T>): this {
    this.commands.push((world) => { world.remove(resolveTarget(target), type); });
    return this;
  }

  despawn(target: EntityTarget): this {
    this.commands.push((world) => world.despawn(resolveTarget(target)));
    return this;
  }

  apply(world: World): void {
    const pending = this.commands;
    this.commands = [];
    for (const command of pending) command(world);
  }

  clear(): void {
    this.commands = [];
  }
}

function resolveTarget(target: EntityTarget): Entity {
  return target instanceof DeferredEntity ? target.entity : target;
}
