import { describe, expect, it } from 'vitest';
import {
  ChildrenComponent,
  GlobalTransformComponent,
  Hierarchy,
  ParentComponent,
  Resources,
  TransformComponent,
  World,
  createResourceToken,
  createTransform2D,
} from '../index.js';

describe('Hierarchy', () => {
  it('composes parent and child transforms', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const parent = world.spawn();
    const child = world.spawn();
    world.insert(parent, TransformComponent, createTransform2D(10, 20));
    world.insert(child, TransformComponent, createTransform2D(3, 4));
    hierarchy.setParent(child, parent);

    hierarchy.updateGlobalTransforms();

    const matrix = world.get(child, GlobalTransformComponent).matrix;
    expect(matrix[12]).toBeCloseTo(13);
    expect(matrix[13]).toBeCloseTo(24);
    expect(world.get(parent, ChildrenComponent)).toEqual([child]);
    expect(world.get(child, ParentComponent)).toEqual(parent);
    hierarchy.destroy();
  });

  it('reparents, detaches, and rejects cycles', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const first = world.spawn();
    const second = world.spawn();
    const child = world.spawn();

    hierarchy.setParent(child, first);
    hierarchy.setParent(child, second);
    expect(world.tryGet(first, ChildrenComponent)).toBeUndefined();
    expect(world.get(second, ChildrenComponent)).toEqual([child]);
    expect(() => hierarchy.setParent(second, child)).toThrow('cycle');

    hierarchy.clearParent(child);
    expect(world.tryGet(child, ParentComponent)).toBeUndefined();
    expect(world.tryGet(second, ChildrenComponent)).toBeUndefined();
    hierarchy.destroy();
  });

  it('detaches children when a parent is despawned', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const parent = world.spawn();
    const child = world.spawn();
    hierarchy.setParent(child, parent);

    world.despawn(parent);

    expect(world.isAlive(child)).toBe(true);
    expect(world.tryGet(child, ParentComponent)).toBeUndefined();
    hierarchy.destroy();
  });

  it('despawns complete subtrees explicitly', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const root = world.spawn();
    const child = world.spawn();
    const grandchild = world.spawn();
    hierarchy.setParent(child, root);
    hierarchy.setParent(grandchild, child);

    hierarchy.despawnSubtree(root);

    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });
});

describe('Resources', () => {
  it('stores typed singleton resources and rejects id collisions', () => {
    const resources = new Resources();
    const Score = createResourceToken<number>('game.score');
    const Duplicate = createResourceToken<string>('game.score');
    resources.insert(Score, 12);

    expect(resources.get(Score)).toBe(12);
    expect(resources.has(Score)).toBe(true);
    expect(() => resources.insert(Duplicate, 'bad')).toThrow('another token');
    expect(resources.remove(Score)).toBe(12);
    expect(resources.tryGet(Score)).toBeUndefined();
  });
});
