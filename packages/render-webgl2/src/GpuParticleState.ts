import { createGpuDoubleRenderTarget, type GpuDoubleRenderTarget, type GpuTexturePrecision } from './GpuRenderTarget.js';

export interface GpuParticleStateOptions {
  readonly capacity: number;
  readonly width?: number;
  readonly height?: number;
  readonly precision?: GpuTexturePrecision;
  readonly metadata?: boolean;
}

export interface GpuParticleStateSeed {
  readonly positions?: Float32Array;
  readonly velocities?: Float32Array;
  readonly metadata?: Float32Array;
  readonly uploadWriteTargets?: boolean;
}

export interface GpuParticleStateSize {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
}

export function resolveGpuParticleStateSize(options: GpuParticleStateOptions): GpuParticleStateSize {
  if (!Number.isSafeInteger(options.capacity) || options.capacity < 1) throw new Error('GPU particle capacity must be a positive integer');
  if (options.width !== undefined || options.height !== undefined) {
    const width = positive(options.width ?? Math.ceil(Math.sqrt(options.capacity)), 'GPU particle state width');
    const height = positive(options.height ?? Math.ceil(options.capacity / width), 'GPU particle state height');
    return Object.freeze({ capacity: Math.min(options.capacity, width * height), width, height });
  }
  const width = Math.ceil(Math.sqrt(options.capacity));
  const height = Math.ceil(options.capacity / width);
  return Object.freeze({ capacity: options.capacity, width, height });
}

export class GpuParticleState {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  readonly precision: GpuTexturePrecision;
  readonly positions: GpuDoubleRenderTarget;
  readonly velocities: GpuDoubleRenderTarget;
  readonly metadata: GpuDoubleRenderTarget | undefined;
  private readonly writeFramebuffer: WebGLFramebuffer;
  private framebufferChecked = false;
  private scratch = new Float32Array(0);
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, options: GpuParticleStateOptions) {
    const size = resolveGpuParticleStateSize(options);
    this.capacity = size.capacity;
    this.width = size.width;
    this.height = size.height;
    this.precision = options.precision ?? 'float';
    const targets = { width: this.width, height: this.height, precision: this.precision, filter: 'nearest' as const };
    this.positions = createGpuDoubleRenderTarget(gl, targets);
    try {
      this.velocities = createGpuDoubleRenderTarget(gl, targets);
    } catch (error) {
      this.positions.dispose();
      throw error;
    }
    try {
      this.metadata = options.metadata ? createGpuDoubleRenderTarget(gl, targets) : undefined;
    } catch (error) {
      this.positions.dispose();
      this.velocities.dispose();
      throw error;
    }
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      this.positions.dispose();
      this.velocities.dispose();
      this.metadata?.dispose();
      throw new Error('Unable to allocate GPU particle MRT framebuffer');
    }
    this.writeFramebuffer = framebuffer;
    this.clear();
  }

  bindWriteFramebuffer(): void {
    this.assertUsable();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.positions.write.texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.velocities.write.texture, 0);
    if (this.metadata) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.metadata.write.texture, 0);
    gl.drawBuffers(this.metadata
      ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]
      : [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (!this.framebufferChecked) {
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`GPU particle MRT framebuffer is incomplete: ${status}`);
      this.framebufferChecked = true;
    }
  }

  swap(): void { this.positions.swap(); this.velocities.swap(); this.metadata?.swap(); }

  clear(): void { this.positions.clear(); this.velocities.clear(); this.metadata?.clear(); }

  uploadSeed(seed: GpuParticleStateSeed): void {
    this.assertUsable();
    if (this.precision !== 'float') throw new Error('GPU particle seed uploads require float precision');
    if (seed.positions) this.upload(this.positions, seed.positions, seed.uploadWriteTargets ?? true);
    if (seed.velocities) this.upload(this.velocities, seed.velocities, seed.uploadWriteTargets ?? true);
    if (seed.metadata) {
      if (!this.metadata) throw new Error('GPU particle metadata seed requires metadata state');
      this.upload(this.metadata, seed.metadata, seed.uploadWriteTargets ?? true);
    }
  }

  copyTo(target: GpuParticleState): boolean {
    this.assertUsable();
    if (target.gl !== this.gl || target.width !== this.width || target.height !== this.height || Boolean(target.metadata) !== Boolean(this.metadata)) return false;
    copyDoubleTarget(this.gl, this.positions, target.positions);
    copyDoubleTarget(this.gl, this.velocities, target.velocities);
    if (this.metadata && target.metadata) copyDoubleTarget(this.gl, this.metadata, target.metadata);
    this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, null);
    this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, null);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteFramebuffer(this.writeFramebuffer);
    this.positions.dispose();
    this.velocities.dispose();
    this.metadata?.dispose();
  }

  private upload(target: GpuDoubleRenderTarget, source: Float32Array, includeWrite: boolean): void {
    const length = this.width * this.height * 4;
    const data = source.length === length ? source : this.ensureScratch(length);
    if (data !== source) { data.fill(0); data.set(source.subarray(0, Math.min(source.length, length))); }
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.read.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, this.gl.RGBA, this.gl.FLOAT, data);
    if (includeWrite) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, target.write.texture);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, this.gl.RGBA, this.gl.FLOAT, data);
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private ensureScratch(length: number): Float32Array {
    if (this.scratch.length < length) this.scratch = new Float32Array(length);
    return this.scratch;
  }

  private assertUsable(): void { if (this.disposed) throw new Error('GPU particle state has been disposed'); }
}

function copyDoubleTarget(gl: WebGL2RenderingContext, source: GpuDoubleRenderTarget, target: GpuDoubleRenderTarget): void {
  copyTarget(gl, source.read.framebuffer, target.read.framebuffer, source.width, source.height);
  copyTarget(gl, source.write.framebuffer, target.write.framebuffer, source.width, source.height);
}

function copyTarget(gl: WebGL2RenderingContext, source: WebGLFramebuffer, target: WebGLFramebuffer, width: number, height: number): void {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target);
  gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
