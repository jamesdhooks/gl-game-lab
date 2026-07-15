import { describe, expect, it, vi } from 'vitest';
import {
  GAME_ENGINE_RUNTIME_PLUGIN_ID,
  EngineSchedule,
  EngineInput,
  EngineWorld,
  GameEngine,
} from '../index.js';

describe('GameEngine', () => {
  it('composes runtime services for plugins and executes lifecycle phases', async () => {
    const calls: string[] = [];
    const engine = new GameEngine({
      plugins: [{
        id: 'game.example',
        version: '1.0.0',
        dependencies: [{ id: GAME_ENGINE_RUNTIME_PLUGIN_ID }],
        install: (context) => {
          expect(context.get(EngineWorld)).toBe(engine.world);
          expect(context.get(EngineInput)).toBe(engine.input);
          context.get(EngineSchedule).addSystem({
            id: 'game.example.update',
            stage: 'update',
            run: () => { calls.push('update'); },
          });
        },
        start: () => { calls.push('plugin-start'); },
        stop: () => { calls.push('plugin-stop'); },
        dispose: () => { calls.push('plugin-dispose'); },
      }],
    });

    await engine.initialize();
    await engine.start();
    engine.frame(1 / 60);
    await engine.stop();
    await engine.destroy();

    expect(calls).toEqual(['plugin-start', 'update', 'plugin-stop', 'plugin-dispose']);
    expect(engine.state).toBe('destroyed');
  });

  it('rejects frames before the engine is running', () => {
    const engine = new GameEngine();
    expect(() => engine.frame(1 / 60)).toThrow('cannot run a frame');
  });

  it('cleans up a never-initialized engine', async () => {
    const engine = new GameEngine();
    await engine.destroy();
    expect(engine.state).toBe('destroyed');
    expect(() => engine.assets.createGroup('after-destroy')).toThrow('destroyed');
  });

  it('applies one engine time scale to scheduled scene updates', async () => {
    const deltas: number[] = [];
    const engine = new GameEngine({
      plugins: [{
        id: 'game.scaled-time-observer',
        version: '1.0.0',
        dependencies: [{ id: GAME_ENGINE_RUNTIME_PLUGIN_ID }],
        install: (context) => {
          context.get(EngineSchedule).addSystem({
            id: 'game.scaled-time-observer.update',
            stage: 'update',
            run: ({ time }) => { deltas.push(time.deltaSeconds); },
          });
        },
      }],
    });
    engine.setTimeScale(0.25);
    await engine.initialize();
    await engine.start();
    engine.frame(0.2);
    expect(engine.timeScale).toBe(0.25);
    expect(deltas).toEqual([0.05]);
    engine.setTimeScale(0);
    engine.frame(0.2);
    expect(deltas).toEqual([0.05, 0]);
    await engine.destroy();
  });

  it('attempts every runtime cleanup when a never-initialized engine fails disposal', async () => {
    const engine = new GameEngine();
    const unload = vi.spyOn(engine.scenes, 'unloadAll').mockRejectedValue(new Error('scene failed'));
    const destroyAssets = vi.spyOn(engine.assets, 'destroy').mockRejectedValue(new Error('assets failed'));

    await expect(engine.destroy()).rejects.toBeInstanceOf(AggregateError);

    expect(unload).toHaveBeenCalledOnce();
    expect(destroyAssets).toHaveBeenCalledOnce();
    expect(engine.state).toBe('destroyed');
  });

  it('advances platform-fed input before update systems run', async () => {
    const observed: boolean[] = [];
    const engine = new GameEngine({
      plugins: [{
        id: 'game.input-observer',
        version: '1.0.0',
        dependencies: [{ id: GAME_ENGINE_RUNTIME_PLUGIN_ID }],
        install: (context) => {
          const input = context.get(EngineInput);
          context.get(EngineSchedule).addSystem({
            id: 'game.input-observer.update',
            stage: 'update',
            run: () => { observed.push(input.snapshot.isKeyPressed('KeyW')); },
          });
        },
      }],
    });
    await engine.initialize();
    await engine.start();
    engine.input.ingest({ kind: 'key', phase: 'down', code: 'KeyW', key: 'w' });

    engine.frame(1 / 60);

    expect(observed).toEqual([true]);
    await engine.destroy();
  });
});
