import type { RenderResourceAllocator } from './RenderGraph.js';
import {
  ContextResourceRegistry,
  type ContextRestorableResource,
} from './ContextResourceRegistry.js';
import {
  RestorableResourceOwner,
  type RestorableResourceDescriptor,
} from './RestorableResourceOwner.js';

export type TextureFormat = 'rgba8' | 'rgba16f';
export type TextureFilter = 'linear' | 'nearest';
export type TextureWrap = 'clamp' | 'repeat';

export interface WebGLTextureDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format?: TextureFormat;
  readonly filter?: TextureFilter;
  readonly wrap?: TextureWrap;
  readonly renderTarget?: boolean;
}

export interface NormalizedTextureDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly filter: TextureFilter;
  readonly wrap: TextureWrap;
  readonly renderTarget: boolean;
}

export interface WebGL2DeviceOptions {
  readonly alpha?: boolean;
  readonly antialias?: boolean;
  readonly depth?: boolean;
  readonly stencil?: boolean;
  readonly premultipliedAlpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
  readonly powerPreference?: WebGLPowerPreference;
}

export interface WebGLImageTextureDescriptor extends Omit<WebGLTextureDescriptor, 'width' | 'height'> {
  readonly width: number;
  readonly height: number;
  readonly flipY?: boolean;
  readonly releaseSource?: () => void;
}

export interface WebGL2DeviceDiagnostics {
  readonly textureCount: number;
  readonly contextResourceCount: number;
  readonly ownedContextResourceCount: number;
  readonly estimatedTextureBytes: number;
  readonly estimatedContextBytes: number;
  readonly estimatedGpuBytes: number;
  readonly contextGeneration: number;
}

export interface WebGLRgbaTextureDescriptor extends Omit<WebGLTextureDescriptor, 'width' | 'height' | 'format'> {
  readonly width: number;
  readonly height: number;
}

export class WebGLTextureResource {
  private disposed = false;
  private currentTexture: WebGLTexture;
  private currentFramebuffer: WebGLFramebuffer | undefined;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    texture: WebGLTexture,
    framebuffer: WebGLFramebuffer | undefined,
    readonly descriptor: NormalizedTextureDescriptor,
    private readonly onDispose?: () => void,
  ) {
    this.currentTexture = texture;
    this.currentFramebuffer = framebuffer;
  }

  get texture(): WebGLTexture {
    return this.currentTexture;
  }

  get framebuffer(): WebGLFramebuffer | undefined {
    return this.currentFramebuffer;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.currentFramebuffer) this.gl.deleteFramebuffer(this.currentFramebuffer);
    this.gl.deleteTexture(this.currentTexture);
    this.onDispose?.();
  }

  invalidate(): void {
    if (this.disposed) return;
    if (this.currentFramebuffer) this.gl.deleteFramebuffer(this.currentFramebuffer);
    this.gl.deleteTexture(this.currentTexture);
  }

  restore(texture: WebGLTexture, framebuffer: WebGLFramebuffer | undefined): void {
    if (this.disposed) throw new Error('Disposed WebGL texture cannot be restored');
    this.currentTexture = texture;
    this.currentFramebuffer = framebuffer;
  }
}

interface TextureAllocation {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer | undefined;
}

export class WebGL2Device {
  readonly gl: WebGL2RenderingContext;
  readonly contextResources = new ContextResourceRegistry();
  private readonly resources = new Set<WebGLTextureResource>();
  private destroyed = false;
  private contextLost = false;
  private restorationError: unknown;
  private restorationPromise: Promise<void> = Promise.resolve();
  private textureResourceId = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: WebGL2DeviceOptions = {},
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: options.alpha ?? true,
      antialias: options.antialias ?? false,
      depth: options.depth ?? false,
      stencil: options.stencil ?? false,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: options.powerPreference ?? 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is unavailable for this canvas');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  get isContextLost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  get contextGeneration(): number {
    return this.contextResources.generation;
  }

  get contextRestorationError(): unknown {
    return this.restorationError;
  }

  async waitForContextRestoration(): Promise<void> {
    await this.restorationPromise;
    if (this.restorationError) {
      throw new Error('WebGL2 context restoration failed', { cause: this.restorationError });
    }
  }

  diagnostics(): WebGL2DeviceDiagnostics {
    const estimatedTextureBytes = [...this.resources].reduce((total, resource) => total + textureBytes(resource.descriptor), 0);
    const context = this.contextResources.snapshot();
    const estimatedContextBytes = context
      .filter((resource) => !resource.id.startsWith('gl-game-lab.render-webgl2.texture.'))
      .reduce((total, resource) => total + resource.estimatedBytes, 0);
    return Object.freeze({
      textureCount: this.resources.size,
      contextResourceCount: context.length,
      ownedContextResourceCount: context.filter((resource) => !resource.id.startsWith('gl-game-lab.render-webgl2.texture.')).length,
      estimatedTextureBytes,
      estimatedContextBytes,
      estimatedGpuBytes: estimatedTextureBytes + estimatedContextBytes,
      contextGeneration: this.contextGeneration,
    });
  }

  registerContextResource(resource: ContextRestorableResource): () => void {
    this.assertNotDestroyed();
    return this.contextResources.register(resource);
  }

  rebuildContextResourcesForDiagnostics(): void {
    this.assertUsable();
    this.contextResources.invalidate();
    this.contextResources.restore();
  }

  ownContextResource<T>(descriptor: RestorableResourceDescriptor<T>): RestorableResourceOwner<T> {
    this.assertUsable();
    return new RestorableResourceOwner(this.contextResources, descriptor);
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio = 1): void {
    this.assertUsable();
    const width = requireDimension(Math.round(cssWidth * pixelRatio), 'Canvas width');
    const height = requireDimension(Math.round(cssHeight * pixelRatio), 'Canvas height');
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  clear(red = 0, green = 0, blue = 0, alpha = 0): void {
    this.assertUsable();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.clearColor(red, green, blue, alpha);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);
  }

  createTexture(descriptor: WebGLTextureDescriptor): WebGLTextureResource {
    this.assertUsable();
    const normalized = normalizeTextureDescriptor(descriptor);
    const allocate = (): TextureAllocation => this.allocateTexture(normalized, () => {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        normalized.format === 'rgba16f' ? this.gl.RGBA16F : this.gl.RGBA8,
        normalized.width,
        normalized.height,
        0,
        this.gl.RGBA,
        normalized.format === 'rgba16f' ? this.gl.HALF_FLOAT : this.gl.UNSIGNED_BYTE,
        null,
      );
    });
    return this.trackTexture(allocate(), normalized, allocate);
  }

  createTextureFromImage(source: TexImageSource, descriptor: WebGLImageTextureDescriptor): WebGLTextureResource {
    this.assertUsable();
    const normalized = normalizeTextureDescriptor(descriptor);
    const allocate = (): TextureAllocation => this.allocateTexture(normalized, () => {
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, descriptor.flipY === true ? 1 : 0);
      try {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          normalized.format === 'rgba16f' ? this.gl.RGBA16F : this.gl.RGBA8,
          this.gl.RGBA,
          normalized.format === 'rgba16f' ? this.gl.HALF_FLOAT : this.gl.UNSIGNED_BYTE,
          source,
        );
      } finally {
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 0);
      }
    });
    return this.trackTexture(allocate(), normalized, allocate, descriptor.releaseSource);
  }

  createTextureFromRgbaPixels(pixels: Uint8Array, descriptor: WebGLRgbaTextureDescriptor): WebGLTextureResource {
    this.assertUsable();
    const normalized = normalizeTextureDescriptor({ ...descriptor, format: 'rgba8' });
    if (pixels.length !== normalized.width * normalized.height * 4) {
      throw new Error('RGBA pixel data length does not match texture dimensions');
    }
    const restorationPixels = pixels.slice();
    const allocate = (): TextureAllocation => this.allocateTexture(normalized, () => {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA8,
        normalized.width,
        normalized.height,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        restorationPixels,
      );
    });
    return this.trackTexture(allocate(), normalized, allocate);
  }

  textureAllocator(): RenderResourceAllocator<WebGLTextureResource, WebGLTextureDescriptor> {
    return {
      create: (descriptor) => this.createTexture(descriptor),
      destroy: (resource) => {
        resource.dispose();
      },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.contextResources.clear();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.restorationError = undefined;
    try {
      this.contextResources.invalidate();
    } catch (error) {
      this.restorationError = error;
    }
  };

  private readonly handleContextRestored = (): void => {
    this.restorationError = undefined;
    this.contextLost = true;
    this.restorationPromise = waitForRestoredDriver().then(() => {
      if (this.destroyed) return;
      try {
        this.contextResources.restore();
        this.contextLost = false;
      } catch (error) {
        this.restorationError = error;
        this.contextLost = true;
      }
    });
  };

  private assertUsable(): void {
    this.assertNotDestroyed();
    if (this.isContextLost) throw new Error('WebGL2 context is lost');
  }

  private assertNotDestroyed(): void {
    if (this.destroyed) throw new Error('WebGL2 device has been destroyed');
  }

  private allocateTexture(
    descriptor: NormalizedTextureDescriptor,
    upload: () => void,
  ): TextureAllocation {
    if (descriptor.format === 'rgba16f' && descriptor.renderTarget
      && !this.gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('EXT_color_buffer_float is required for rgba16f render targets');
    }
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Unable to allocate WebGL texture');
    let framebuffer: WebGLFramebuffer | undefined;
    try {
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        textureFilter(this.gl, descriptor.filter),
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        textureFilter(this.gl, descriptor.filter),
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        textureWrap(this.gl, descriptor.wrap),
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        textureWrap(this.gl, descriptor.wrap),
      );
      upload();
      if (descriptor.renderTarget) {
        framebuffer = this.gl.createFramebuffer() ?? undefined;
        if (!framebuffer) throw new Error('Unable to allocate WebGL framebuffer');
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.COLOR_ATTACHMENT0,
          this.gl.TEXTURE_2D,
          texture,
          0,
        );
        if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('WebGL framebuffer is incomplete');
        }
      }
      return { texture, framebuffer };
    } catch (error) {
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      this.gl.deleteTexture(texture);
      throw error;
    } finally {
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
  }

  private trackTexture(
    allocation: TextureAllocation,
    descriptor: NormalizedTextureDescriptor,
    restoreAllocation: () => TextureAllocation,
    releaseBacking?: () => void,
  ): WebGLTextureResource {
    let resource: WebGLTextureResource | undefined;
    const resourceId = `gl-game-lab.render-webgl2.texture.${this.textureResourceId}`;
    this.textureResourceId += 1;
    const unregister = this.contextResources.register({
      id: resourceId,
      priority: 0,
      estimatedBytes: textureBytes(descriptor),
      invalidate: () => { resource?.invalidate(); },
      restore: () => {
        if (!resource || resource.isDisposed) return;
        const restored = restoreAllocation();
        resource.restore(restored.texture, restored.framebuffer);
      },
    });
    resource = new WebGLTextureResource(
      this.gl,
      allocation.texture,
      allocation.framebuffer,
      descriptor,
      () => {
        unregister();
        releaseBacking?.();
        if (resource) this.resources.delete(resource);
      },
    );
    this.resources.add(resource);
    return resource;
  }
}

function waitForRestoredDriver(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => { resolve(); });
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}

export function normalizeTextureDescriptor(descriptor: WebGLTextureDescriptor): NormalizedTextureDescriptor {
  return {
    width: requireDimension(descriptor.width, 'Texture width'),
    height: requireDimension(descriptor.height, 'Texture height'),
    format: descriptor.format ?? 'rgba8',
    filter: descriptor.filter ?? 'linear',
    wrap: descriptor.wrap ?? 'clamp',
    renderTarget: descriptor.renderTarget ?? false,
  };
}

function requireDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function textureFilter(gl: WebGL2RenderingContext, filter: TextureFilter): number {
  return filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
}

function textureWrap(gl: WebGL2RenderingContext, wrap: TextureWrap): number {
  return wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
}

function textureBytes(descriptor: NormalizedTextureDescriptor): number {
  return descriptor.width * descriptor.height * (descriptor.format === 'rgba16f' ? 8 : 4);
}
