export type GpuTexturePrecision = 'half-float' | 'float';

export interface GpuRenderTargetOptions {
  readonly width: number;
  readonly height: number;
  readonly precision?: GpuTexturePrecision;
  readonly filter?: 'nearest' | 'linear';
}

export interface GpuRenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
  attach(unit: number): number;
  clear(red?: number, green?: number, blue?: number, alpha?: number): void;
  dispose(): void;
}

export interface GpuDoubleRenderTarget {
  readonly read: GpuRenderTarget;
  readonly write: GpuRenderTarget;
  readonly width: number;
  readonly height: number;
  swap(): void;
  clear(): void;
  dispose(): void;
}

export function createGpuRenderTarget(gl: WebGL2RenderingContext, options: GpuRenderTargetOptions): GpuRenderTarget {
  const width = dimension(options.width, 'GPU target width');
  const height = dimension(options.height, 'GPU target height');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is required for GPU simulation targets');
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    if (texture) gl.deleteTexture(texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    throw new Error('Unable to allocate GPU render target');
  }
  const precision = options.precision ?? 'half-float';
  const filter = options.filter === 'linear' ? gl.LINEAR : gl.NEAREST;
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, precision === 'float' ? gl.RGBA32F : gl.RGBA16F, width, height, 0, gl.RGBA, precision === 'float' ? gl.FLOAT : gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`GPU render target framebuffer is incomplete: ${status}`);
  } catch (error) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    throw error;
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  let disposed = false;
  return {
    texture, framebuffer, width, height,
    attach: (unit) => {
      if (disposed) throw new Error('GPU render target has been disposed');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    },
    clear: (red = 0, green = 0, blue = 0, alpha = 0) => {
      if (disposed) throw new Error('GPU render target has been disposed');
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(red, green, blue, alpha);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    },
  };
}

export function createGpuDoubleRenderTarget(gl: WebGL2RenderingContext, options: GpuRenderTargetOptions): GpuDoubleRenderTarget {
  let read = createGpuRenderTarget(gl, options);
  let write = createGpuRenderTarget(gl, options);
  return {
    get read() { return read; },
    get write() { return write; },
    width: read.width,
    height: read.height,
    swap: () => { const previous = read; read = write; write = previous; },
    clear: () => { read.clear(); write.clear(); },
    dispose: () => { read.dispose(); write.dispose(); },
  };
}

function dimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
