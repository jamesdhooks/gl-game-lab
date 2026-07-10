import { describe, expect, it } from 'vitest';
import {
  CommandBuffer,
  World,
  WorldMutationError,
  createComponentType,
  entityEquals,
} from '../index.js';

interface Position {
  x: number;
  y: number;
}

const Position = createComponentType<Position>('test.position');
const Velocity = createComponentType<Position>('test.velocity');
const Label = createComponentType<string>('test.label');

describe('World', () => {
  it('spawns, queries, and removes typed components', () => {
    const world = new World();
    const moving = world.spawn();
    const stationary = world.spawn();
    world.insert(moving, Position, { x: 2, y: 3 });
    world.insert(moving, Velocity, { x: 4, y: 5 });
    world.insert(stationary, Position, { x: 7, y: 8 });

    const results = [...world.query(Position, Velocity)];
    expect(results).toHaveLength(1);
    expect(entityEquals(results[0]!.entity, moving)).toBe(true);
    expect(results[0]!.components).toEqual([{ x: 2, y: 3 }, { x: 4, y: 5 }]);

    expect(world.remove(moving, Velocity)).toBe(true);
    expect([...world.query(Position, Velocity)]).toEqual([]);
    expect(world.entityCount).toBe(2);
  });

  it('increments generations when entity indices are reused', () => {
    const world = new World();
    const first = world.spawn();
    world.despawn(first);
    const replacement = world.spawn();

    expect(replacement.index).toBe(first.index);
    expect(replacement.generation).toBe(first.generation + 1);
    expect(world.isAlive(first)).toBe(false);
    expect(world.isAlive(replacement)).toBe(true);
    expect(() => world.insert(first, Label, 'stale')).toThrow('not alive');
  });

  it('rejects structural mutation while a query is active', () => {
    const world = new World();
    const entity = world.spawn();
    world.insert(entity, Position, { x: 0, y: 0 });

    expect(() => {
      for (const _item of world.query(Position)) world.spawn();
    }).toThrow(WorldMutationError);

    expect(world.spawn()).toBeDefined();
  });

  it('applies deferred structural commands in order', () => {
    const world = new World();
    const commands = new CommandBuffer();
    const deferred = commands.spawn();
    commands
      .insert(deferred, Position, { x: 10, y: 20 })
      .insert(deferred, Label, 'created');

    expect(() => deferred.entity).toThrow('unavailable');
    commands.apply(world);

    expect(world.get(deferred.entity, Position)).toEqual({ x: 10, y: 20 });
    expect(world.get(deferred.entity, Label)).toBe('created');
    expect(commands.length).toBe(0);

    commands.despawn(deferred).apply(world);
    expect(world.isAlive(deferred.entity)).toBe(false);
  });

  it('rejects different component tokens with the same stable id', () => {
    const world = new World();
    const Duplicate = createComponentType<number>('test.position');
    const entity = world.spawn();
    world.insert(entity, Position, { x: 1, y: 1 });

    expect(() => world.insert(entity, Duplicate, 1)).toThrow('already registered');
  });
});
