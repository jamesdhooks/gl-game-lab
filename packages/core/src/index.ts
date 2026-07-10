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
