import { describe, expect, it } from 'vitest';
import {
  GAME_ENGINE_RUNTIME_PLUGIN_ID,
  EngineSchedule,
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
});
