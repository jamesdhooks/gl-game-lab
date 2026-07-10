/** Current development version of the GLGameLab engine contracts. */
export const GL_GAME_LAB_VERSION = '0.0.0-dev' as const;

export {
  Engine,
  EngineLifecycleError,
  type EngineOptions,
  type EngineState,
} from './kernel/Engine.js';
export {
  createExtensionToken,
  type ExtensionToken,
  type PluginDependency,
  type PluginInstallContext,
  type EnginePlugin,
} from './kernel/EnginePlugin.js';
