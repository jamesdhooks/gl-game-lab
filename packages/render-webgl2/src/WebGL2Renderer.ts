import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import {
  EngineRender2D,
  EngineGpu2D,
  EngineDiagnosticsService,
  EngineRenderer,
  EngineSchedule,
  EngineWorld,
  DEFAULT_FONT_2D_ID,
  extractSprite2D,
  type Render2DService,
  type Backdrop2DOptions,
  type BitmapFont2DHandle,
  type RenderBackend,
  type RenderBackendCapabilities,
  type RenderBackendState,
  type RenderViewport,
  type Sprite2DDraw,
  type ParticleBatch2D,
  type SegmentBatch2D,
  type TriangleMeshBatch2D,
  type MetaballBatch2D,
  type FullscreenShaderEffect2D,
  type FluidDisplay2DOptions,
  type FluidField2D,
  type Text2DDraw,
  type Texture2DHandle,
  type RendererDiagnostics,
} from '@hooksjam/gl-game-lab-engine';
import {
  SpriteRenderer,
  buildSpriteDrawPlan,
  createSpriteCamera2D,
  type SpriteTexture,
  type SpriteDrawPlan,
} from './SpriteRenderer.js';
import { WebGL2Device, type WebGL2DeviceOptions, type WebGLTextureResource } from './WebGL2Device.js';
import { ParticlePointRenderer, ParticlePointRenderQueue, type ParticlePointDrawPlan } from './ParticlePointRenderer.js';
import {
  BloomPostProcess,
  normalizeBloomOptions,
  type BloomOptions,
  type NormalizedBloomOptions,
} from './BloomPostProcess.js';
import {
  PaletteBackdropRenderer,
  normalizePaletteBackdropOptions,
  type PaletteBackdropOptions,
} from './PaletteBackdropRenderer.js';
import { FullscreenEffectRenderer, FullscreenEffectRenderQueue } from './FullscreenEffectRenderer.js';
import { GpuRenderPassQueue } from './GpuRenderPassQueue.js';
import { GpuTimer } from './GpuTimer.js';
import { FrameRenderPipeline, type FrameRenderGraphSnapshot } from './FrameRenderPipeline.js';
import { createDefaultBitmapFontAtlas } from './DefaultBitmapFont.js';
import { InstancedSegmentRenderer } from './InstancedSegmentRenderer.js';
import { DynamicTriangleMeshRenderer } from './DynamicTriangleMeshRenderer.js';
import { DensityMetaballRenderer } from './DensityMetaballRenderer.js';
import { WebGLGpu2DService } from './WebGLGpu2DService.js';
import { SpriteRenderQueue } from './SpriteRenderQueue.js';
import { WebGLFluidField2D } from './WebGLFluidField2D.js';

export interface WebGL2RendererOptions {
  readonly device?: WebGL2DeviceOptions;
  readonly clearColor?: readonly [number, number, number, number];
  readonly bloom?: BloomOptions;
}

const WEBGL2_CAPABILITIES: RenderBackendCapabilities = Object.freeze({
  api: 'webgl2',
  gpuSimulation: true,
  renderTargets: true,
  instancing: true,
});

interface ManagedTexture2D {
  readonly handle: Texture2DHandle;
  readonly resource: WebGLTextureResource;
  readonly spriteTexture: SpriteTexture;
}

export interface ContextCycleDiagnostics {
  readonly generationBefore: number;
  readonly generationAfter: number;
  readonly resourcesBefore: number;
  readonly resourcesAfter: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
}

interface ManagedBitmapFont2D {
  readonly handle: BitmapFont2DHandle;
  readonly texture: Texture2DHandle;
}

export class WebGL2Renderer implements RenderBackend, Render2DService {
  readonly id = 'gl-game-lab.render-webgl2';
  readonly capabilities = WEBGL2_CAPABILITIES;
  readonly device: WebGL2Device;
  readonly sprites: SpriteRenderQueue;
  readonly particles: ParticlePointRenderQueue;
  readonly effects: FullscreenEffectRenderQueue;
  readonly gpuPasses: GpuRenderPassQueue;
  readonly gpu2D: WebGLGpu2DService;
  private spriteRenderer: SpriteRenderer;
  private particleRenderer: ParticlePointRenderer;
  private effectRenderer: FullscreenEffectRenderer;
  private segmentRenderer: InstancedSegmentRenderer;
  private meshRenderer: DynamicTriangleMeshRenderer;
  private metaballRenderer: DensityMetaballRenderer;
  private bloom: BloomPostProcess;
  private backdrop: PaletteBackdropRenderer;
  private readonly framePipeline: FrameRenderPipeline;
  private readonly gpuTimer: GpuTimer;
  private clearColor: readonly [number, number, number, number];
  private bloomOptions: NormalizedBloomOptions;
  private backdropOptions: PaletteBackdropOptions | undefined = undefined;
  private logicalWidth: number;
  private logicalHeight: number;
  private pixelRatio = 1;
  private readonly unregisterContextResource: () => void;
  private readonly unregisterGpuTimer: () => void;
  private readonly textures2D = new Map<string, ManagedTexture2D>();
  private readonly fonts2D = new Map<string, ManagedBitmapFont2D>();
  private readonly fluidFields = new Set<WebGLFluidField2D>();
  private fluidFieldId = 0;
  private pendingBufferUploadBytes = 0;
  private pendingTextureUploadBytes = 0;
  private pendingGpuDrawCalls = 0;
  private renderedSpritePlan: SpriteDrawPlan | undefined;
  private renderedParticlePlan: ParticlePointDrawPlan | undefined;
  private lastFrameDiagnostics: RendererDiagnostics | undefined;
  private destroyed = false;

  get state(): RenderBackendState {
    if (this.destroyed) return 'destroyed';
    return this.device.isContextLost ? 'context-lost' : 'ready';
  }

  get viewport(): RenderViewport {
    return Object.freeze({
      width: this.logicalWidth,
      height: this.logicalHeight,
      pixelRatio: this.pixelRatio,
    });
  }

  constructor(
    canvas: HTMLCanvasElement,
    options: WebGL2RendererOptions = {},
  ) {
    this.device = new WebGL2Device(canvas, options.device);
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.sprites = new SpriteRenderQueue(width, height);
    this.particles = new ParticlePointRenderQueue();
    this.effects = new FullscreenEffectRenderQueue();
    this.gpuPasses = new GpuRenderPassQueue();
    this.gpu2D = new WebGLGpu2DService(this.device, this.gpuPasses);
    this.gpuTimer = new GpuTimer(this.device.gl);
    this.spriteRenderer = new SpriteRenderer(this.device);
    this.particleRenderer = new ParticlePointRenderer(this.device);
    this.effectRenderer = new FullscreenEffectRenderer(this.device);
    this.segmentRenderer = new InstancedSegmentRenderer(this.device.gl);
    this.meshRenderer = new DynamicTriangleMeshRenderer(this.device.gl);
    this.metaballRenderer = new DensityMetaballRenderer(this.device.gl);
    this.bloomOptions = normalizeBloomOptions(options.bloom);
    this.bloom = new BloomPostProcess(this.device, this.bloomOptions);
    this.backdrop = new PaletteBackdropRenderer(this.device);
    this.clearColor = options.clearColor ?? [0, 0, 0, 0];
    this.framePipeline = new FrameRenderPipeline({
      clear: ({ target }) => {
        if (target) this.bloom.clearScene(this.clearColor);
        else this.device.clear(...this.clearColor);
      },
      backdrop: ({ target }) => { this.backdrop.render(target); },
      gpuSimulation: ({ target }) => {
        this.gpuPasses.execute({
          ...(target?.resource.framebuffer ? { framebuffer: target.resource.framebuffer } : {}),
          width: target?.resource.descriptor.width ?? this.width,
          height: target?.resource.descriptor.height ?? this.height,
        });
      },
      effects: ({ target }) => { this.effectRenderer.render(this.effects.snapshot(), target); },
      particles: ({ target }) => {
        const plan = this.particles.buildPlan();
        this.renderedParticlePlan = plan;
        this.particleRenderer.render(plan, this.sprites.activeCamera, target);
      },
      sprites: ({ target }) => {
        const plan = this.sprites.buildPlan();
        this.renderedSpritePlan = plan;
        this.spriteRenderer.render(plan, this.sprites.activeCamera, target);
      },
      composite: ({ composite }) => { if (composite) this.bloom.composite(); },
    });
    this.unregisterContextResource = this.device.registerContextResource({
      id: 'gl-game-lab.render-webgl2.pipeline',
      priority: 100,
      restore: () => { this.restoreContext(); },
    });
    this.unregisterGpuTimer = this.device.registerContextResource({
      id: 'gl-game-lab.render-webgl2.gpu-timer',
      priority: 90,
      invalidate: () => { this.gpuTimer.invalidate(); },
      restore: () => { this.gpuTimer.restore(); },
    });
    const font = createDefaultBitmapFontAtlas();
    this.createBitmapFont(DEFAULT_FONT_2D_ID, font.characters, font.columns, font.glyphWidth, font.glyphHeight, font.pixels);
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio = 1): void {
    this.assertUsable();
    const previous = this.sprites.activeCamera;
    const camera = createSpriteCamera2D(cssWidth, cssHeight, {
      centerX: previous.centerX,
      centerY: previous.centerY,
      zoom: previous.zoom,
    });
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
      throw new Error('Renderer pixel ratio must be positive');
    }
    if (this.state === 'ready') this.device.resize(cssWidth, cssHeight, pixelRatio);
    this.logicalWidth = cssWidth;
    this.logicalHeight = cssHeight;
    this.pixelRatio = pixelRatio;
    this.sprites.setCamera(camera);
  }

  setClearColor(color: readonly [number, number, number, number]): void {
    this.assertUsable();
    if (color.length !== 4 || !color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1)) {
      throw new Error('Renderer clear color components must be between zero and one');
    }
    this.clearColor = [...color] as readonly [number, number, number, number];
  }

  get activeClearColor(): readonly [number, number, number, number] {
    return this.clearColor;
  }

  setBloom(options: BloomOptions): void {
    this.assertUsable();
    this.bloomOptions = normalizeBloomOptions(options);
    if (this.state === 'ready') this.bloom.configure(this.bloomOptions);
  }

  setPaletteBackdrop(options: PaletteBackdropOptions | undefined): void {
    this.assertUsable();
    if (options) normalizePaletteBackdropOptions(options);
    this.backdropOptions = options;
    if (this.state === 'ready') this.backdrop.configure(options);
  }

  get bloomConfiguration() {
    return this.bloomOptions;
  }

  get postProcessStats() {
    return this.bloom.stats;
  }

  get renderGraphSnapshot(): FrameRenderGraphSnapshot {
    return this.framePipeline.snapshot();
  }

  get diagnosticsSnapshot(): RendererDiagnostics | undefined { return this.lastFrameDiagnostics; }

  get width(): number {
    return this.device.canvas.width;
  }

  get height(): number {
    return this.device.canvas.height;
  }

  readRgba(): Uint8Array {
    this.assertUsable();
    const gl = this.device.gl;
    const width = this.width;
    const height = this.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    flipRows(pixels, width, height);
    return pixels;
  }

  async cycleContextForDiagnostics(): Promise<ContextCycleDiagnostics> {
    this.assertUsable();
    const extension = this.device.gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is unavailable');
    const before = this.device.diagnostics();
    const restored = new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => { reject(new Error('WebGL2 context restoration timed out')); }, 5_000);
      this.device.canvas.addEventListener('webglcontextrestored', () => {
        globalThis.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
    extension.loseContext();
    globalThis.setTimeout(() => { extension.restoreContext(); }, 50);
    await restored;
    if (this.device.contextRestorationError) throw new Error('WebGL2 context restoration failed', { cause: this.device.contextRestorationError });
    const after = this.device.diagnostics();
    return Object.freeze({
      generationBefore: before.contextGeneration,
      generationAfter: after.contextGeneration,
      resourcesBefore: before.textureCount + before.ownedContextResourceCount,
      resourcesAfter: after.textureCount + after.ownedContextResourceCount,
      bytesBefore: before.estimatedGpuBytes,
      bytesAfter: after.estimatedGpuBytes,
    });
  }

  createRgbaTexture(id: string, width: number, height: number, pixels: Uint8Array): Texture2DHandle {
    this.assertUsable();
    const normalizedId = id.trim();
    if (normalizedId.length === 0) throw new Error('2D texture id cannot be empty');
    if (this.textures2D.has(normalizedId)) throw new Error(`2D texture id is already registered: ${normalizedId}`);
    const resource = this.device.createTextureFromRgbaPixels(pixels, { width, height });
    this.pendingTextureUploadBytes += pixels.byteLength;
    const handle = Object.freeze({ id: normalizedId, width, height });
    const spriteTexture: SpriteTexture = {
      id: normalizedId,
      get texture() { return resource.texture; },
    };
    this.textures2D.set(normalizedId, { handle, resource, spriteTexture });
    return handle;
  }

  destroyTexture(texture: Texture2DHandle): void {
    const managed = this.textures2D.get(texture.id);
    if (!managed || managed.handle !== texture) return;
    managed.resource.dispose();
    this.textures2D.delete(texture.id);
  }

  hasTexture(id: string): boolean { return this.textures2D.has(id); }

  texture(id: string): Texture2DHandle {
    const texture = this.textures2D.get(id)?.handle;
    if (!texture) throw new Error(`2D texture is not registered: ${id}`);
    return texture;
  }

  createBitmapFont(id: string, characters: string, columns: number, glyphWidth: number, glyphHeight: number, pixels: Uint8Array): BitmapFont2DHandle {
    const normalizedId = id.trim();
    if (normalizedId.length === 0) throw new Error('Bitmap font id cannot be empty');
    if (this.fonts2D.has(normalizedId)) throw new Error(`Bitmap font id is already registered: ${normalizedId}`);
    if (new Set(characters).size !== characters.length || characters.length === 0) throw new Error('Bitmap font characters must be unique and non-empty');
    if (!Number.isSafeInteger(columns) || columns < 1 || !Number.isSafeInteger(glyphWidth) || glyphWidth < 1 || !Number.isSafeInteger(glyphHeight) || glyphHeight < 1) {
      throw new Error('Bitmap font grid dimensions must be positive integers');
    }
    const rows = Math.ceil(characters.length / columns);
    const texture = this.createRgbaTexture(`${normalizedId}.atlas`, columns * glyphWidth, rows * glyphHeight, pixels);
    const handle = Object.freeze({ id: normalizedId, characters, columns, glyphWidth, glyphHeight, lineHeight: glyphHeight });
    this.fonts2D.set(normalizedId, { handle, texture });
    return handle;
  }

  destroyBitmapFont(font: BitmapFont2DHandle): void {
    const managed = this.fonts2D.get(font.id);
    if (!managed || managed.handle !== font) return;
    this.destroyTexture(managed.texture);
    this.fonts2D.delete(font.id);
  }

  hasBitmapFont(id: string): boolean { return this.fonts2D.has(id); }

  bitmapFont(id: string): BitmapFont2DHandle {
    const font = this.fonts2D.get(id)?.handle;
    if (!font) throw new Error(`Bitmap font is not registered: ${id}`);
    return font;
  }

  submit(sprite: Sprite2DDraw): void {
    const texture = this.textures2D.get(sprite.texture.id);
    if (!texture || texture.handle !== sprite.texture) {
      throw new Error(`2D texture handle is not owned by this renderer: ${sprite.texture.id}`);
    }
    this.sprites.submit({ ...sprite, texture: texture.spriteTexture });
  }

  submitText(draw: Text2DDraw): void {
    const managed = this.fonts2D.get(draw.font.id);
    if (!managed || managed.handle !== draw.font) throw new Error(`Bitmap font handle is not owned by this renderer: ${draw.font.id}`);
    const rows = Math.ceil(draw.font.characters.length / draw.font.columns);
    const scale = draw.size / draw.font.glyphHeight;
    const advance = draw.font.glyphWidth * scale;
    draw.text.split('\n').forEach((line, lineIndex) => {
      const offset = draw.align === 'center' ? -line.length * advance * 0.5 : draw.align === 'right' ? -line.length * advance : 0;
      [...line.toUpperCase()].forEach((character, glyphIndex) => {
        const index = Math.max(0, draw.font.characters.indexOf(character) >= 0 ? draw.font.characters.indexOf(character) : draw.font.characters.indexOf('?'));
        const column = index % draw.font.columns;
        const row = Math.floor(index / draw.font.columns);
        this.submit({
          texture: managed.texture,
          x: draw.x + offset + glyphIndex * advance,
          y: draw.y + lineIndex * draw.font.lineHeight * scale,
          width: advance,
          height: draw.font.glyphHeight * scale,
          anchorX: 0,
          anchorY: 0,
          ...(draw.color ? { tint: draw.color } : {}),
          uv: [column / draw.font.columns, row / rows, (column + 1) / draw.font.columns, (row + 1) / rows],
          ...(draw.zIndex === undefined ? {} : { zIndex: draw.zIndex }),
        });
      });
    });
  }

  submitParticles(batch: ParticleBatch2D): void {
    this.particles.submit(batch);
  }

  submitSegments(batch: SegmentBatch2D): void {
    this.pendingBufferUploadBytes += batch.segments.byteLength + batch.styles.byteLength;
    this.gpuPasses.submit({
      id: batch.id,
      execute: (destination) => {
        this.segmentRenderer.update(batch);
        this.segmentRenderer.render(destination, batch);
      },
    });
  }

  submitTriangleMesh(batch: TriangleMeshBatch2D): void {
    this.pendingBufferUploadBytes += batch.positions.byteLength + batch.colorSeeds.byteLength;
    this.gpuPasses.submit({
      id: batch.id,
      execute: (destination) => {
        this.meshRenderer.update(batch);
        this.meshRenderer.render(destination, batch);
      },
    });
  }

  submitMetaballs(batch: MetaballBatch2D): void {
    this.pendingBufferUploadBytes += batch.positions.byteLength + batch.radii.byteLength + batch.temperatures.byteLength;
    this.gpuPasses.submit({
      id: batch.id,
      execute: (destination) => {
        this.metaballRenderer.update(batch);
        this.metaballRenderer.render(destination, batch);
      },
    });
  }

  submitFullscreenEffect(effect: FullscreenShaderEffect2D): void {
    this.effects.submit({
      id: effect.id,
      fragmentSource: effect.fragmentSource,
      ...(effect.uniforms ? { uniforms: effect.uniforms } : {}),
      ...(effect.blend ? { blend: effect.blend } : {}),
    });
  }

  createFluidField(id: string, width: number, height: number): FluidField2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('Fluid field id cannot be empty');
    let field: WebGLFluidField2D | undefined;
    field = new WebGLFluidField2D(
      this.device,
      `gl-game-lab.render-webgl2.fluid.${this.fluidFieldId}.${normalized}`,
      width,
      height,
      () => { if (field) this.fluidFields.delete(field); },
      (drawCalls, uploadBytes = 0) => { this.pendingGpuDrawCalls += drawCalls; this.pendingBufferUploadBytes += uploadBytes; },
    );
    this.fluidFieldId += 1;
    this.fluidFields.add(field);
    return field;
  }

  submitFluidField(id: string, field: FluidField2D, display: FluidDisplay2DOptions): void {
    if (!(field instanceof WebGLFluidField2D) || !this.fluidFields.has(field)) throw new Error('Fluid field is not owned by this renderer');
    this.gpuPasses.submit({ id, execute: (destination) => { field.render(destination, display); } });
  }

  setBackdrop(options: Backdrop2DOptions | undefined): void {
    this.setPaletteBackdrop(options);
  }

  setCamera(camera: { readonly centerX: number; readonly centerY: number; readonly zoom: number }): void {
    this.sprites.setCamera(createSpriteCamera2D(this.logicalWidth, this.logicalHeight, camera));
  }

  render(): void {
    this.assertUsable();
    if (this.state === 'context-lost') return;
    this.renderedSpritePlan = undefined;
    this.renderedParticlePlan = undefined;
    this.gpu2D.beginFrameDiagnostics();
    const scene = this.bloom.sceneTarget;
    const target = scene ? { resource: scene } : undefined;
    this.gpuTimer.begin();
    try {
      this.framePipeline.execute({ ...(target ? { target } : {}), composite: scene !== undefined });
    } finally {
      this.gpuTimer.end();
    }
    const sprites = this.renderedSpritePlan ?? buildSpriteDrawPlan([], this.sprites.activeCamera);
    const particles = this.renderedParticlePlan ?? this.particles.buildPlan();
    const gpu = this.gpu2D.diagnostics();
    const device = this.device.diagnostics();
    const bloom = this.bloom.stats;
    const rawGpuPasses = Math.max(0, this.gpuPasses.count - gpu.submissions);
    this.lastFrameDiagnostics = Object.freeze({
      backend: this.id,
      drawCalls: sprites.batches.length + particles.drawCalls + this.effects.count + gpu.drawCalls + this.pendingGpuDrawCalls + rawGpuPasses + (this.backdropOptions ? 1 : 0) + bloom.passes,
      points: particles.particleCount + gpu.points,
      triangles: sprites.spriteCount * 2 + this.effects.count + rawGpuPasses + (this.backdropOptions ? 1 : 0) + bloom.passes,
      bufferUploadBytes: this.pendingBufferUploadBytes + sprites.spriteCount * 15 * Float32Array.BYTES_PER_ELEMENT + particles.particleCount * 4 * Float32Array.BYTES_PER_ELEMENT + gpu.uploadBytes,
      textureUploadBytes: this.pendingTextureUploadBytes,
      transientAllocationBytes: this.spriteRenderer.consumeAllocatedBytes(),
      gpuResourceCount: device.textureCount + device.ownedContextResourceCount,
      gpuResourceBytes: device.estimatedGpuBytes,
      renderPasses: this.framePipeline.snapshot().passes,
      ...(this.gpuTimer.latestMs === undefined ? {} : { gpuMs: this.gpuTimer.latestMs }),
    });
    this.pendingBufferUploadBytes = 0;
    this.pendingTextureUploadBytes = 0;
    this.pendingGpuDrawCalls = 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unregisterGpuTimer();
    this.unregisterContextResource();
    this.sprites.clear();
    this.particles.clear();
    this.effects.clear();
    this.gpuPasses.clear();
    this.gpu2D.destroy();
    for (const field of [...this.fluidFields]) field.dispose();
    this.fluidFields.clear();
    for (const font of [...this.fonts2D.values()]) this.destroyBitmapFont(font.handle);
    this.fonts2D.clear();
    for (const texture of this.textures2D.values()) texture.resource.dispose();
    this.textures2D.clear();
    this.effectRenderer.destroy();
    this.segmentRenderer.dispose();
    this.meshRenderer.dispose();
    this.metaballRenderer.dispose();
    this.particleRenderer.destroy();
    this.spriteRenderer.destroy();
    this.bloom.destroy();
    this.backdrop.destroy();
    this.gpuTimer.destroy();
    this.device.destroy();
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('WebGL2 renderer has been destroyed');
  }

  private restoreContext(): void {
    this.effectRenderer.destroy();
    this.segmentRenderer.dispose();
    this.meshRenderer.dispose();
    this.metaballRenderer.dispose();
    this.particleRenderer.destroy();
    this.spriteRenderer.destroy();
    this.bloom.destroy();
    this.backdrop.destroy();
    this.spriteRenderer = new SpriteRenderer(this.device);
    this.particleRenderer = new ParticlePointRenderer(this.device);
    this.effectRenderer = new FullscreenEffectRenderer(this.device);
    this.segmentRenderer = new InstancedSegmentRenderer(this.device.gl);
    this.meshRenderer = new DynamicTriangleMeshRenderer(this.device.gl);
    this.metaballRenderer = new DensityMetaballRenderer(this.device.gl);
    this.bloom = new BloomPostProcess(this.device, this.bloomOptions);
    this.backdrop = new PaletteBackdropRenderer(this.device);
    this.backdrop.configure(this.backdropOptions);
    this.device.resize(this.logicalWidth, this.logicalHeight, this.pixelRatio);
  }
}

function flipRows(pixels: Uint8Array, width: number, height: number): void {
  const stride = width * 4;
  const temporary = new Uint8Array(stride);
  for (let top = 0; top < Math.floor(height / 2); top += 1) {
    const bottom = height - top - 1;
    const topOffset = top * stride;
    const bottomOffset = bottom * stride;
    temporary.set(pixels.subarray(topOffset, topOffset + stride));
    pixels.copyWithin(topOffset, bottomOffset, bottomOffset + stride);
    pixels.set(temporary, bottomOffset);
  }
}

export const WebGL2RendererService = createExtensionToken<WebGL2Renderer>('gl-game-lab.render-webgl2.renderer');
export const SpriteRenderQueueService = createExtensionToken<SpriteRenderQueue>('gl-game-lab.render-webgl2.sprite-queue');
export const ParticlePointRenderQueueService = createExtensionToken<ParticlePointRenderQueue>('gl-game-lab.render-webgl2.particle-point-queue');
export const FullscreenEffectRenderQueueService = createExtensionToken<FullscreenEffectRenderQueue>('gl-game-lab.render-webgl2.fullscreen-effect-queue');
export const GpuRenderPassQueueService = createExtensionToken<GpuRenderPassQueue>('gl-game-lab.render-webgl2.gpu-pass-queue');
export const WEBGL2_RENDERER_PLUGIN_ID = 'gl-game-lab.render-webgl2';

export function createWebGL2RendererPlugin(
  canvas: HTMLCanvasElement,
  options: WebGL2RendererOptions = {},
): EnginePlugin {
  const renderer = new WebGL2Renderer(canvas, options);
  return {
    id: WEBGL2_RENDERER_PLUGIN_ID,
    version: '1.0.0',
    dependencies: [{ id: 'gl-game-lab.runtime' }],
    install: (context) => {
      const diagnostics = context.get(EngineDiagnosticsService);
      context.provide(EngineRender2D, renderer);
      context.provide(EngineGpu2D, renderer.gpu2D);
      context.provide(EngineRenderer, renderer);
      context.provide(WebGL2RendererService, renderer);
      context.provide(SpriteRenderQueueService, renderer.sprites);
      context.provide(ParticlePointRenderQueueService, renderer.particles);
      context.provide(FullscreenEffectRenderQueueService, renderer.effects);
      context.provide(GpuRenderPassQueueService, renderer.gpuPasses);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.extract-sprites-2d',
        stage: 'renderExtract',
        run: () => { extractSprite2D(context.get(EngineWorld), renderer); },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.sprites',
        stage: 'render',
        run: () => { renderer.render(); },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.clear-sprites',
        stage: 'postRender',
        run: () => {
          if (renderer.diagnosticsSnapshot) diagnostics.reportRenderer(renderer.diagnosticsSnapshot);
          renderer.sprites.clear();
          renderer.particles.clear();
          renderer.effects.clear();
          renderer.gpuPasses.clear();
        },
      });
    },
    dispose: () => { renderer.destroy(); },
  };
}
