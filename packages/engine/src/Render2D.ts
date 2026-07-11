import {
  TransformComponent,
  VisibilityComponent,
  createComponentType,
  type World,
} from '@hooksjam/gl-game-lab-core';

export type BlendMode2D = 'alpha' | 'additive' | 'multiply' | 'opaque';
export type UvRect = readonly [number, number, number, number];
export type ColorRgba = readonly [number, number, number, number];

export interface Texture2DHandle {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface Sprite2DDraw {
  readonly texture: Texture2DHandle;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly tint?: ColorRgba;
  readonly uv?: UvRect;
  readonly zIndex?: number;
  readonly blend?: BlendMode2D;
  readonly visible?: boolean;
}

export interface Camera2DState {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

export interface Render2DService {
  createRgbaTexture(id: string, width: number, height: number, pixels: Uint8Array): Texture2DHandle;
  destroyTexture(texture: Texture2DHandle): void;
  hasTexture(id: string): boolean;
  texture(id: string): Texture2DHandle;
  submit(sprite: Sprite2DDraw): void;
  setCamera(camera: Camera2DState): void;
}

export interface Sprite2D {
  textureId: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  tint: ColorRgba;
  uv: UvRect;
  zIndex: number;
  blend: BlendMode2D;
}

export interface Camera2D {
  primary: boolean;
  zoom: number;
}

export interface SpriteAnimation2D {
  frames: readonly UvRect[];
  framesPerSecond: number;
  frame: number;
  elapsedSeconds: number;
  playing: boolean;
  loop: boolean;
}

export const Sprite2DComponent = createComponentType<Sprite2D>('engine.render-2d.sprite');
export const Camera2DComponent = createComponentType<Camera2D>('engine.render-2d.camera');
export const SpriteAnimation2DComponent = createComponentType<SpriteAnimation2D>('engine.render-2d.animation');

export function createSprite2D(textureId: string, width: number, height: number, options: Partial<Omit<Sprite2D, 'textureId' | 'width' | 'height'>> = {}): Sprite2D {
  if (textureId.trim().length === 0) throw new Error('Sprite texture id cannot be empty');
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0) throw new Error('Sprite dimensions must be non-negative');
  return {
    textureId,
    width,
    height,
    anchorX: options.anchorX ?? 0.5,
    anchorY: options.anchorY ?? 0.5,
    tint: options.tint ?? [1, 1, 1, 1],
    uv: options.uv ?? [0, 0, 1, 1],
    zIndex: options.zIndex ?? 0,
    blend: options.blend ?? 'alpha',
  };
}

export function createCamera2D(zoom = 1, primary = true): Camera2D {
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Camera zoom must be positive');
  return { primary, zoom };
}

export function createSpriteAnimation2D(
  frames: readonly UvRect[],
  framesPerSecond: number,
  options: Partial<Pick<SpriteAnimation2D, 'playing' | 'loop' | 'frame'>> = {},
): SpriteAnimation2D {
  if (frames.length === 0) throw new Error('Sprite animation requires at least one frame');
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) throw new Error('Sprite animation rate must be positive');
  const frame = options.frame ?? 0;
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frames.length) throw new Error('Sprite animation frame is out of range');
  return { frames: Object.freeze([...frames]), framesPerSecond, frame, elapsedSeconds: 0, playing: options.playing ?? true, loop: options.loop ?? true };
}

export function advanceSpriteAnimations(world: World, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Animation delta must be non-negative');
  for (const { components: [sprite, animation] } of world.query(Sprite2DComponent, SpriteAnimation2DComponent)) {
    if (!animation.playing || animation.frames.length < 2) continue;
    animation.elapsedSeconds += deltaSeconds;
    const frameDuration = 1 / animation.framesPerSecond;
    while (animation.elapsedSeconds >= frameDuration && animation.playing) {
      animation.elapsedSeconds -= frameDuration;
      if (animation.frame + 1 < animation.frames.length) animation.frame += 1;
      else if (animation.loop) animation.frame = 0;
      else { animation.frame = animation.frames.length - 1; animation.playing = false; }
    }
    sprite.uv = animation.frames[animation.frame] ?? sprite.uv;
  }
}

export function extractSprite2D(world: World, renderer: Render2DService): number {
  let count = 0;
  for (const { entity, components: [transform, sprite] } of world.query(TransformComponent, Sprite2DComponent)) {
    if (world.tryGet(entity, VisibilityComponent) === 'hidden' || !renderer.hasTexture(sprite.textureId)) continue;
    const rotation = 2 * Math.atan2(transform.rotation.z, transform.rotation.w);
    renderer.submit({
      texture: renderer.texture(sprite.textureId),
      x: transform.translation.x, y: transform.translation.y,
      width: sprite.width * transform.scale.x, height: sprite.height * transform.scale.y,
      rotation, anchorX: sprite.anchorX, anchorY: sprite.anchorY, tint: sprite.tint,
      uv: sprite.uv, zIndex: sprite.zIndex + transform.translation.z, blend: sprite.blend,
    });
    count += 1;
  }
  for (const { components: [transform, camera] } of world.query(TransformComponent, Camera2DComponent)) {
    if (!camera.primary) continue;
    renderer.setCamera({ centerX: transform.translation.x, centerY: transform.translation.y, zoom: camera.zoom });
    break;
  }
  return count;
}
