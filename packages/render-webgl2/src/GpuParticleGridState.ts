import type {
  GpuParticleGridSeed2D,
  GpuParticleGridEmit2D,
  GpuParticleGridSnapshot2D,
  GpuParticleGridParticleUpdateOptions2D,
  GpuParticleGridSystem2DOptions,
  GpuParticleGridTransfer2D,
  GpuParticleGridTransferOptions2D,
  GpuParticleGridUpdate2D,
  GpuParticleGridUpdateOptions2D,
} from '@hooksjam/gl-game-lab-engine';
import { createGpuDoubleRenderTarget, type GpuDoubleRenderTarget } from './GpuRenderTarget.js';
import { createShaderProgram } from './ShaderProgram.js';

const DEBUG_P2G_MAX_PARTICLES = 64;
const DEBUG_PARTICLE_UPDATE_MAX_CIRCLES = 8;
const DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS = 8;

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
  private debugP2GProgram: WebGLProgram | undefined;
  private instancedP2GProgram: WebGLProgram | undefined;
  private debugNormalizePressureProgram: WebGLProgram | undefined;
  private debugForceProgram: WebGLProgram | undefined;
  private debugViscosityProgram: WebGLProgram | undefined;
  private debugParticleUpdateProgram: WebGLProgram | undefined;
  private debugP2GVao: WebGLVertexArrayObject | undefined;
  private instancedP2GVao: WebGLVertexArrayObject | undefined;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
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

  emit(batch: GpuParticleGridEmit2D): number {
    this.assertUsable();
    validateSeed(batch, Math.max(batch.count, 1));
    const made = Math.max(0, Math.min(batch.count, this.capacity - this.activeCount));
    if (made === 0) return 0;
    const texel = new Float32Array(4);
    for (let index = 0; index < made; index += 1) {
      const particle = this.activeCount + index;
      const x = particle % this.width;
      const y = Math.floor(particle / this.width);
      const vectorOffset = index * 2;
      const affineOffset = index * 4;
      texel.set([batch.positions[vectorOffset] ?? 0, batch.positions[vectorOffset + 1] ?? 0, batch.foam[index] ?? 0, 1]);
      this.uploadTexel(this.particleA, x, y, texel);
      texel.set([batch.velocities[vectorOffset] ?? 0, batch.velocities[vectorOffset + 1] ?? 0, batch.radii[index] ?? 0, batch.colorSeeds[index] ?? 0]);
      this.uploadTexel(this.particleB, x, y, texel);
      texel.set(batch.affine.subarray(affineOffset, affineOffset + 4));
      this.uploadTexel(this.particleC, x, y, texel);
    }
    this.activeCount += made;
    return made;
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

  debugComputeParticleToGrid(options: GpuParticleGridTransferOptions2D): GpuParticleGridTransfer2D {
    this.assertUsable();
    this.runParticleToGridPass(options);
    const grid = this.read(this.accumulation);
    const cellCount = this.gridWidth * this.gridHeight;
    const mass = new Float32Array(cellCount);
    const momentumX = new Float32Array(cellCount);
    const momentumY = new Float32Array(cellCount);
    for (let index = 0; index < cellCount; index += 1) {
      const offset = index * 4;
      mass[index] = grid[offset] ?? 0;
      momentumX[index] = grid[offset + 1] ?? 0;
      momentumY[index] = grid[offset + 2] ?? 0;
    }
    return Object.freeze({ columns: this.gridWidth, rows: this.gridHeight, mass, momentumX, momentumY });
  }

  debugComputeGridUpdate(options: GpuParticleGridUpdateOptions2D): GpuParticleGridUpdate2D {
    this.assertUsable();
    this.runGridUpdatePasses(options);
    const pressureGrid = this.read(this.working);
    const velocityGrid = this.read(this.scratch);
    const cellCount = this.gridWidth * this.gridHeight;
    const velocityX = new Float32Array(cellCount);
    const velocityY = new Float32Array(cellCount);
    const previousVelocityX = new Float32Array(cellCount);
    const previousVelocityY = new Float32Array(cellCount);
    const pressure = new Float32Array(cellCount);
    for (let index = 0; index < cellCount; index += 1) {
      const offset = index * 4;
      velocityX[index] = velocityGrid[offset] ?? 0;
      velocityY[index] = velocityGrid[offset + 1] ?? 0;
      previousVelocityX[index] = velocityGrid[offset + 2] ?? 0;
      previousVelocityY[index] = velocityGrid[offset + 3] ?? 0;
      pressure[index] = pressureGrid[offset + 2] ?? 0;
    }
    return Object.freeze({ columns: this.gridWidth, rows: this.gridHeight, velocityX, velocityY, previousVelocityX, previousVelocityY, pressure });
  }

  debugComputeParticleUpdate(options: GpuParticleGridParticleUpdateOptions2D): GpuParticleGridSnapshot2D {
    this.step(options);
    return this.debugReadback();
  }

  step(options: GpuParticleGridParticleUpdateOptions2D): void {
    this.assertUsable();
    if (!Number.isFinite(options.width) || options.width <= 0 || !Number.isFinite(options.height) || options.height <= 0) {
      throw new Error('GPU particle-grid debug particle update bounds must be positive');
    }
    const circleCount = Math.floor((options.circleObstacles?.length ?? 0) / 4);
    const segmentCount = Math.floor((options.segmentObstacles?.length ?? 0) / 8);
    if (circleCount > DEBUG_PARTICLE_UPDATE_MAX_CIRCLES) throw new Error(`GPU particle-grid debug particle update supports at most ${DEBUG_PARTICLE_UPDATE_MAX_CIRCLES} circle obstacles`);
    if (segmentCount > DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS) throw new Error(`GPU particle-grid debug particle update supports at most ${DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS} segment obstacles`);
    this.runGridUpdatePasses(options);
    this.runParticleUpdatePass(options);
    this.particleA.swap();
    this.particleB.swap();
    this.particleC.swap();
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
    if (this.debugP2GProgram) this.gl.deleteProgram(this.debugP2GProgram);
    if (this.instancedP2GProgram) this.gl.deleteProgram(this.instancedP2GProgram);
    if (this.debugNormalizePressureProgram) this.gl.deleteProgram(this.debugNormalizePressureProgram);
    if (this.debugForceProgram) this.gl.deleteProgram(this.debugForceProgram);
    if (this.debugViscosityProgram) this.gl.deleteProgram(this.debugViscosityProgram);
    if (this.debugParticleUpdateProgram) this.gl.deleteProgram(this.debugParticleUpdateProgram);
    if (this.debugP2GVao) this.gl.deleteVertexArray(this.debugP2GVao);
    if (this.instancedP2GVao) this.gl.deleteVertexArray(this.instancedP2GVao);
    this.uniforms.clear();
  }

  private upload(target: GpuDoubleRenderTarget, data: Float32Array): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.read.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.gl.RGBA, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.write.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.gl.RGBA, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private uploadTexel(target: GpuDoubleRenderTarget, x: number, y: number, data: Float32Array): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.read.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, x, y, 1, 1, this.gl.RGBA, this.gl.FLOAT, data);
    this.gl.bindTexture(this.gl.TEXTURE_2D, target.write.texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, x, y, 1, 1, this.gl.RGBA, this.gl.FLOAT, data);
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

  private ensureDebugP2GProgram(): WebGLProgram {
    if (!this.debugP2GProgram) {
      this.debugP2GProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid debug P2G',
        vertexSource: FULLSCREEN_VERTEX_SHADER,
        fragmentSource: DEBUG_P2G_FRAGMENT_SHADER,
      });
    }
    return this.debugP2GProgram;
  }

  private ensureDebugNormalizePressureProgram(): WebGLProgram {
    if (!this.debugNormalizePressureProgram) {
      this.debugNormalizePressureProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid debug normalize pressure',
        vertexSource: FULLSCREEN_VERTEX_SHADER,
        fragmentSource: DEBUG_NORMALIZE_PRESSURE_FRAGMENT_SHADER,
      });
    }
    return this.debugNormalizePressureProgram;
  }

  private ensureInstancedP2GProgram(): WebGLProgram {
    if (!this.instancedP2GProgram) {
      this.instancedP2GProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid instanced P2G',
        vertexSource: INSTANCED_P2G_VERTEX_SHADER,
        fragmentSource: INSTANCED_P2G_FRAGMENT_SHADER,
      });
    }
    return this.instancedP2GProgram;
  }

  private ensureDebugForceProgram(): WebGLProgram {
    if (!this.debugForceProgram) {
      this.debugForceProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid debug pressure force',
        vertexSource: FULLSCREEN_VERTEX_SHADER,
        fragmentSource: DEBUG_FORCE_FRAGMENT_SHADER,
      });
    }
    return this.debugForceProgram;
  }

  private ensureDebugViscosityProgram(): WebGLProgram {
    if (!this.debugViscosityProgram) {
      this.debugViscosityProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid debug viscosity',
        vertexSource: FULLSCREEN_VERTEX_SHADER,
        fragmentSource: DEBUG_VISCOSITY_FRAGMENT_SHADER,
      });
    }
    return this.debugViscosityProgram;
  }

  private ensureDebugParticleUpdateProgram(): WebGLProgram {
    if (!this.debugParticleUpdateProgram) {
      this.debugParticleUpdateProgram = createShaderProgram(this.gl, {
        label: 'GPU particle-grid debug particle update',
        vertexSource: FULLSCREEN_VERTEX_SHADER,
        fragmentSource: DEBUG_PARTICLE_UPDATE_FRAGMENT_SHADER,
      });
    }
    return this.debugParticleUpdateProgram;
  }

  private ensureDebugP2GVao(): WebGLVertexArrayObject {
    if (!this.debugP2GVao) {
      const vao = this.gl.createVertexArray();
      if (!vao) throw new Error('Unable to allocate GPU particle-grid debug P2G vertex array');
      this.debugP2GVao = vao;
    }
    return this.debugP2GVao;
  }

  private ensureInstancedP2GVao(): WebGLVertexArrayObject {
    if (!this.instancedP2GVao) {
      const vao = this.gl.createVertexArray();
      if (!vao) throw new Error('Unable to allocate GPU particle-grid instanced P2G vertex array');
      this.instancedP2GVao = vao;
    }
    return this.instancedP2GVao;
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let uniforms = this.uniforms.get(program);
    if (!uniforms) {
      uniforms = new Map<string, WebGLUniformLocation | null>();
      this.uniforms.set(program, uniforms);
    }
    if (!uniforms.has(name)) uniforms.set(name, this.gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  }

  private runParticleToGridPass(options: GpuParticleGridTransferOptions2D): void {
    if (options.particleToGridMode === 'instanced-splat') {
      this.runInstancedParticleToGridPass(options);
      return;
    }
    if (this.activeCount > DEBUG_P2G_MAX_PARTICLES) throw new Error(`GPU particle-grid debug P2G supports at most ${DEBUG_P2G_MAX_PARTICLES} particles`);
    if (!Number.isFinite(options.cell) || options.cell <= 0) throw new Error('GPU particle-grid debug P2G cell must be positive');
    if (!Number.isFinite(options.radius) || options.radius <= 0) throw new Error('GPU particle-grid debug P2G radius must be positive');
    const gl = this.gl;
    const program = this.ensureDebugP2GProgram();
    const vao = this.ensureDebugP2GVao();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulation.write.framebuffer);
    gl.viewport(0, 0, this.gridWidth, this.gridHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.particleA.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.particleB.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleB'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.particleC.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleC'), 2);
    gl.uniform1i(this.uniform(program, 'uParticleCount'), this.activeCount);
    gl.uniform2i(this.uniform(program, 'uParticleStateSize'), this.width, this.height);
    gl.uniform2i(this.uniform(program, 'uGridSize'), this.gridWidth, this.gridHeight);
    gl.uniform1f(this.uniform(program, 'uCell'), options.cell);
    gl.uniform1f(this.uniform(program, 'uRadius'), options.radius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.accumulation.swap();
  }

  private runInstancedParticleToGridPass(options: GpuParticleGridTransferOptions2D): void {
    if (!Number.isFinite(options.cell) || options.cell <= 0) throw new Error('GPU particle-grid instanced P2G cell must be positive');
    if (!Number.isFinite(options.radius) || options.radius <= 0) throw new Error('GPU particle-grid instanced P2G radius must be positive');
    const gl = this.gl;
    const program = this.ensureInstancedP2GProgram();
    const vao = this.ensureInstancedP2GVao();
    this.accumulation.write.clear();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulation.write.framebuffer);
    gl.viewport(0, 0, this.gridWidth, this.gridHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.particleA.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.particleB.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleB'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.particleC.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleC'), 2);
    gl.uniform1i(this.uniform(program, 'uParticleCount'), this.activeCount);
    gl.uniform2i(this.uniform(program, 'uParticleStateSize'), this.width, this.height);
    gl.uniform2i(this.uniform(program, 'uGridSize'), this.gridWidth, this.gridHeight);
    gl.uniform1f(this.uniform(program, 'uCell'), options.cell);
    gl.uniform1f(this.uniform(program, 'uRadius'), options.radius);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.activeCount);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.accumulation.swap();
  }

  private runGridUpdatePasses(options: GpuParticleGridUpdateOptions2D): void {
    if (!Number.isFinite(options.dt) || options.dt < 0) throw new Error('GPU particle-grid debug update dt must be non-negative');
    for (const [value, label] of [
      [options.stiffness, 'stiffness'],
      [options.restDensity, 'rest density'],
      [options.separation, 'separation'],
      [options.viscosity, 'viscosity'],
      [options.gravity, 'gravity'],
    ] as const) {
      if (!Number.isFinite(value)) throw new Error(`GPU particle-grid debug update ${label} must be finite`);
    }
    this.runParticleToGridPass(options);
    this.runNormalizePressurePass(options);
    this.runForcePass(options);
    this.runViscosityPass(options);
  }

  private runNormalizePressurePass(options: GpuParticleGridUpdateOptions2D): void {
    const gl = this.gl;
    const program = this.ensureDebugNormalizePressureProgram();
    const vao = this.ensureDebugP2GVao();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.working.write.framebuffer);
    gl.viewport(0, 0, this.gridWidth, this.gridHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumulation.read.texture);
    gl.uniform1i(this.uniform(program, 'uTransfer'), 0);
    gl.uniform1f(this.uniform(program, 'uSupport'), Math.max(0.65, Math.min(8, options.radius / options.cell)));
    gl.uniform1f(this.uniform(program, 'uRestDensity'), options.restDensity);
    gl.uniform1f(this.uniform(program, 'uStiffness'), options.stiffness);
    gl.uniform1f(this.uniform(program, 'uSeparation'), options.separation);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.working.swap();
  }

  private runForcePass(options: GpuParticleGridUpdateOptions2D): void {
    const gl = this.gl;
    const program = this.ensureDebugForceProgram();
    const vao = this.ensureDebugP2GVao();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.previous.write.framebuffer);
    gl.viewport(0, 0, this.gridWidth, this.gridHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.working.read.texture);
    gl.uniform1i(this.uniform(program, 'uNormalized'), 0);
    gl.uniform2i(this.uniform(program, 'uGridSize'), this.gridWidth, this.gridHeight);
    gl.uniform1f(this.uniform(program, 'uCell'), options.cell);
    gl.uniform1f(this.uniform(program, 'uDt'), options.dt);
    gl.uniform1f(this.uniform(program, 'uGravity'), options.gravity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.previous.swap();
  }

  private runViscosityPass(options: GpuParticleGridUpdateOptions2D): void {
    const gl = this.gl;
    const program = this.ensureDebugViscosityProgram();
    const vao = this.ensureDebugP2GVao();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratch.write.framebuffer);
    gl.viewport(0, 0, this.gridWidth, this.gridHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.previous.read.texture);
    gl.uniform1i(this.uniform(program, 'uForced'), 0);
    gl.uniform2i(this.uniform(program, 'uGridSize'), this.gridWidth, this.gridHeight);
    gl.uniform1f(this.uniform(program, 'uViscosityBlend'), Math.max(0, Math.min(0.85, options.viscosity * options.dt * 14)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.scratch.swap();
  }

  private runParticleUpdatePass(options: GpuParticleGridParticleUpdateOptions2D): void {
    const gl = this.gl;
    const program = this.ensureDebugParticleUpdateProgram();
    const vao = this.ensureDebugP2GVao();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.particleA.write.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.particleB.write.texture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.particleC.write.texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.particleA.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.particleB.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleB'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.particleC.read.texture);
    gl.uniform1i(this.uniform(program, 'uParticleC'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.scratch.read.texture);
    gl.uniform1i(this.uniform(program, 'uVelocityGrid'), 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.accumulation.read.texture);
    gl.uniform1i(this.uniform(program, 'uMassGrid'), 4);
    gl.uniform1i(this.uniform(program, 'uParticleCount'), this.activeCount);
    gl.uniform2i(this.uniform(program, 'uParticleStateSize'), this.width, this.height);
    gl.uniform2i(this.uniform(program, 'uGridSize'), this.gridWidth, this.gridHeight);
    gl.uniform1f(this.uniform(program, 'uCell'), options.cell);
    gl.uniform1f(this.uniform(program, 'uDt'), options.dt);
    gl.uniform1f(this.uniform(program, 'uWidth'), options.width);
    gl.uniform1f(this.uniform(program, 'uHeight'), options.height);
    gl.uniform1f(this.uniform(program, 'uFlipness'), Math.max(0, Math.min(1, options.flipness)));
    gl.uniform1i(this.uniform(program, 'uFoamParity'), options.foamFrame & 1);
    this.setObstacleUniforms(program, options);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private setObstacleUniforms(program: WebGLProgram, options: GpuParticleGridParticleUpdateOptions2D): void {
    const gl = this.gl;
    const circleCount = Math.floor((options.circleObstacles?.length ?? 0) / 4);
    const segmentCount = Math.floor((options.segmentObstacles?.length ?? 0) / 8);
    const circles = new Float32Array(DEBUG_PARTICLE_UPDATE_MAX_CIRCLES * 4);
    const segmentsA = new Float32Array(DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS * 4);
    const segmentsB = new Float32Array(DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS * 4);
    if (options.circleObstacles) circles.set(options.circleObstacles.subarray(0, Math.min(options.circleObstacles.length, circles.length)));
    if (options.segmentObstacles) {
      for (let index = 0; index < segmentCount; index += 1) {
        const source = index * 8;
        const target = index * 4;
        segmentsA[target] = options.segmentObstacles[source] ?? 0;
        segmentsA[target + 1] = options.segmentObstacles[source + 1] ?? 0;
        segmentsA[target + 2] = options.segmentObstacles[source + 2] ?? 0;
        segmentsA[target + 3] = options.segmentObstacles[source + 3] ?? 0;
        segmentsB[target] = options.segmentObstacles[source + 4] ?? 0;
      }
    }
    gl.uniform1i(this.uniform(program, 'uCircleObstacleCount'), circleCount);
    gl.uniform1i(this.uniform(program, 'uSegmentObstacleCount'), segmentCount);
    gl.uniform4fv(this.uniform(program, 'uCircleObstacles'), circles);
    gl.uniform4fv(this.uniform(program, 'uSegmentObstacleA'), segmentsA);
    gl.uniform4fv(this.uniform(program, 'uSegmentObstacleB'), segmentsB);
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

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}`;

const INSTANCED_P2G_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uParticleA;
uniform sampler2D uParticleB;
uniform sampler2D uParticleC;
uniform int uParticleCount;
uniform ivec2 uParticleStateSize;
uniform ivec2 uGridSize;
uniform float uCell;
uniform float uRadius;
flat out int vActive;
flat out ivec2 vMinVirtual;
flat out ivec2 vMaxVirtual;
out vec2 vGridPosition;
out vec4 vParticleB;
out vec4 vParticleC;

const vec2 CORNERS[6] = vec2[6](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(0.0, 1.0),
  vec2(1.0, 0.0),
  vec2(1.0, 1.0)
);

ivec2 particleTexel(int index) {
  return ivec2(index % uParticleStateSize.x, index / uParticleStateSize.x);
}

void main() {
  int particle = gl_InstanceID;
  vec2 corner = CORNERS[gl_VertexID];
  if (particle >= uParticleCount) {
    vActive = 0;
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  ivec2 texel = particleTexel(particle);
  vec4 a = texelFetch(uParticleA, texel, 0);
  if (a.w <= 0.0) {
    vActive = 0;
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  float support = clamp(uRadius / uCell, 0.65, 8.0);
  int supportCells = int(ceil(support)) + 1;
  vec2 gridPosition = a.xy / uCell;
  ivec2 minVirtual = ivec2(floor(gridPosition - vec2(float(supportCells))));
  ivec2 maxVirtual = ivec2(ceil(gridPosition + vec2(float(supportCells))));
  ivec2 minCell = clamp(minVirtual, ivec2(0), uGridSize - ivec2(1));
  ivec2 maxCell = clamp(maxVirtual, ivec2(0), uGridSize - ivec2(1));
  vec2 gridCorner = mix(vec2(minCell), vec2(maxCell + ivec2(1)), corner);
  vec2 clip = gridCorner / vec2(uGridSize) * 2.0 - 1.0;
  vActive = 1;
  vMinVirtual = minVirtual;
  vMaxVirtual = maxVirtual;
  vGridPosition = gridPosition;
  vParticleB = texelFetch(uParticleB, texel, 0);
  vParticleC = texelFetch(uParticleC, texel, 0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const INSTANCED_P2G_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform ivec2 uGridSize;
uniform float uCell;
uniform float uRadius;
flat in int vActive;
flat in ivec2 vMinVirtual;
flat in ivec2 vMaxVirtual;
in vec2 vGridPosition;
in vec4 vParticleB;
in vec4 vParticleC;
out vec4 outGrid;

int gridIndex(ivec2 cell) {
  return cell.y * uGridSize.x + cell.x;
}

float kernelWeight(ivec2 virtualCell, float inverseSupportSquared) {
  vec2 delta = vec2(virtualCell) - vGridPosition;
  float normalizedDistanceSquared = dot(delta, delta) * inverseSupportSquared;
  if (normalizedDistanceSquared >= 1.0) return 0.0;
  float core = 1.0 - normalizedDistanceSquared;
  return core * core * (0.56 + core * 0.44);
}

void main() {
  if (vActive == 0) discard;
  ivec2 current = ivec2(gl_FragCoord.xy);
  float support = clamp(uRadius / uCell, 0.65, 8.0);
  float inverseSupportSquared = 1.0 / (support * support);
  float weightSum = 0.0;
  for (int yyOffset = 0; yyOffset <= 20; yyOffset += 1) {
    int yy = vMinVirtual.y + yyOffset;
    if (yy > vMaxVirtual.y) continue;
    for (int xxOffset = 0; xxOffset <= 20; xxOffset += 1) {
      int xx = vMinVirtual.x + xxOffset;
      if (xx > vMaxVirtual.x) continue;
      weightSum += kernelWeight(ivec2(xx, yy), inverseSupportSquared);
    }
  }
  if (weightSum <= 0.000001) discard;
  float invWeight = clamp(1.05 + support * support * 0.88, 1.05, 42.0) / weightSum;
  vec3 total = vec3(0.0);
  for (int yyOffset = 0; yyOffset <= 20; yyOffset += 1) {
    int yy = vMinVirtual.y + yyOffset;
    if (yy > vMaxVirtual.y) continue;
    for (int xxOffset = 0; xxOffset <= 20; xxOffset += 1) {
      int xx = vMinVirtual.x + xxOffset;
      if (xx > vMaxVirtual.x) continue;
      ivec2 clamped = ivec2(clamp(xx, 0, uGridSize.x - 1), clamp(yy, 0, uGridSize.y - 1));
      if (gridIndex(clamped) != gridIndex(current)) continue;
      vec2 delta = vec2(float(xx), float(yy)) - vGridPosition;
      float baseWeight = kernelWeight(ivec2(xx, yy), inverseSupportSquared);
      if (baseWeight <= 0.0) continue;
      float weight = baseWeight * invWeight;
      float affineX = vParticleC.x * delta.x + vParticleC.y * delta.y;
      float affineY = vParticleC.z * delta.x + vParticleC.w * delta.y;
      total += vec3(weight, (vParticleB.x + affineX) * weight, (vParticleB.y + affineY) * weight);
    }
  }
  if (total.x <= 0.0) discard;
  outGrid = vec4(total, 0.0);
}`;

const DEBUG_P2G_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uParticleA;
uniform sampler2D uParticleB;
uniform sampler2D uParticleC;
uniform int uParticleCount;
uniform ivec2 uParticleStateSize;
uniform ivec2 uGridSize;
uniform float uCell;
uniform float uRadius;
out vec4 outGrid;

ivec2 particleTexel(int index) {
  return ivec2(index % uParticleStateSize.x, index / uParticleStateSize.x);
}

int gridIndex(ivec2 cell) {
  return cell.y * uGridSize.x + cell.x;
}

void main() {
  ivec2 current = ivec2(gl_FragCoord.xy);
  float support = clamp(uRadius / uCell, 0.65, 8.0);
  int supportCells = int(ceil(support)) + 1;
  float inverseSupportSquared = 1.0 / (support * support);
  vec3 total = vec3(0.0);
  for (int particle = 0; particle < ${DEBUG_P2G_MAX_PARTICLES}; particle += 1) {
    if (particle >= uParticleCount) break;
    ivec2 texel = particleTexel(particle);
    vec4 a = texelFetch(uParticleA, texel, 0);
    if (a.w <= 0.0) continue;
    vec4 b = texelFetch(uParticleB, texel, 0);
    vec4 c = texelFetch(uParticleC, texel, 0);
    vec2 gridPosition = a.xy / uCell;
    int minY = int(floor(gridPosition.y - float(supportCells)));
    int maxY = int(ceil(gridPosition.y + float(supportCells)));
    int minX = int(floor(gridPosition.x - float(supportCells)));
    int maxX = int(ceil(gridPosition.x + float(supportCells)));
    float weightSum = 0.0;
    for (int yyOffset = -10; yyOffset <= 10; yyOffset += 1) {
      int yy = minY + yyOffset;
      if (yy > maxY) continue;
      for (int xxOffset = -10; xxOffset <= 10; xxOffset += 1) {
        int xx = minX + xxOffset;
        if (xx > maxX) continue;
        vec2 delta = vec2(float(xx), float(yy)) - gridPosition;
        float normalizedDistanceSquared = dot(delta, delta) * inverseSupportSquared;
        if (normalizedDistanceSquared >= 1.0) continue;
        float core = 1.0 - normalizedDistanceSquared;
        weightSum += core * core * (0.56 + core * 0.44);
      }
    }
    if (weightSum <= 0.000001) continue;
    float invWeight = clamp(1.05 + support * support * 0.88, 1.05, 42.0) / weightSum;
    for (int yyOffset = -10; yyOffset <= 10; yyOffset += 1) {
      int yy = minY + yyOffset;
      if (yy > maxY) continue;
      for (int xxOffset = -10; xxOffset <= 10; xxOffset += 1) {
        int xx = minX + xxOffset;
        if (xx > maxX) continue;
        ivec2 clamped = ivec2(clamp(xx, 0, uGridSize.x - 1), clamp(yy, 0, uGridSize.y - 1));
        if (gridIndex(clamped) != gridIndex(current)) continue;
        vec2 delta = vec2(float(xx), float(yy)) - gridPosition;
        float normalizedDistanceSquared = dot(delta, delta) * inverseSupportSquared;
        if (normalizedDistanceSquared >= 1.0) continue;
        float core = 1.0 - normalizedDistanceSquared;
        float weight = core * core * (0.56 + core * 0.44) * invWeight;
        float affineX = c.x * delta.x + c.y * delta.y;
        float affineY = c.z * delta.x + c.w * delta.y;
        total += vec3(weight, (b.x + affineX) * weight, (b.y + affineY) * weight);
      }
    }
  }
  outGrid = vec4(total, 0.0);
}`;

const DEBUG_NORMALIZE_PRESSURE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTransfer;
uniform float uSupport;
uniform float uRestDensity;
uniform float uStiffness;
uniform float uSeparation;
out vec4 outGrid;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 transfer = texelFetch(uTransfer, cell, 0);
  float mass = transfer.x;
  float velocityX = mass > 0.0 ? transfer.y / mass : 0.0;
  float velocityY = mass > 0.0 ? transfer.z / mass : 0.0;
  float restDensity = uRestDensity * max(0.62, min(1.05, 1.08 - uSupport * 0.035));
  float ratio = mass / max(0.001, restDensity);
  float pressure = max(0.0, ratio - 1.0) * uStiffness + max(0.0, ratio - 0.28) * uStiffness * uSeparation * 0.34;
  outGrid = vec4(velocityX, velocityY, pressure, mass);
}`;

const DEBUG_FORCE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uNormalized;
uniform ivec2 uGridSize;
uniform float uCell;
uniform float uDt;
uniform float uGravity;
out vec4 outGrid;

ivec2 clampCell(ivec2 cell) {
  return ivec2(clamp(cell.x, 0, uGridSize.x - 1), clamp(cell.y, 0, uGridSize.y - 1));
}

vec4 grid(ivec2 cell) {
  return texelFetch(uNormalized, clampCell(cell), 0);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 center = grid(cell);
  float velocityX = center.x;
  float velocityY = center.y;
  if (center.w > 0.000001) {
    float gradX = (grid(cell + ivec2(1, 0)).z - grid(cell + ivec2(-1, 0)).z) / max(1.0, uCell * 2.0);
    float gradY = (grid(cell + ivec2(0, 1)).z - grid(cell + ivec2(0, -1)).z) / max(1.0, uCell * 2.0);
    velocityX -= gradX * uDt * uCell * 18.0;
    velocityY += uGravity * uDt - gradY * uDt * uCell * 18.0;
  }
  outGrid = vec4(velocityX, velocityY, center.x, center.y);
}`;

const DEBUG_VISCOSITY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uForced;
uniform ivec2 uGridSize;
uniform float uViscosityBlend;
out vec4 outGrid;

ivec2 clampCell(ivec2 cell) {
  return ivec2(clamp(cell.x, 0, uGridSize.x - 1), clamp(cell.y, 0, uGridSize.y - 1));
}

vec4 grid(ivec2 cell) {
  return texelFetch(uForced, clampCell(cell), 0);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 center = grid(cell);
  float avgX = (grid(cell + ivec2(-1, 0)).x + grid(cell + ivec2(1, 0)).x + grid(cell + ivec2(0, -1)).x + grid(cell + ivec2(0, 1)).x) * 0.25;
  float avgY = (grid(cell + ivec2(-1, 0)).y + grid(cell + ivec2(1, 0)).y + grid(cell + ivec2(0, -1)).y + grid(cell + ivec2(0, 1)).y) * 0.25;
  float velocityX = center.x + (avgX - center.x) * uViscosityBlend;
  float velocityY = center.y + (avgY - center.y) * uViscosityBlend;
  outGrid = vec4(velocityX, velocityY, center.z, center.w);
}`;

const DEBUG_PARTICLE_UPDATE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uParticleA;
uniform sampler2D uParticleB;
uniform sampler2D uParticleC;
uniform sampler2D uVelocityGrid;
uniform sampler2D uMassGrid;
uniform int uParticleCount;
uniform ivec2 uParticleStateSize;
uniform ivec2 uGridSize;
uniform float uCell;
uniform float uDt;
uniform float uWidth;
uniform float uHeight;
uniform float uFlipness;
uniform int uFoamParity;
uniform int uCircleObstacleCount;
uniform int uSegmentObstacleCount;
uniform vec4 uCircleObstacles[${DEBUG_PARTICLE_UPDATE_MAX_CIRCLES}];
uniform vec4 uSegmentObstacleA[${DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS}];
uniform vec4 uSegmentObstacleB[${DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS}];
layout(location = 0) out vec4 outParticleA;
layout(location = 1) out vec4 outParticleB;
layout(location = 2) out vec4 outParticleC;

int particleIndex(ivec2 texel) {
  return texel.y * uParticleStateSize.x + texel.x;
}

ivec2 clampGridCell(ivec2 cell) {
  return ivec2(clamp(cell.x, 0, uGridSize.x - 1), clamp(cell.y, 0, uGridSize.y - 1));
}

float smoothstepCompat(float edge0, float edge1, float value) {
  if (edge0 == edge1) return value < edge0 ? 0.0 : 1.0;
  float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

vec3 sampleWeights(float t) {
  return vec3(
    0.5 * (1.5 - t) * (1.5 - t),
    0.75 - (t - 1.0) * (t - 1.0),
    0.5 * (t - 0.5) * (t - 0.5)
  );
}

vec4 sampleGrid(sampler2D source, vec2 position) {
  vec2 gridPosition = position / max(1.0, uCell);
  ivec2 base = ivec2(floor(gridPosition - vec2(0.5)));
  vec2 fraction = gridPosition - vec2(base);
  vec3 wx = sampleWeights(fraction.x);
  vec3 wy = sampleWeights(fraction.y);
  vec4 total = vec4(0.0);
  for (int offsetY = 0; offsetY < 3; offsetY += 1) {
    float weightY = offsetY == 0 ? wy.x : offsetY == 1 ? wy.y : wy.z;
    for (int offsetX = 0; offsetX < 3; offsetX += 1) {
      float weightX = offsetX == 0 ? wx.x : offsetX == 1 ? wx.y : wx.z;
      total += texelFetch(source, clampGridCell(base + ivec2(offsetX, offsetY)), 0) * weightX * weightY;
    }
  }
  return total;
}

vec2 closestOnSegment(vec2 point, vec4 segment) {
  vec2 a = segment.xy;
  vec2 delta = segment.zw - segment.xy;
  float lengthSquared = dot(delta, delta);
  float t = lengthSquared > 0.001 ? clamp(dot(point - a, delta) / lengthSquared, 0.0, 1.0) : 0.0;
  return a + delta * t;
}

void resolveObstacle(vec2 point, float obstacleRadius, inout vec2 position, inout vec2 velocity, float particleRadius) {
  vec2 delta = position - point;
  float distance = length(delta);
  float target = particleRadius + obstacleRadius;
  if (distance >= target) return;
  vec2 normal = distance > 0.001 ? delta / distance : vec2(0.0, -1.0);
  position = point + normal * target;
  float projection = dot(velocity, normal);
  if (projection < 0.0) velocity -= 1.05 * projection * normal;
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  int index = particleIndex(texel);
  vec4 a = texelFetch(uParticleA, texel, 0);
  vec4 b = texelFetch(uParticleB, texel, 0);
  vec4 c = texelFetch(uParticleC, texel, 0);
  if (index >= uParticleCount || a.w <= 0.0) {
    outParticleA = vec4(0.0);
    outParticleB = vec4(0.0);
    outParticleC = vec4(0.0);
    return;
  }
  vec4 sampled = sampleGrid(uVelocityGrid, a.xy);
  vec2 pic = sampled.xy;
  vec2 previous = sampled.zw;
  vec2 velocity = pic * (1.0 - uFlipness) + (b.xy + (pic - previous)) * uFlipness;
  vec2 position = a.xy + velocity * uDt;
  float particleRadius = max(0.5, b.z * 0.45);
  if (position.x < particleRadius) {
    position.x = particleRadius;
    velocity.x = abs(velocity.x) * 0.34;
  }
  if (position.x > uWidth - particleRadius) {
    position.x = uWidth - particleRadius;
    velocity.x = -abs(velocity.x) * 0.34;
  }
  if (position.y < particleRadius) {
    position.y = particleRadius;
    velocity.y = abs(velocity.y) * 0.34;
  }
  if (position.y > uHeight - particleRadius) {
    position.y = uHeight - particleRadius;
    velocity.y = -abs(velocity.y) * 0.34;
    velocity.x *= 0.86;
  }
  for (int circle = 0; circle < ${DEBUG_PARTICLE_UPDATE_MAX_CIRCLES}; circle += 1) {
    if (circle >= uCircleObstacleCount) break;
    vec4 obstacle = uCircleObstacles[circle];
    resolveObstacle(obstacle.xy, obstacle.z, position, velocity, b.z);
  }
  for (int segment = 0; segment < ${DEBUG_PARTICLE_UPDATE_MAX_SEGMENTS}; segment += 1) {
    if (segment >= uSegmentObstacleCount) break;
    vec4 obstacle = uSegmentObstacleA[segment];
    vec2 closest = closestOnSegment(position, obstacle);
    resolveObstacle(closest, uSegmentObstacleB[segment].x, position, velocity, b.z);
  }
  float eps = max(1.0, uCell);
  vec2 right = sampleGrid(uVelocityGrid, position + vec2(eps, 0.0)).xy;
  vec2 left = sampleGrid(uVelocityGrid, position - vec2(eps, 0.0)).xy;
  vec2 below = sampleGrid(uVelocityGrid, position + vec2(0.0, eps)).xy;
  vec2 above = sampleGrid(uVelocityGrid, position - vec2(0.0, eps)).xy;
  vec4 affine = vec4((right.x - left.x) * 0.5, (below.x - above.x) * 0.5, (right.y - left.y) * 0.5, (below.y - above.y) * 0.5);
  float foam = a.z;
  if ((index & 1) == uFoamParity) {
    float localMass = sampleGrid(uMassGrid, position).x;
    float massAbove = sampleGrid(uMassGrid, position - vec2(0.0, eps)).x;
    float massBelow = sampleGrid(uMassGrid, position + vec2(0.0, eps)).x;
    float massLeft = sampleGrid(uMassGrid, position - vec2(eps, 0.0)).x;
    float massRight = sampleGrid(uMassGrid, position + vec2(eps, 0.0)).x;
    float freeSurface = smoothstepCompat(0.08, 0.8, localMass) * smoothstepCompat(0.04, 0.75, localMass - massAbove);
    float massGradient = smoothstepCompat(0.05, 1.2, abs(massBelow - massAbove) + abs(massRight - massLeft) * 0.45);
    float turbulentSpeed = smoothstepCompat(260.0, 1250.0, sqrt(dot(velocity, velocity)));
    float shear = smoothstepCompat(0.08, 0.9, abs(affine.y) + abs(affine.z) + abs(affine.x) * 0.35 + abs(affine.w) * 0.35);
    float foamSource = freeSurface * massGradient * max(turbulentSpeed, shear * 0.72);
    foam = clamp(foam * pow(0.996, uDt * 120.0) + foamSource * 0.056, 0.0, 1.0);
  }
  outParticleA = vec4(position, foam, 1.0);
  outParticleB = vec4(velocity, b.z, b.w);
  outParticleC = affine;
}`;
