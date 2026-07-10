import { createComponentType } from '../ecs/Component.js';
import type { Entity } from '../ecs/Entity.js';
import { mat4Identity, type Mat4 } from '../math/Mat4.js';
import { quatFromZRotation, quatIdentity, type Quaternion } from '../math/Quaternion.js';
import { vec3, vec3One, vec3Zero, type Vec3 } from '../math/Vec3.js';

export interface Transform {
  translation: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}

export interface GlobalTransform {
  matrix: Mat4;
}

export type Visibility = 'inherited' | 'visible' | 'hidden';

export const NameComponent = createComponentType<string>('engine.name');
export const StableIdComponent = createComponentType<string>('engine.stable-id');
export const TransformComponent = createComponentType<Transform>('engine.transform');
export const GlobalTransformComponent = createComponentType<GlobalTransform>('engine.global-transform');
export const ParentComponent = createComponentType<Entity>('engine.parent');
export const ChildrenComponent = createComponentType<readonly Entity[]>('engine.children');
export const ActiveComponent = createComponentType<boolean>('engine.active');
export const VisibilityComponent = createComponentType<Visibility>('engine.visibility');
export const LayerMaskComponent = createComponentType<number>('engine.layer-mask');

export function createTransform(): Transform {
  return { translation: vec3Zero(), rotation: quatIdentity(), scale: vec3One() };
}

export function createTransform2D(
  x = 0,
  y = 0,
  rotation = 0,
  scaleX = 1,
  scaleY = scaleX,
  z = 0,
): Transform {
  return {
    translation: vec3(x, y, z),
    rotation: quatFromZRotation(rotation),
    scale: vec3(scaleX, scaleY, 1),
  };
}

export function createGlobalTransform(): GlobalTransform {
  return { matrix: mat4Identity() };
}
