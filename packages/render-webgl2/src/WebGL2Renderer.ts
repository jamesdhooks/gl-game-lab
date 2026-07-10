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

export interface WebGL2RendererOptions {
  readonly device?: WebGL2DeviceOptions;
  readonly clearColor?: readonly [number, number, number, number];
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
  private readonly spriteRenderer: SpriteRenderer;
  private readonly clearColor: readonly [number, number, number, number];
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    options: WebGL2RendererOptions = {},
  ) {
    this.device = new WebGL2Device(canvas, options.device);
    const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
    this.sprites = new SpriteRenderQueue(width, height);
    this.spriteRenderer = new SpriteRenderer(this.device);
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

  render(): void {
    this.assertUsable();
    this.device.clear(...this.clearColor);
    this.spriteRenderer.render(this.sprites.buildPlan(), this.sprites.activeCamera);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprites.clear();
    this.spriteRenderer.destroy();
    this.device.destroy();
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('WebGL2 renderer has been destroyed');
  }
}

export const WebGL2RendererService = createExtensionToken<WebGL2Renderer>('gl-game-lab.render-webgl2.renderer');
export const SpriteRenderQueueService = createExtensionToken<SpriteRenderQueue>('gl-game-lab.render-webgl2.sprite-queue');
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
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.sprites',
        stage: 'render',
        run: () => { renderer.render(); },
      });
      context.get(EngineSchedule).addSystem({
        id: 'gl-game-lab.render-webgl2.clear-sprites',
        stage: 'postRender',
        run: () => { renderer.sprites.clear(); },
      });
    },
    dispose: () => { renderer.destroy(); },
  };
}
