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
export {
  createComponentType,
  type ComponentType,
  type ComponentValue,
} from './ecs/Component.js';
export {
  entityEquals,
  type Entity,
} from './ecs/Entity.js';
export {
  World,
  WorldMutationError,
  type ComponentEntry,
  type QueryItem,
  type QueryValues,
} from './ecs/World.js';
export {
  CommandBuffer,
  DeferredEntity,
  type EntityTarget,
} from './ecs/CommandBuffer.js';
export {
  createResourceToken,
  Resources,
  type ResourceToken,
} from './ecs/Resources.js';
export {
  vec3,
  vec3One,
  vec3Zero,
  type Vec3,
} from './math/Vec3.js';
export {
  quatFromZRotation,
  quatIdentity,
  type Quaternion,
} from './math/Quaternion.js';
export {
  mat4FromTransform,
  mat4Identity,
  mat4Multiply,
  type Mat4,
} from './math/Mat4.js';
export {
  ActiveComponent,
  ChildrenComponent,
  GlobalTransformComponent,
  LayerMaskComponent,
  NameComponent,
  ParentComponent,
  RuntimeOnlyComponent,
  StableIdComponent,
  TransformComponent,
  VisibilityComponent,
  createTransform,
  createTransform2D,
  type GlobalTransform,
  type Transform,
  type Visibility,
} from './scene/Transform.js';
export { Hierarchy } from './scene/Hierarchy.js';
export {
  Clock,
  type ClockOptions,
  type FrameAdvance,
  type TimeSnapshot,
} from './kernel/Time.js';
export {
  Schedule,
  STANDARD_SCHEDULE_STAGES,
  type ScheduleStageKind,
  type StandardScheduleStage,
  type SystemAccess,
  type SystemContext,
  type SystemDefinition,
} from './kernel/Schedule.js';
export { ScheduleRunner, type ScheduleRunnerState } from './kernel/ScheduleRunner.js';
export {
  createEventToken,
  EventBus,
  type EventListener,
  type EventToken,
} from './events/EventBus.js';
export {
  PrefabBuildContext,
  PrefabInstanceComponent,
  PrefabRegistry,
  type PrefabDefinition,
  type PrefabInstance,
  type PrefabInstanceMetadata,
} from './scene/Prefab.js';
export {
  SceneActivatedEvent,
  SceneContext,
  SceneFailureEvent,
  SceneLoadedEvent,
  SceneManager,
  SceneRootComponent,
  SceneSuspendedEvent,
  SceneUnloadedEvent,
  type LoadSceneOptions,
  type SceneDefinition,
  type SceneEvent,
  type SceneFailure,
  type SceneSnapshot,
  type SceneState,
} from './scene/SceneManager.js';
export {
  AssetFailedEvent,
  AssetGroup,
  AssetLease,
  AssetLoadingEvent,
  AssetManager,
  AssetReadyEvent,
  AssetUnloadedEvent,
  createAssetType,
  type AssetLifecycleEvent,
  type AssetLoader,
  type AssetLoaderContext,
  type AssetManagerOptions,
  type AssetRequest,
  type AssetSnapshot,
  type AssetState,
  type AssetType,
} from './assets/AssetManager.js';
export {
  assertJsonValue,
  requireJsonBoolean,
  requireJsonNumber,
  requireJsonObject,
  requireJsonString,
  type JsonArray,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from './serialization/Json.js';
export {
  ComponentSchemaRegistry,
  type ComponentSchema,
  type SchemaMigration,
  type SerializationReadContext,
  type SerializationWriteContext,
  type SerializedComponent,
} from './serialization/SchemaRegistry.js';
export { createCoreSchemaRegistry } from './serialization/CoreSchemas.js';
export {
  WorldSerializer,
  type DeserializeWorldOptions,
  type DeserializedWorld,
  type SerializedEntity,
  type SerializedWorld,
} from './serialization/WorldSerializer.js';
export {
  SaveSnapshotCodec,
  type RestoredSave,
  type SaveSchema,
  type SaveSnapshot,
} from './serialization/SaveSnapshot.js';
export {
  InputState,
  type InputEvent,
  type InputSnapshot,
  type KeyInputEvent,
  type PointerInputEvent,
  type PointerPhase,
  type PointerSnapshot,
  type WheelInputEvent,
} from './input/InputState.js';
