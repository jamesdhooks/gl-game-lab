import { quatIdentity, type Quaternion } from '../math/Quaternion.js';
import { vec3One, vec3Zero, type Vec3 } from '../math/Vec3.js';
import { PrefabInstanceComponent, type PrefabInstance } from '../scene/Prefab.js';
import { SceneRootComponent } from '../scene/SceneManager.js';
import {
  ActiveComponent,
  LayerMaskComponent,
  NameComponent,
  TransformComponent,
  VisibilityComponent,
} from '../scene/Transform.js';
import {
  requireJsonBoolean,
  requireJsonNumber,
  requireJsonObject,
  requireJsonString,
  type JsonObject,
  type JsonValue,
} from './Json.js';
import { ComponentSchemaRegistry, type ComponentSchema } from './SchemaRegistry.js';

export function createCoreSchemaRegistry(): ComponentSchemaRegistry {
  return new ComponentSchemaRegistry()
    .register(stringSchema(NameComponent))
    .register(stringSchema(SceneRootComponent))
    .register(booleanSchema(ActiveComponent))
    .register(numberSchema(LayerMaskComponent))
    .register({
      type: VisibilityComponent,
      version: 1,
      encode: (value) => value,
      decode: (data) => {
        const value = requireJsonString(data, 'engine.visibility');
        if (value !== 'inherited' && value !== 'visible' && value !== 'hidden') {
          throw new Error(`Invalid visibility value: ${value}`);
        }
        return value;
      },
    })
    .register({
      type: TransformComponent,
      version: 1,
      encode: (value) => ({
        translation: { ...value.translation },
        rotation: { ...value.rotation },
        scale: { ...value.scale },
      }),
      decode: (data) => {
        const object = requireJsonObject(data, 'engine.transform');
        return {
          translation: decodeVec3(object.translation, 'engine.transform.translation', vec3Zero()),
          rotation: decodeQuaternion(object.rotation, 'engine.transform.rotation'),
          scale: decodeVec3(object.scale, 'engine.transform.scale', vec3One()),
        };
      },
    })
    .register({
      type: PrefabInstanceComponent,
      version: 1,
      encode: encodePrefab,
      decode: decodePrefab,
    });
}

function stringSchema(type: ComponentSchema<string>['type']): ComponentSchema<string> {
  return {
    type,
    version: 1,
    encode: (value) => value,
    decode: (data) => requireJsonString(data, type.id),
  };
}

function booleanSchema(type: ComponentSchema<boolean>['type']): ComponentSchema<boolean> {
  return {
    type,
    version: 1,
    encode: (value) => value,
    decode: (data) => requireJsonBoolean(data, type.id),
  };
}

function numberSchema(type: ComponentSchema<number>['type']): ComponentSchema<number> {
  return {
    type,
    version: 1,
    encode: (value) => value,
    decode: (data) => requireJsonNumber(data, type.id),
  };
}

function decodeVec3(data: JsonValue | undefined, path: string, fallback: Vec3): Vec3 {
  if (data === undefined) return fallback;
  const object = requireJsonObject(data, path);
  return {
    x: requireJsonNumber(object.x, `${path}.x`),
    y: requireJsonNumber(object.y, `${path}.y`),
    z: requireJsonNumber(object.z, `${path}.z`),
  };
}

function decodeQuaternion(data: JsonValue | undefined, path: string): Quaternion {
  if (data === undefined) return quatIdentity();
  const object = requireJsonObject(data, path);
  return {
    x: requireJsonNumber(object.x, `${path}.x`),
    y: requireJsonNumber(object.y, `${path}.y`),
    z: requireJsonNumber(object.z, `${path}.z`),
    w: requireJsonNumber(object.w, `${path}.w`),
  };
}

function encodePrefab(value: PrefabInstance): JsonObject {
  return {
    id: value.id,
    ...(value.variant === undefined ? {} : { variant: value.variant }),
    ...(value.overrides === undefined ? {} : { overrides: value.overrides }),
  };
}

function decodePrefab(data: JsonValue): PrefabInstance {
  const object = requireJsonObject(data, 'engine.prefab-instance');
  const variant = object.variant;
  const overrides = object.overrides;
  if (variant !== undefined && typeof variant !== 'string') throw new Error('Prefab variant must be a string');
  if (overrides !== undefined) requireJsonObject(overrides, 'engine.prefab-instance.overrides');
  return {
    id: requireJsonString(object.id, 'engine.prefab-instance.id'),
    ...(variant === undefined ? {} : { variant }),
    ...(overrides === undefined ? {} : { overrides: overrides as JsonObject }),
  };
}
