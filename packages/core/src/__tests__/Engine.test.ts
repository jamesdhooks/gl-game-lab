import { describe, expect, it, vi } from 'vitest';
import {
  Engine,
  EngineLifecycleError,
  createExtensionToken,
  type EnginePlugin,
} from '../index.js';

describe('Engine', () => {
  it('installs dependencies before dependents and tears down in reverse order', async () => {
    const calls: string[] = [];
    const dependency = plugin('dependency', calls);
    const consumer = plugin('consumer', calls, [{ id: 'dependency' }]);
    const engine = new Engine({ plugins: [consumer, dependency] });

    await engine.initialize();
    await engine.start();
    await engine.stop();
    await engine.stop();
    await engine.destroy();
    await engine.destroy();

    expect(calls).toEqual([
      'dependency:install',
      'consumer:install',
      'dependency:start',
      'consumer:start',
      'consumer:stop',
      'dependency:stop',
      'consumer:dispose',
      'dependency:dispose',
    ]);
    expect(engine.state).toBe('destroyed');
  });

  it('provides typed extensions to dependent plugins', async () => {
    const valueToken = createExtensionToken<number>('test.value');
    const resultToken = createExtensionToken<string>('test.result');
    const provider: EnginePlugin = {
      id: 'provider',
      version: '1.0.0',
      install(context) {
        context.provide(valueToken, 42);
      },
    };
    const consumer: EnginePlugin = {
      id: 'consumer',
      version: '1.0.0',
      dependencies: [{ id: 'provider' }],
      install(context) {
        context.provide(resultToken, `value:${context.get(valueToken)}`);
      },
    };
    const engine = new Engine({ plugins: [consumer, provider] });

    await engine.initialize();

    expect(engine.get(valueToken)).toBe(42);
    expect(engine.get(resultToken)).toBe('value:42');
    await engine.destroy();
  });

  it('rejects duplicate plugin and extension providers', async () => {
    const token = createExtensionToken<number>('duplicate');
    const engine = new Engine();
    engine.use({ id: 'one', version: '1', install: (context) => context.provide(token, 1) });
    expect(() => engine.use({ id: 'one', version: '2', install: () => undefined })).toThrow(
      'already registered',
    );

    engine.use({ id: 'two', version: '1', install: (context) => context.provide(token, 2) });
    await expect(engine.initialize()).rejects.toBeInstanceOf(EngineLifecycleError);
    expect(engine.state).toBe('failed');
  });

  it('rejects missing, cyclic, and incompatible dependencies', async () => {
    await expect(
      new Engine({ plugins: [plugin('consumer', [], [{ id: 'missing' }])] }).initialize(),
    ).rejects.toThrow('initialization failed');

    const left = plugin('left', [], [{ id: 'right' }]);
    const right = plugin('right', [], [{ id: 'left' }]);
    await expect(new Engine({ plugins: [left, right] }).initialize()).rejects.toThrow(
      'initialization failed',
    );

    const provider = plugin('provider', []);
    const incompatible = plugin('consumer', [], [{ id: 'provider', accepts: () => false }]);
    await expect(new Engine({ plugins: [provider, incompatible] }).initialize()).rejects.toThrow(
      'initialization failed',
    );
  });

  it('rolls back installed plugins when initialization fails', async () => {
    const dispose = vi.fn();
    const engine = new Engine({
      plugins: [
        { id: 'installed', version: '1', install: () => undefined, dispose },
        { id: 'broken', version: '1', install: () => { throw new Error('broken'); } },
      ],
    });

    await expect(engine.initialize()).rejects.toBeInstanceOf(EngineLifecycleError);
    expect(dispose).toHaveBeenCalledOnce();
    expect(engine.state).toBe('failed');
  });

  it('disposes a partially installed plugin and preserves cleanup failures', async () => {
    const token = createExtensionToken<number>('partial.value');
    const disposeInstalled = vi.fn(() => { throw new Error('installed dispose failed'); });
    const disposePartial = vi.fn();
    const engine = new Engine({
      plugins: [
        { id: 'installed', version: '1', install: () => undefined, dispose: disposeInstalled },
        {
          id: 'partial',
          version: '1',
          install(context) {
            context.provide(token, 42);
            throw new Error('partial install failed');
          },
          dispose: disposePartial,
        },
      ],
    });

    const error = await engine.initialize().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(EngineLifecycleError);
    expect((error as EngineLifecycleError).cause).toBeInstanceOf(AggregateError);
    expect(disposePartial).toHaveBeenCalledOnce();
    expect(disposeInstalled).toHaveBeenCalledOnce();
    expect(engine.has(token)).toBe(false);
    expect(engine.state).toBe('failed');
  });

  it('stops a partially started plugin and never remains in a transition state', async () => {
    const calls: string[] = [];
    const dispose = vi.fn();
    const engine = new Engine({
      plugins: [
        {
          id: 'first', version: '1', install: () => undefined,
          start: () => { calls.push('first:start'); },
          stop: () => { calls.push('first:stop'); throw new Error('first stop failed'); },
          dispose,
        },
        {
          id: 'partial', version: '1', install: () => undefined,
          start: () => { calls.push('partial:start'); throw new Error('partial start failed'); },
          stop: () => { calls.push('partial:stop'); },
          dispose,
        },
      ],
    });
    await engine.initialize();

    const error = await engine.start().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(EngineLifecycleError);
    expect((error as EngineLifecycleError).cause).toBeInstanceOf(AggregateError);
    expect(calls).toEqual(['first:start', 'partial:start', 'partial:stop', 'first:stop']);
    expect(engine.state).toBe('failed');
    await engine.destroy();
    expect(engine.state).toBe('destroyed');
  });

  it('finishes teardown attempts when stop and dispose hooks fail', async () => {
    const calls: string[] = [];
    const engine = new Engine({
      plugins: [
        {
          id: 'unstable', version: '1', install: () => undefined,
          start: () => undefined,
          stop: () => { calls.push('stop'); throw new Error('stop failed'); },
          dispose: () => { calls.push('dispose'); throw new Error('dispose failed'); },
        },
      ],
    });
    await engine.initialize();
    await engine.start();

    const error = await engine.destroy().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(EngineLifecycleError);
    expect((error as EngineLifecycleError).cause).toBeInstanceOf(AggregateError);
    expect(calls).toEqual(['stop', 'dispose']);
    expect(engine.state).toBe('failed');
    await engine.destroy();
    expect(engine.state).toBe('destroyed');
  });
});

function plugin(
  id: string,
  calls: string[],
  dependencies: EnginePlugin['dependencies'] = [],
): EnginePlugin {
  return {
    id,
    version: '1.0.0',
    dependencies,
    install: () => { calls.push(`${id}:install`); },
    start: () => { calls.push(`${id}:start`); },
    stop: () => { calls.push(`${id}:stop`); },
    dispose: () => { calls.push(`${id}:dispose`); },
  };
}
