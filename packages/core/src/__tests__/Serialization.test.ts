import { describe, expect, it } from 'vitest';
import {
  ComponentSchemaRegistry,
  Hierarchy,
  NameComponent,
  RuntimeOnlyComponent,
  StableIdComponent,
  TransformComponent,
  World,
  WorldSerializer,
  createComponentType,
  createCoreSchemaRegistry,
  createTransform2D,
  requireJsonObject,
  requireJsonString,
  type Entity,
  type JsonValue,
} from '../index.js';

interface EntityLink {
  readonly target: Entity;
  readonly label: string;
}

const EntityLinkComponent = createComponentType<EntityLink>('test.entity-link');

function createRegistry(): ComponentSchemaRegistry {
  return createCoreSchemaRegistry().register({
    type: EntityLinkComponent,
    version: 2,
    migrations: [{
      from: 1,
      migrate: (data) => {
        const object = requireJsonObject(data, 'test.entity-link.v1');
        return {
          target: requireJsonString(object.targetId, 'test.entity-link.v1.targetId'),
          label: object.name ?? 'linked',
        };
      },
    }],
    encode: (value, context) => ({ target: context.entityId(value.target), label: value.label }),
    decode: (data, context) => {
      const object = requireJsonObject(data, 'test.entity-link');
      return {
        target: context.entity(requireJsonString(object.target, 'test.entity-link.target')),
        label: requireJsonString(object.label, 'test.entity-link.label'),
      };
    },
  });
}

describe('WorldSerializer', () => {
  it('round-trips hierarchy, components, and stable cross-entity references', () => {
    const source = new World();
    const sourceHierarchy = new Hierarchy(source);
    const root = source.spawn([
      { type: StableIdComponent, value: 'scene' },
      { type: NameComponent, value: 'Scene' },
      { type: TransformComponent, value: createTransform2D(10, 20) },
    ]);
    const target = source.spawn([
      { type: StableIdComponent, value: 'target' },
      { type: NameComponent, value: 'Target' },
    ]);
    const link = source.spawn([
      { type: StableIdComponent, value: 'link' },
      { type: EntityLinkComponent, value: { target, label: 'follows' } },
    ]);
    const runtimeOnly = source.spawn([
      { type: StableIdComponent, value: 'debug-helper' },
      { type: RuntimeOnlyComponent, value: true },
    ]);
    sourceHierarchy.setParent(target, root);
    sourceHierarchy.setParent(link, root);
    sourceHierarchy.setParent(runtimeOnly, root);
    const serializer = new WorldSerializer(createRegistry());

    const document = serializer.serialize(source);

    expect(document.roots).toEqual(['scene']);
    expect(document.entities.map(({ id }) => id)).toEqual(['scene', 'target', 'link']);
    expect(document.entities[0]?.components.map(({ type }) => type)).toEqual([
      'engine.name',
      'engine.transform',
    ]);

    const destination = new World();
    const destinationHierarchy = new Hierarchy(destination);
    const restored = serializer.deserialize(destination, destinationHierarchy, document);
    const restoredTarget = restored.entities.get('target');
    const restoredLink = restored.entities.get('link');
    expect(restoredTarget).toBeDefined();
    expect(restoredLink && destination.get(restoredLink, EntityLinkComponent)).toEqual({
      target: restoredTarget,
      label: 'follows',
    });
    const restoredRoot = restored.roots[0];
    expect(restoredRoot && destination.get(restoredRoot, TransformComponent).translation).toEqual({
      x: 10,
      y: 20,
      z: 0,
    });
    sourceHierarchy.destroy();
    destinationHierarchy.destroy();
  });

  it('applies every schema migration in order', () => {
    const serializer = new WorldSerializer(createRegistry());
    const document = {
      format: 'gl-game-lab.world',
      version: 1,
      roots: ['source'],
      entities: [
        { id: 'source', components: [] },
        {
          id: 'link',
          parent: 'source',
          components: [{
            type: 'test.entity-link',
            version: 1,
            data: { targetId: 'source', name: 'migrated' },
          }],
        },
      ],
    } as const;
    const world = new World();
    const hierarchy = new Hierarchy(world);

    const result = serializer.deserialize(world, hierarchy, document);

    const source = result.entities.get('source');
    const link = result.entities.get('link');
    expect(link && world.get(link, EntityLinkComponent)).toEqual({ target: source, label: 'migrated' });
    hierarchy.destroy();
  });

  it('requires a contiguous migration chain at registration', () => {
    const registry = new ComponentSchemaRegistry();
    expect(() => registry.register({
      type: EntityLinkComponent,
      version: 3,
      migrations: [{ from: 1, migrate: (data: JsonValue) => data }],
      encode: () => null,
      decode: () => { throw new Error('not used'); },
    })).toThrow('Missing migration for test.entity-link version 2');
  });

  it('rolls back all spawned entities when input cannot be decoded', () => {
    const serializer = new WorldSerializer(createCoreSchemaRegistry());
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const invalid = {
      format: 'gl-game-lab.world',
      version: 1,
      roots: ['root'],
      entities: [{
        id: 'root',
        components: [{ type: 'unknown.component', version: 1, data: {} }],
      }],
    };

    expect(() => serializer.deserialize(world, hierarchy, invalid)).toThrow('No component schema');
    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });

  it('rejects serializable roots without stable ids', () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    world.spawn([{ type: NameComponent, value: 'Missing id' }]);
    const serializer = new WorldSerializer(createCoreSchemaRegistry());

    expect(() => serializer.serialize(world)).toThrow('has no stable id');
    hierarchy.destroy();
  });
});
