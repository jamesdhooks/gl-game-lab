import {
  AssetManager,
  ComponentSchemaRegistry,
  EventBus,
  Hierarchy,
  InputState,
  SceneManager,
  Schedule,
  World,
  WorldSerializer,
  createExtensionToken,
} from '@hooksjam/gl-game-lab-core';

export const EngineWorld = createExtensionToken<World>('gl-game-lab.engine.world');
export const EngineHierarchy = createExtensionToken<Hierarchy>('gl-game-lab.engine.hierarchy');
export const EngineEvents = createExtensionToken<EventBus>('gl-game-lab.engine.events');
export const EngineInput = createExtensionToken<InputState>('gl-game-lab.engine.input');
export const EngineAssets = createExtensionToken<AssetManager>('gl-game-lab.engine.assets');
export const EngineSchedule = createExtensionToken<Schedule>('gl-game-lab.engine.schedule');
export const EngineScenes = createExtensionToken<SceneManager>('gl-game-lab.engine.scenes');
export const EngineSchemas = createExtensionToken<ComponentSchemaRegistry>('gl-game-lab.engine.schemas');
export const EngineSerializer = createExtensionToken<WorldSerializer>('gl-game-lab.engine.serializer');
