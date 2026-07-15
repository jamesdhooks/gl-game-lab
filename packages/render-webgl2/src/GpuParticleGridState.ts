import type {
  GpuParticleGridSeed2D,
  GpuParticleGridSnapshot2D,
  GpuParticleGridSystem2DOptions,
} from '@hooksjam/gl-game-lab-engine';
import { createGpuDoubleRenderTarget, type GpuDoubleRenderTarget } from './GpuRenderTarget.js';

export interface GpuParticleGridStateSize {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

export function resolveGpuParticleGridStateSize(options: GpuParticleGridSystem2DOptions): GpuParticleGridStateSize {
  if (!Number.isSafeInteger(options.capacity) || options.capacity < 1) throw new Error('GPU particle-grid capacity must be a positive integer');
  const width = positive(options.width ?? Math.ceil(Math.sqrt(options.capacity)), 'GPU particle-grid state width');
  const height = positive(options.height ?? Math.ceil(options.capacity / width), 'GPU particle-grid state height');
  const gridWidth = positive(options.gridWidth, 'GPU particle-grid grid width');
  const gridHeight = positive(options.gridHeight, 'GPU particle-grid grid height');
  return Object.freeze({ capacity: Math.min(options.capacity, width * height), width, height, gridWidth, gridHeight });
}

export class GpuParticleGridState {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly particleA: GpuDoubleRenderTarget;
  readonly particleB: GpuDoubleRenderTarget;
  readonly particleC: GpuDoubleRenderTarget;
  readonly accumulation: GpuDoubleRenderTarget;
  readonly working: GpuDoubleRenderTarget;
  readonly previous: GpuDoubleRenderTarget;
  readonly scratch: GpuDoubleRenderTarget;
  private scratchUpload = new Float32Array(0);
  private scratchReadback = new Float32Array(0);
  private activeCount = 0;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, options: GpuParticleGridSystem2DOptions) {
    const size = resolveGpuParticleGridStateSize(options);
    this.capacity = size.capacity;
    this.width = size.width;
    this.height = size.height;
    this.gridWidth = size.gridWidth;
    this.gridHeight = size.gridHeight;
    const particle = { width: this.width, height: this.height, precision: 'float' as const, filter: 'nearest' as const };
    const grid = { width: this.gridWidth, height: this.gridHeight, precision: 'float' as const, filter: 'nearest' as const };
    const allocated: GpuDoubleRenderTarget[] = [];
    this.particleA = createGpuDoubleRenderTarget(gl, particle);
    allocated.push(this.particleA);
    try {
      this.particleB = createGpuDoubleRenderTarget(gl, particle);
      allocated.push(this.particleB);
      this.particleC = createGpuDoubleRenderTarget(gl, particle);
      allocated.push(this.particleC);
      this.accumulation = createGpuDoubleRenderTarget(gl, grid);
      allocated.push(this.accumulation);
      this.working = createGpuDoubleRenderTarget(gl, grid);
      allocated.push(this.working);
      this.previous = createGpuDoubleRenderTarget(gl, grid);
      allocated.push(this.previous);
      this.scratch = createGpuDoubleRenderTarget(gl, grid);
      allocated.push(this.scratch);
    } catch (error) {
      for (const target of allocated.reverse()) target.dispose();
      throw error;
    }
    this.clear();
  }

  get count(): number {
    return this.activeCount;
  }

  clear(): void {
    this.assertUsable();
    this.activeCount = 0;
    this.particleA.clear();
    this.particleB.clear();
    this.particleC.clear();
    this.accumulation.clear();
    this.working.clear();
    this.previous.clear();
    this.scratch.clear();
  }

  uploadSeed(seed: GpuParticleGridSeed2D): void {
    this.assertUsable();
    validateSeed(seed, this.capacity);
    this.activeCount = seed.count;
    const length = this.width * this.height * 4;
    this.upload(this.particleA, packParticleA(seed, this.ensureUploadScratch(length)));
    this.upload(this.particleB, packParticleB(seed, this.ensureUploadScratch(length)));
    this.upload(this.particleC, packParticleC(seed, this.ensureUploadScratch(length)));
  }

  debugReadback(): GpuParticleGridSnapshot2D {
    this.assertUsable();
    const count = this.activeCount;
    const a = this.read(this.particleA);
    const b = this.read(this.particleB);
    const c = this.read(this.particleC);
    const positions = new Float32Array(count * 2);
    const velocities = new Float32Array(count * 2);
    const radii = new Float32Array(count);
    const colorSeeds = new Float32Array(count);
    const foam = new Float32Array(count);
    const affine = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      const particleOffset = index * 4;
      const vectorOffset = index * 2;
      positions[vectorOffset] = a[particleOffset] ?? 0;
      positions[vectorOffset + 1] = a[particleOffset + 1] ?? 0;
      foam[index] = a[particleOffset + 2] ?? 0;
      velocities[vectorOffset] = b[particleOffset] ?? 0;
      velocities[vectorOffset + 1] = b[particleOffset + 1] ?? 0;
      radii[index] = b[particleOffset + 2] ?? 0;
      colorSeeds[index] = b[particleOffset + 3] ?? 0;
      affine.set(c.subarray(particleOffset, particleOffset + 4), particleOffset);
    }
    return Object.freeze({ count, positions, velocities, radii, colorSeeds, foam, affine });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particleA.dispose();
    this.particleB.dispose();
    this.particleC.dispose();
    this.accumulation.dispose();
    this.working.dispose();
    this.previous.dispose();
    this.scratch.dispose();
  }

  private upload(target: GpuDoubleRenderTarget, data: Float32Array): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.read.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.gl.RGBA, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.write.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.gl.RGBA, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private read(target: GpuDoubleRenderTarget): Float32Array {
    const length = target.width * target.height * 4;
    const output = this.ensureReadbackScratch(length).slice(0, length);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.read.framebuffer);
    this.gl.readPixels(0, 0, target.width, target.height, this.gl.RGBA, this.gl.FLOAT, output);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return output;
  }

  private ensureUploadScratch(length: number): Float32Array {
    if (this.scratchUpload.length < length) this.scratchUpload = new Float32Array(length);
    this.scratchUpload.fill(0, 0, length);
    return this.scratchUpload.subarray(0, length);
  }

  private ensureReadbackScratch(length: number): Float32Array {
    if (this.scratchReadback.length < length) this.scratchReadback = new Float32Array(length);
    return this.scratchReadback;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('GPU particle-grid state has been disposed');
  }
}

export function gpuParticleGridBytes(options: GpuParticleGridSystem2DOptions): number {
  const size = resolveGpuParticleGridStateSize(options);
  const particleBytes = size.width * size.height * 16 * 3 * 2;
  const gridBytes = size.gridWidth * size.gridHeight * 16 * 4 * 2;
  return particleBytes + gridBytes;
}

function validateSeed(seed: GpuParticleGridSeed2D, capacity: number): void {
  if (!Number.isSafeInteger(seed.count) || seed.count < 0 || seed.count > capacity) throw new Error('GPU particle-grid seed count exceeds capacity');
  if (seed.positions.length < seed.count * 2) throw new Error('GPU particle-grid seed positions are too short');
  if (seed.velocities.length < seed.count * 2) throw new Error('GPU particle-grid seed velocities are too short');
  if (seed.radii.length < seed.count) throw new Error('GPU particle-grid seed radii are too short');
  if (seed.colorSeeds.length < seed.count) throw new Error('GPU particle-grid seed color seeds are too short');
  if (seed.foam.length < seed.count) throw new Error('GPU particle-grid seed foam values are too short');
  if (seed.affine.length < seed.count * 4) throw new Error('GPU particle-grid seed affine values are too short');
}

function packParticleA(seed: GpuParticleGridSeed2D, output: Float32Array): Float32Array {
  for (let index = 0; index < seed.count; index += 1) {
    const sourceOffset = index * 2;
    const targetOffset = index * 4;
    output[targetOffset] = seed.positions[sourceOffset] ?? 0;
    output[targetOffset + 1] = seed.positions[sourceOffset + 1] ?? 0;
    output[targetOffset + 2] = seed.foam[index] ?? 0;
    output[targetOffset + 3] = 1;
  }
  return output;
}

function packParticleB(seed: GpuParticleGridSeed2D, output: Float32Array): Float32Array {
  for (let index = 0; index < seed.count; index += 1) {
    const sourceOffset = index * 2;
    const targetOffset = index * 4;
    output[targetOffset] = seed.velocities[sourceOffset] ?? 0;
    output[targetOffset + 1] = seed.velocities[sourceOffset + 1] ?? 0;
    output[targetOffset + 2] = seed.radii[index] ?? 0;
    output[targetOffset + 3] = seed.colorSeeds[index] ?? 0;
  }
  return output;
}

function packParticleC(seed: GpuParticleGridSeed2D, output: Float32Array): Float32Array {
  output.set(seed.affine.subarray(0, seed.count * 4));
  return output;
}

function positive(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
