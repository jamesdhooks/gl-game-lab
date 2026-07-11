import { describe, expect, it } from 'vitest';
import {
  Hierarchy,
  NameComponent,
  StableIdComponent,
  TransformComponent,
  World,
  WorldInspector,
  createCoreSchemaRegistry,
  createTransform2D,
} from '../index.js';

describe('WorldInspector', () => {
  it('snapshots hierarchy and edits components through their production schemas', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const root = world.spawn([
      { type: StableIdComponent, value: 'root' },
      { type: NameComponent, value: 'Before' },
      { type: TransformComponent, value: createTransform2D(1, 2) },
    ]);
    const child = world.spawn([{ type: StableIdComponent, value: 'child' }]);
    hierarchy.setParent(child, root);
    const inspector = new WorldInspector(world, hierarchy, createCoreSchemaRegistry());

    const before = inspector.snapshot();
    expect(before.entityCount).toBe(2);
    expect(before.entities.find(({ stableId }) => stableId === 'child')?.parentHandle).toBe(`${root.index}:${root.generation}`);
    expect(before.entities.find(({ stableId }) => stableId === 'root')?.components.map(({ type }) => type)).toEqual([
      'engine.name',
      'engine.transform',
    ]);

    inspector.setComponent(root, NameComponent.id, 'After');
    inspector.setComponent(root, TransformComponent.id, {
      translation: { x: 10, y: 20, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    });
    expect(world.get(root, NameComponent)).toBe('After');
    expect(world.get(root, TransformComponent).translation).toEqual({ x: 10, y: 20, z: 0 });
    expect(inspector.removeComponent(root, NameComponent.id)).toBe(true);
    inspector.setParent(child);
    expect(inspector.snapshot().entities.find(({ stableId }) => stableId === 'child')?.parentHandle).toBeUndefined();
    hierarchy.destroy();
  });

  it('rejects unregistered components, invalid data, and dead entities', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const entity = world.spawn([{ type: StableIdComponent, value: 'editable' }]);
    const inspector = new WorldInspector(world, hierarchy, createCoreSchemaRegistry());

    expect(() => inspector.setComponent(entity, 'missing.component', null)).toThrow('unregistered component');
    expect(() => inspector.setComponent(entity, NameComponent.id, 42)).toThrow('Expected string');
    world.despawn(entity);
    expect(() => inspector.setComponent(entity, NameComponent.id, 'late')).toThrow('dead entity');
    hierarchy.destroy();
  });
});
