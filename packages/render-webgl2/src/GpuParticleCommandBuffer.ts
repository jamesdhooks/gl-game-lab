export const GPU_PARTICLE_COMMAND_FLOATS = 16;
export const GPU_PARTICLE_COMMAND_TEXELS = GPU_PARTICLE_COMMAND_FLOATS / 4;
export const GPU_PARTICLE_COMMAND_CAPACITY = 64;

export interface NormalizedGpuParticleCommandBatch {
  readonly count: number;
  readonly dropped: number;
  readonly requiredFloats: number;
}

export function normalizeGpuParticleCommandBatch(count: number, dataLength: number, capacity = GPU_PARTICLE_COMMAND_CAPACITY): NormalizedGpuParticleCommandBatch {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('GPU particle command count must be a non-negative integer');
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > GPU_PARTICLE_COMMAND_CAPACITY) throw new Error(`GPU particle command capacity must be between 1 and ${GPU_PARTICLE_COMMAND_CAPACITY}`);
  const normalized = Math.min(count, capacity);
  const requiredFloats = normalized * GPU_PARTICLE_COMMAND_FLOATS;
  if (dataLength < requiredFloats) throw new Error(`GPU particle command data requires at least ${requiredFloats} floats`);
  return Object.freeze({ count: normalized, dropped: count - normalized, requiredFloats });
}

export class GpuParticleCommandBuffer {
  readonly capacity: number;
  readonly width: number;
  private readonly texture: WebGLTexture;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, capacity = GPU_PARTICLE_COMMAND_CAPACITY) {
    normalizeGpuParticleCommandBatch(0, 0, capacity);
    this.capacity = capacity;
    this.width = capacity * GPU_PARTICLE_COMMAND_TEXELS;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to allocate GPU particle command texture');
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  upload(data: Float32Array, count: number): NormalizedGpuParticleCommandBatch {
    this.assertUsable();
    const normalized = normalizeGpuParticleCommandBatch(count, data.length, this.capacity);
    if (normalized.count === 0) return normalized;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      0,
      0,
      normalized.count * GPU_PARTICLE_COMMAND_TEXELS,
      1,
      this.gl.RGBA,
      this.gl.FLOAT,
      data.subarray(0, normalized.requiredFloats),
    );
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    return normalized;
  }

  bind(unit: number): void {
    this.assertUsable();
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteTexture(this.texture);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('GPU particle command buffer has been disposed');
  }
}
