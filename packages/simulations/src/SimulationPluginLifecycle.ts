import type { ExtensionToken, PluginInstallContext } from '@hooksjam/gl-game-lab-core';
import {
  ExperienceRuntimeControllerService,
  type ExperienceRuntimeController,
} from '@hooksjam/gl-game-lab-engine';

export type SimulationRuntimeDisposer = () => void | Promise<void>;

/** Publishes one simulation controller and binds its teardown to engine ownership. */
export function registerSimulationRuntime<T extends ExperienceRuntimeController>(
  context: PluginInstallContext,
  token: ExtensionToken<T>,
  controller: T,
  dispose: SimulationRuntimeDisposer = () => undefined,
): void {
  context.provide(token, controller);
  context.provide(ExperienceRuntimeControllerService, controller);

  let active = true;
  context.own('simulation-runtime', async () => {
    if (!active) return;
    active = false;
    await dispose();
  });
}
