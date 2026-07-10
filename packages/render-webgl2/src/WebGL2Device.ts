import type { RenderResourceAllocator } from './RenderGraph.js';

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

export class WebGLTextureResource {
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly texture: WebGLTexture,
    readonly framebuffer: WebGLFramebuffer | undefined,
    readonly descriptor: NormalizedTextureDescriptor,
  ) {}

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteTexture(this.texture);
  }
}

export class WebGL2Device {
  readonly gl: WebGL2RenderingContext;
  private readonly resources = new Set<WebGLTextureResource>();
  private destroyed = false;
  private contextLost = false;

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
    if (normalized.format === 'rgba16f' && normalized.renderTarget && !this.gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('EXT_color_buffer_float is required for rgba16f render targets');
    }
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Unable to allocate WebGL texture');
    let framebuffer: WebGLFramebuffer | undefined;
    try {
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, textureFilter(this.gl, normalized.filter));
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, textureFilter(this.gl, normalized.filter));
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, textureWrap(this.gl, normalized.wrap));
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, textureWrap(this.gl, normalized.wrap));
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
      if (normalized.renderTarget) {
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
      const resource = new WebGLTextureResource(this.gl, texture, framebuffer, normalized);
      this.resources.add(resource);
      return resource;
    } catch (error) {
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      this.gl.deleteTexture(texture);
      throw error;
    } finally {
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
  }

  textureAllocator(): RenderResourceAllocator<WebGLTextureResource, WebGLTextureDescriptor> {
    return {
      create: (descriptor) => this.createTexture(descriptor),
      destroy: (resource) => {
        resource.dispose();
        this.resources.delete(resource);
      },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
  };

  private assertUsable(): void {
    if (this.destroyed) throw new Error('WebGL2 device has been destroyed');
    if (this.isContextLost) throw new Error('WebGL2 context is lost');
  }
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
