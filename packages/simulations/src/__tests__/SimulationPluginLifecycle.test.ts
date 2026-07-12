import { describe, expect, it, vi } from 'vitest';
import {
  createExtensionToken,
  type ExtensionToken,
  type PluginInstallContext,
} from '@hooksjam/gl-game-lab-core';
import {
  ExperienceRuntimeControllerService,
  type ExperienceRuntimeController,
} from '@hooksjam/gl-game-lab-engine';
import { registerSimulationRuntime } from '../SimulationPluginLifecycle.js';
import { SIMULATION_REGISTRY } from '../index.js';

describe('registerSimulationRuntime', () => {
  it('publishes both controller contracts and owns exact-once asynchronous teardown', async () => {
    const simulationToken = createExtensionToken<ExperienceRuntimeController>('test.simulation.controller');
    const values = new Map<string, unknown>();
    let owned: (() => void | Promise<void>) | undefined;
    const context: PluginInstallContext = {
      pluginId: 'test.simulation',
      provide: <T>(token: ExtensionToken<T>, value: T) => { values.set(token.id, value); },
      get: <T>(token: ExtensionToken<T>) => values.get(token.id) as T,
      tryGet: <T>(token: ExtensionToken<T>) => values.get(token.id) as T | undefined,
      own: (label, dispose) => {
        expect(label).toBe('simulation-runtime');
        owned = dispose;
      },
    };
    const controller: ExperienceRuntimeController = {
      modeId: 'default',
      styleId: 'default',
      settings: Object.freeze({}),
      setMode: () => undefined,
      setStyle: () => undefined,
      setSetting: () => undefined,
      reset: () => undefined,
    };
    const dispose = vi.fn(async () => undefined);

    registerSimulationRuntime(context, simulationToken, controller, dispose);

    expect(values.get(simulationToken.id)).toBe(controller);
    expect(values.get(ExperienceRuntimeControllerService.id)).toBe(controller);
    expect(owned).toBeTypeOf('function');
    await owned?.();
    await owned?.();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('routes every shipped simulation through engine-owned runtime teardown', () => {
    const definitions = SIMULATION_REGISTRY.values();
    expect(definitions).toHaveLength(14);
    for (const definition of definitions) {
      const plugins = definition.createPlugins({ profile: 'preview', seed: 1 });
      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.dependencies).toContainEqual({ id: 'gl-game-lab.runtime' });
      expect(plugins[0]?.dispose).toBeUndefined();
    }
  });
});
