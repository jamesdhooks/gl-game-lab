import { createExtensionToken, type EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { EngineSchedule } from '@hooksjam/gl-game-lab-engine';
import {
  SpriteRenderer,
  buildSpriteDrawPlan,
  createSpriteCamera2D,
  type SpriteCamera2D,
  type SpriteInstance,
} from './SpriteRenderer.js';
import { WebGL2Device, type WebGL2DeviceOptions } from './WebGL2Device.js';
import { ParticlePointRenderer, ParticlePointRenderQueue } from './ParticlePointRenderer.js';
import { BloomPostProcess, type BloomOptions } from './BloomPostProcess.js';

export interface WebGL2RendererOptions {
  readonly device?: WebGL2DeviceOptions;
  readonly clearColor?: readonly [number, number, number, number];
  readonly bloom?: BloomOptions;
}

export class SpriteRenderQueue {
  private readonly sprites: SpriteInstance[] = [];
  private camera: SpriteCamera2D;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.camera = createSpriteCamera2D(viewportWidth, viewportHeight);
  }

  submit(sprite: SpriteInstance): void {
    this.sprites.push(sprite);
  }

  submitAll(sprites: readonly SpriteInstance[]): void {
    this.sprites.push(...sprites);
  }

  setCamera(camera: SpriteCamera2D): void {
    this.camera = camera;
  }

  get activeCamera(): SpriteCamera2D {
    return this.camera;
  }

  buildPlan() {
    return buildSpriteDrawPlan(this.sprites, this.camera);
  }

  clear(): void {
    this.sprites.length = 0;
  }

  get count(): number {
    return this.sprites.length;
  }
}

export class WebGL2Renderer {
  readonly device: WebGL2Device;
  readonly sprites: SpriteRenderQueue;
  readonly particles: ParticlePointRenderQueue;
  private readonly spriteRenderer: SpriteRenderer;
  private readonly particleRenderer: ParticlePointRenderer;
  private readonly bloom: BloomPostProcess;
  private clearColor: readonly [number, number, number, number];
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    options: WebGL2RendererOptions = {},
  ) {
    this.device = new WebGL2Device(canvas, options.device);
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    this.sprites = new SpriteRenderQueue(width, height);
    this.particles = new ParticlePointRenderQueue();
    this.spriteRenderer = new SpriteRenderer(this.device);
    this.particleRenderer = new ParticlePointRenderer(this.device);
    this.bloom = new BloomPostProcess(this.device, options.bloom);
    this.clearColor = options.clearColor ?? [0, 0, 0, 0];
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio = 1): void {
    this.assertUsable();
    this.device.resize(cssWidth, cssHeight, pixelRatio);
    const previous = this.sprites.activeCamera;
    this.sprites.setCamera(createSpriteCamera2D(cssWidth, cssHeight, {
      centerX: previous.centerX,
      centerY: previous.centerY,
      zoom: previous.zoom,
    }));
  }

  setClearColor(color: readonly [number, number, number, number]): void {
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
    this.bloom.configure(options);
  }

  get bloomConfiguration() {
    return this.bloom.configuration;
  }

  get postProcessStats() {
    return this.bloom.stats;
  }

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

  render(): void {
    this.assertUsable();
    const scene = this.bloom.sceneTarget;
    if (scene) this.bloom.clearScene(this.clearColor);
    else this.device.clear(...this.clearColor);
    const target = scene ? { resource: scene } : undefined;
    this.particleRenderer.render(this.particles.buildPlan(), this.sprites.activeCamera, target);
    this.spriteRenderer.render(this.sprites.buildPlan(), this.sprites.activeCamera, target);
    if (scene) this.bloom.composite();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprites.clear();
    this.particles.clear();
    this.particleRenderer.destroy();
    this.spriteRenderer.destroy();
    this.bloom.destroy();
    this.device.destroy();
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('WebGL2 renderer has been destroyed');
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
      context.provide(WebGL2RendererService, renderer);
      context.provide(SpriteRenderQueueService, renderer.sprites);
      context.provide(ParticlePointRenderQueueService, renderer.particles);
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.sprites',
        stage: 'render',
        run: () => { renderer.render(); },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.clear-sprites',
        stage: 'postRender',
        run: () => {
          renderer.sprites.clear();
          renderer.particles.clear();
        },
      });
    },
    dispose: () => { renderer.destroy(); },
  };
}
