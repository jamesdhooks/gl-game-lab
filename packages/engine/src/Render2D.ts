import {
  TransformComponent,
  VisibilityComponent,
  createComponentType,
  type World,
} from '@hooksjam/gl-game-lab-core';
import type { FluidColorMode2D, GpuTexture2D } from './Gpu2D.js';

export type BlendMode2D = 'alpha' | 'additive' | 'multiply' | 'opaque';
export type UvRect = readonly [number, number, number, number];
export type ColorRgba = readonly [number, number, number, number];
export const DEFAULT_FONT_2D_ID = 'gl-game-lab.font.default-5x7';

export interface Texture2DHandle {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface BitmapFont2DHandle {
  readonly id: string;
  readonly characters: string;
  readonly columns: number;
  readonly glyphWidth: number;
  readonly glyphHeight: number;
  readonly lineHeight: number;
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

export interface Text2DDraw {
  readonly font: BitmapFont2DHandle;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color?: ColorRgba;
  readonly align?: 'left' | 'center' | 'right';
  readonly zIndex?: number;
}

export interface ParticleBatch2D {
  readonly id: string;
  readonly count: number;
  readonly positions: Float32Array;
  readonly radii: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly palette: readonly ColorRgba[];
  readonly blend?: BlendMode2D;
  readonly opacity?: number;
  readonly paletteMode?: 'hashed' | 'indexed';
  readonly shading?: 'lit' | 'flat';
}

export interface Bloom2DOptions {
  readonly enabled: boolean;
  readonly threshold?: number;
  readonly intensity?: number;
  readonly radius?: number;
  readonly iterations?: number;
  readonly resolutionScale?: number;
}

export interface EmissiveLightSource2D {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly intensity?: number;
}

/** Shared scene-space emissive lighting driven by an explicit dominant source. */
export interface EmissiveLighting2DOptions {
  readonly enabled: boolean;
  readonly source?: EmissiveLightSource2D;
  readonly environmentStrength?: number;
  readonly shaftStrength?: number;
  readonly shaftLength?: number;
  readonly heatDistortion?: number;
  readonly timeSeconds?: number;
  readonly resolutionScale?: number;
}

export interface Backdrop2DOptions {
  /** Prefer applyPaletteGradientBackdrop2D for the standard scene background. */
  readonly base: ColorRgba;
  readonly palette: readonly ColorRgba[];
  readonly tier?: number;
  readonly blendStrength?: number;
}

export interface SegmentBatch2D {
  readonly id: string;
  readonly count: number;
  readonly segments: Float32Array;
  readonly styles: Float32Array;
  readonly colorSeeds?: Float32Array;
  readonly endRadii?: Float32Array;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly palette: readonly (readonly [number, number, number])[];
  readonly radiusScale?: number;
  readonly opacity?: number;
  readonly blend?: BlendMode2D;
  readonly paletteMode?: 'hashed' | 'indexed';
}

export interface TriangleMeshBatch2D {
  readonly id: string;
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly edgeFactors?: Float32Array;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly palette: readonly (readonly [number, number, number])[];
  readonly opacity?: number;
  readonly blend?: BlendMode2D;
  readonly shading?: 'flat' | 'sheen' | 'soft-body-skin';
}

export interface MetaballBatch2D {
  readonly id: string;
  readonly count: number;
  readonly positions: Float32Array;
  readonly radii: Float32Array;
  readonly temperatures: Float32Array;
  readonly colorSeeds?: Float32Array;
  readonly velocities?: Float32Array;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly fieldScale: number;
  readonly particleRadiusScale: number;
  readonly threshold: number;
  readonly edgeSoftness: number;
  readonly edgeTightness?: number;
  readonly palette: readonly (readonly [number, number, number])[];
  readonly background: readonly [number, number, number];
  readonly thermalContrast: number;
  readonly paletteMapping?: 'thermal' | 'gradient';
  readonly refraction: number;
  readonly gloss: number;
  readonly rimLighting: number;
  readonly foamStrength?: number;
  readonly thermalStrength?: number;
  readonly bloomStrength?: number;
  readonly heatShimmer?: number;
  readonly depthDiffusion?: number;
  readonly fluidColorMode?: FluidColorMode2D;
  readonly fluidColorStrength?: number;
  readonly renderStyle?: 'enhanced' | 'ultra';
  readonly opacity: number;
  readonly time?: number;
  readonly backgroundDepth?: number;
}

export type ShaderUniform2D =
  | { readonly type: '1f'; readonly value: number }
  | { readonly type: '1i'; readonly value: number }
  | { readonly type: '1fv'; readonly value: Float32Array }
  | { readonly type: '2f'; readonly value: readonly [number, number] }
  | { readonly type: '3f'; readonly value: readonly [number, number, number] }
  | { readonly type: '4f'; readonly value: readonly [number, number, number, number] }
  | { readonly type: '4fv'; readonly value: Float32Array }
  | { readonly type: 'texture'; readonly value: Texture2DHandle };

export interface FullscreenShaderEffect2D {
  readonly id: string;
  readonly language: 'glsl-es-300';
  readonly fragmentSource: string;
  readonly uniforms?: Readonly<Record<string, ShaderUniform2D>>;
  readonly blend?: BlendMode2D;
}

export interface FluidSplat2D {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly dye: readonly [number, number, number];
  readonly amount: number;
  readonly previousX?: number;
  readonly previousY?: number;
  readonly taper?: number;
  readonly aspectRatio?: number;
  readonly strength?: number;
  readonly velocityMode?: 'add' | 'target';
}

export interface FluidStep2DOptions {
  readonly deltaSeconds: number;
  readonly viscosity: number;
  readonly curl: number;
  readonly velocityDissipation: number;
  readonly dyeDissipation: number;
  readonly pressureIterations: number;
  readonly ambient?: boolean;
  readonly velocitySplatsBeforeProjection?: boolean;
  /** Selects the simulation equations used by the field. The default is the dye-oriented stable-fluid solver. */
  readonly solverMode?: 'stable' | 'source-mapped';
  /** Source-space grid cell size used by the source-mapped solver. */
  readonly cellSize?: number;
  /** Scale of the source simulation domain relative to clip space. */
  readonly simulationScale?: number;
  /** Per-step velocity persistence used by the source-mapped solver. */
  readonly velocityDecay?: number;
  /** Source-space radius of pointer force segments before simulation scaling. */
  readonly forceRadius?: number;
  /** Amount that force strength tapers from the current point toward its previous point. */
  readonly forceTaper?: number;
  /** Multiplier applied to source-segment target velocity. */
  readonly forceStrength?: number;
}

export interface FluidDisplay2DOptions {
  readonly palette: readonly (readonly [number, number, number])[];
  readonly background: readonly [number, number, number];
  readonly shadingStrength: number;
  readonly sunraysStrength: number;
  readonly exposure?: number;
  readonly paletteStrength?: number;
  readonly edgeDarkening?: number;
  readonly bloomStrength?: number;
  readonly bloomThreshold?: number;
  readonly visualPipeline?: 'standard' | 'reference';
  readonly initMode?: 'blank' | 'random' | 'voronoi' | 'cloud' | 'image';
  readonly timeSeconds?: number;
  readonly seed?: number;
}

export interface FluidSeed2DOptions {
  readonly palette?: readonly (readonly [number, number, number])[];
  readonly paletteStrength?: number;
  readonly cellSize?: number;
}

export interface FluidField2D {
  readonly width: number;
  readonly height: number;
  readonly simulationWidth: number;
  readonly simulationHeight: number;
  step(options: FluidStep2DOptions, splats?: readonly FluidSplat2D[]): void;
  seed(kind: 'blank' | 'random' | 'voronoi' | 'cloud', seed: number, options?: FluidSeed2DOptions): void;
  uploadDyeRgba(values: Float32Array): void;
  texture(channel: 'velocity' | 'dye'): GpuTexture2D;
  clear(): void;
  dispose(): void;
}
export interface FluidFieldCreate2DOptions {
  readonly simulationWidth?: number;
  readonly simulationHeight?: number;
  readonly simulationPrecision?: 'half-float' | 'float';
  readonly simulationFilter?: 'nearest' | 'linear';
}

export interface Render2DService {
  readonly viewport: { readonly width: number; readonly height: number; readonly pixelRatio?: number };
  createRgbaTexture(id: string, width: number, height: number, pixels: Uint8Array): Texture2DHandle;
  destroyTexture(texture: Texture2DHandle): void;
  hasTexture(id: string): boolean;
  texture(id: string): Texture2DHandle;
  createBitmapFont(id: string, characters: string, columns: number, glyphWidth: number, glyphHeight: number, pixels: Uint8Array): BitmapFont2DHandle;
  destroyBitmapFont(font: BitmapFont2DHandle): void;
  hasBitmapFont(id: string): boolean;
  bitmapFont(id: string): BitmapFont2DHandle;
  submit(sprite: Sprite2DDraw): void;
  submitText(text: Text2DDraw): void;
  submitParticles(batch: ParticleBatch2D): void;
  submitSegments(batch: SegmentBatch2D): void;
  submitTriangleMesh(batch: TriangleMeshBatch2D): void;
  submitMetaballs(batch: MetaballBatch2D): void;
  submitFullscreenEffect(effect: FullscreenShaderEffect2D): void;
  createFluidField(id: string, width: number, height: number, options?: FluidFieldCreate2DOptions): FluidField2D;
  submitFluidField(id: string, field: FluidField2D, display: FluidDisplay2DOptions): void;
  setCamera(camera: Camera2DState): void;
  setClearColor(color: ColorRgba): void;
  setBloom(options: Bloom2DOptions): void;
  setEmissiveLighting?(options: EmissiveLighting2DOptions): void;
  setBackdrop(options: Backdrop2DOptions | undefined): void;
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

export interface Text2D {
  text: string;
  fontId: string;
  size: number;
  color: ColorRgba;
  align: 'left' | 'center' | 'right';
  zIndex: number;
}

export const Sprite2DComponent = createComponentType<Sprite2D>('engine.render-2d.sprite');
export const Camera2DComponent = createComponentType<Camera2D>('engine.render-2d.camera');
export const SpriteAnimation2DComponent = createComponentType<SpriteAnimation2D>('engine.render-2d.animation');
export const Text2DComponent = createComponentType<Text2D>('engine.render-2d.text');

export function createSprite2D(textureId: string, width: number, height: number, options: Partial<Omit<Sprite2D, 'textureId' | 'width' | 'height'>> = {}): Sprite2D {
  if (textureId.trim().length === 0) throw new Error('Sprite texture id cannot be empty');
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height < 0) throw new Error('Sprite dimensions must be non-negative');
  const anchorX = options.anchorX ?? 0.5;
  const anchorY = options.anchorY ?? 0.5;
  const tint = options.tint ?? [1, 1, 1, 1];
  const uv = options.uv ?? [0, 0, 1, 1];
  const zIndex = options.zIndex ?? 0;
  if (![anchorX, anchorY, zIndex].every(Number.isFinite)) throw new Error('Sprite placement values must be finite');
  requireTuple(tint, 'Sprite tint');
  requireTuple(uv, 'Sprite UV');
  return {
    textureId,
    width,
    height,
    anchorX,
    anchorY,
    tint,
    uv,
    zIndex,
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
  for (const frameUv of frames) requireTuple(frameUv, 'Sprite animation UV');
  if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) throw new Error('Sprite animation rate must be positive');
  const frame = options.frame ?? 0;
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frames.length) throw new Error('Sprite animation frame is out of range');
  return { frames: Object.freeze([...frames]), framesPerSecond, frame, elapsedSeconds: 0, playing: options.playing ?? true, loop: options.loop ?? true };
}

export function createText2D(text: string, size: number, options: Partial<Omit<Text2D, 'text' | 'size'>> = {}): Text2D {
  if (!Number.isFinite(size) || size <= 0) throw new Error('Text size must be positive');
  const color = options.color ?? [1, 1, 1, 1];
  requireTuple(color, 'Text color');
  if (options.fontId !== undefined && options.fontId.trim().length === 0) throw new Error('Text font id cannot be empty');
  return {
    text,
    size,
    fontId: options.fontId ?? DEFAULT_FONT_2D_ID,
    color,
    align: options.align ?? 'left',
    zIndex: options.zIndex ?? 0,
  };
}

function requireTuple(values: readonly number[], label: string): void {
  if (values.length !== 4 || !values.every(Number.isFinite)) throw new Error(`${label} must contain four finite values`);
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
  for (const { entity, components: [transform, text] } of world.query(TransformComponent, Text2DComponent)) {
    if (world.tryGet(entity, VisibilityComponent) === 'hidden' || !renderer.hasBitmapFont(text.fontId)) continue;
    renderer.submitText({
      font: renderer.bitmapFont(text.fontId), text: text.text,
      x: transform.translation.x, y: transform.translation.y, size: text.size,
      color: text.color, align: text.align, zIndex: text.zIndex + transform.translation.z,
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
