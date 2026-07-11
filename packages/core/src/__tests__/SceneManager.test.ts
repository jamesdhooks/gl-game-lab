import { describe, expect, it } from 'vitest';
import {
  ChildrenComponent,
  EventBus,
  Hierarchy,
  NameComponent,
  PrefabInstanceComponent,
  SceneActivatedEvent,
  SceneFailureEvent,
  SceneLoadCancelledError,
  SceneManager,
  TransformComponent,
  World,
  createTransform2D,
  type PrefabDefinition,
  type SceneDefinition,
} from '../index.js';

describe('SceneManager', () => {
  it('loads additive scenes and switches active scenes exclusively', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const events = new EventBus();
    const manager = new SceneManager(world, hierarchy, events);
    const lifecycle: string[] = [];
    const createScene = (id: string): SceneDefinition => ({
      id,
      setup: (context) => {
        lifecycle.push(`${id}:setup`);
        context.spawn([{ type: NameComponent, value: `${id}:entity` }]);
      },
      activate: () => { lifecycle.push(`${id}:activate`); },
      suspend: () => { lifecycle.push(`${id}:suspend`); },
      teardown: () => { lifecycle.push(`${id}:teardown`); },
    });
    manager.register(createScene('menu')).register(createScene('level'));

    await manager.load('menu', { activate: true });
    await manager.load('level', { activate: true });

    expect(manager.snapshot('menu')?.state).toBe('suspended');
    expect(manager.snapshot('level')?.state).toBe('active');
    expect(manager.snapshots()).toHaveLength(2);
    expect(lifecycle).toEqual([
      'menu:setup',
      'menu:activate',
      'level:setup',
      'menu:suspend',
      'level:activate',
    ]);
    await manager.unloadAll();
    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });

  it('builds nested prefabs under scene-owned roots', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const manager = new SceneManager(world, hierarchy);
    const Enemy: PrefabDefinition<{ readonly x: number }> = {
      id: 'game.enemy',
      name: 'Enemy',
      build: (context, props) => {
        context.spawn([{ type: TransformComponent, value: createTransform2D(props.x, 0) }]);
      },
    };
    manager.register({
      id: 'level',
      setup: (context) => { context.instantiate(Enemy, { x: 12 }); },
    });

    const scene = await manager.load('level');
    const sceneChildren = world.get(scene.root, ChildrenComponent);
    expect(sceneChildren).toHaveLength(1);
    const prefabRoot = sceneChildren[0];
    expect(prefabRoot && world.get(prefabRoot, PrefabInstanceComponent)).toEqual({ id: 'game.enemy' });
    expect(prefabRoot && world.get(prefabRoot, ChildrenComponent)).toHaveLength(1);
    await manager.unload('level');
    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });

  it('rolls back complete scene ownership when setup fails', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const events = new EventBus();
    const manager = new SceneManager(world, hierarchy, events);
    const failures: string[] = [];
    events.on(SceneFailureEvent, ({ id, phase }) => { failures.push(`${id}:${phase}`); });
    manager.register({
      id: 'broken',
      setup: (context) => {
        context.spawn();
        throw new Error('setup failed');
      },
    });

    await expect(manager.load('broken')).rejects.toThrow('setup failed');
    expect(world.entityCount).toBe(0);
    expect(manager.snapshot('broken')).toBeUndefined();
    expect(failures).toEqual(['broken:setup']);
    hierarchy.destroy();
  });

  it('emits lifecycle snapshots and cleans up even when teardown fails', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const events = new EventBus();
    const manager = new SceneManager(world, hierarchy, events);
    const activated: string[] = [];
    events.on(SceneActivatedEvent, ({ scene }) => { activated.push(scene.id); });
    manager.register({
      id: 'level',
      setup: () => undefined,
      teardown: () => { throw new Error('teardown failed'); },
    });
    await manager.load('level', { activate: true });

    await expect(manager.unload('level')).rejects.toThrow('teardown failed');
    expect(activated).toEqual(['level']);
    expect(manager.snapshot('level')).toBeUndefined();
    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });

  it('cancels an in-flight load and removes all scene-owned entities', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const manager = new SceneManager(world, hierarchy);
    let finishSetup: (() => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    let teardownCount = 0;
    manager.register({
      id: 'slow',
      async setup(context) {
        observedSignal = context.signal;
        context.spawn();
        await new Promise<void>((resolve) => { finishSetup = resolve; });
      },
      teardown: () => { teardownCount += 1; },
    });

    const loading = manager.load('slow');
    const unloading = manager.unload('slow');
    expect(observedSignal?.aborted).toBe(true);
    finishSetup?.();

    await expect(loading).rejects.toBeInstanceOf(SceneLoadCancelledError);
    await unloading;
    expect(teardownCount).toBe(1);
    expect(manager.snapshot('slow')).toBeUndefined();
    expect(world.entityCount).toBe(0);
    hierarchy.destroy();
  });

  it('restores the previous active scene when exclusive activation fails', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const manager = new SceneManager(world, hierarchy);
    const lifecycle: string[] = [];
    manager.register({
      id: 'menu',
      setup: () => undefined,
      activate: () => { lifecycle.push('menu:activate'); },
      suspend: () => { lifecycle.push('menu:suspend'); },
    });
    manager.register({
      id: 'broken',
      setup: () => undefined,
      activate: () => { lifecycle.push('broken:activate'); throw new Error('activate failed'); },
    });
    await manager.load('menu', { activate: true });
    await manager.load('broken');

    await expect(manager.activate('broken')).rejects.toThrow('activate failed');

    expect(manager.snapshot('menu')?.state).toBe('active');
    expect(manager.snapshot('broken')?.state).toBe('loaded');
    expect(lifecycle).toEqual([
      'menu:activate', 'menu:suspend', 'broken:activate', 'menu:activate',
    ]);
    await manager.unloadAll();
    hierarchy.destroy();
  });

  it('serializes concurrent transitions', async () => {
    const world = new World();
    const hierarchy = new Hierarchy(world);
    const manager = new SceneManager(world, hierarchy);
    const lifecycle: string[] = [];
    let finishFirst: (() => void) | undefined;
    manager.register({
      id: 'first',
      setup: () => undefined,
      async activate() {
        lifecycle.push('first:start');
        await new Promise<void>((resolve) => { finishFirst = resolve; });
        lifecycle.push('first:end');
      },
    });
    manager.register({
      id: 'second',
      setup: () => undefined,
      activate: () => { lifecycle.push('second'); },
    });
    await Promise.all([manager.load('first'), manager.load('second')]);

    const first = manager.activate('first', false);
    const second = manager.activate('second', false);
    await Promise.resolve();
    expect(lifecycle).toEqual(['first:start']);
    finishFirst?.();
    await Promise.all([first, second]);

    expect(lifecycle).toEqual(['first:start', 'first:end', 'second']);
    await manager.unloadAll();
    hierarchy.destroy();
  });
});
