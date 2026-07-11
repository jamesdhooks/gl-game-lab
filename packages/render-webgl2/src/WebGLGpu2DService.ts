import type {
  Gpu2DService,
  GpuFieldSystem2D,
  GpuFieldSystem2DOptions,
  GpuParticleSeed2D,
  GpuParticleSystem2D,
  GpuParticleSystem2DOptions,
  GpuRenderTarget2D,
  GpuTexture2D,
  GpuUniforms2D,
  GpuUniformBinder2D,
  GpuUniformEncoder2D,
  GpuUniformLocation2D,
} from '@hooksjam/gl-game-lab-engine';
import { GpuFieldPass } from './GpuFieldPass.js';
import { GpuFieldState } from './GpuFieldState.js';
import { GpuParticleRenderer } from './GpuParticleRenderer.js';
import { GpuParticleState } from './GpuParticleState.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { GpuSimulationPass } from './GpuSimulationPass.js';
import type { GpuFrameRenderPass, GpuRenderPassQueue } from './GpuRenderPassQueue.js';
import type { RestorableResourceOwner } from './RestorableResourceOwner.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { TrailFeedbackRenderer } from './TrailFeedbackRenderer.js';

interface FieldBundle {
  readonly state: GpuFieldState;
  readonly passes: ReadonlyMap<string, GpuFieldPass>;
}

interface ParticleBundle {
  readonly state: GpuParticleState;
  readonly stepper: GpuSimulationPass;
  readonly points: GpuParticleRenderer;
  readonly trails: TrailFeedbackRenderer | undefined;
}

class WebGLGpuRenderTarget implements GpuRenderTarget2D {
  constructor(readonly native: GpuParticleRenderDestination) {}
  get width(): number { return this.native.width; }
  get height(): number { return this.native.height; }
}

export class WebGLGpuTexture2D implements GpuTexture2D {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly native: () => WebGLTexture,
  ) {}
}

class WebGLGpuFieldSystem implements GpuFieldSystem2D {
  private readonly owner: RestorableResourceOwner<FieldBundle>;
  private disposed = false;
  private currentGeneration = 0;

  constructor(
    device: WebGL2Device,
    id: string,
    options: GpuFieldSystem2DOptions,
    private readonly onDispose: () => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 50,
      create: () => createBundle(device.gl, options),
      dispose: disposeBundle,
      restored: () => { this.currentGeneration += 1; },
    });
  }

  get width(): number { return this.owner.value.state.width; }
  get height(): number { return this.owner.value.state.height; }
  get generation(): number { return this.currentGeneration; }
  clear(): void { this.owner.value.state.clear(); }
  step(passId: string, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    requirePass(bundle, passId).step(bundle.state, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
  }
  render(passId: string, target: GpuRenderTarget2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    if (!(target instanceof WebGLGpuRenderTarget)) throw new Error('GPU target belongs to another backend');
    const bundle = this.owner.value;
    requirePass(bundle, passId).render(bundle.state, target.native, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.onDispose();
  }
}

class WebGLGpuParticleSystem implements GpuParticleSystem2D {
  private readonly owner: RestorableResourceOwner<ParticleBundle>;
  private disposed = false;
  private currentGeneration = 0;
  private retainedSeed: GpuParticleSeed2D | undefined;

  constructor(
    device: WebGL2Device,
    id: string,
    options: GpuParticleSystem2DOptions,
    private readonly onDispose: () => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 50,
      create: () => createParticleBundle(device.gl, options),
      dispose: disposeParticleBundle,
      restored: (bundle) => {
        if (this.retainedSeed) bundle.state.uploadSeed(this.retainedSeed);
        this.currentGeneration += 1;
      },
    });
  }

  get capacity(): number { return this.owner.value.state.capacity; }
  get width(): number { return this.owner.value.state.width; }
  get height(): number { return this.owner.value.state.height; }
  get generation(): number { return this.currentGeneration; }
  clear(): void {
    this.retainedSeed = undefined;
    this.owner.value.state.clear();
  }
  uploadSeed(seed: GpuParticleSeed2D): void {
    this.retainedSeed = {
      ...(seed.positions ? { positions: seed.positions.slice() } : {}),
      ...(seed.velocities ? { velocities: seed.velocities.slice() } : {}),
    };
    this.owner.value.state.uploadSeed(this.retainedSeed);
  }
  step(uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const bundle = this.owner.value;
    bundle.stepper.run(bundle.state, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
  }
  render(target: GpuRenderTarget2D, uniforms: GpuUniforms2D | GpuUniformBinder2D = {}): void {
    const native = requireTarget(target);
    const bundle = this.owner.value;
    bundle.points.render(bundle.state, native, (gl, uniform) => { applyBindings(gl, uniform, uniforms); });
  }
  beginTrails(width: number, height: number, fade: number): GpuRenderTarget2D {
    const trails = requireTrails(this.owner.value);
    return new WebGLGpuRenderTarget(trails.beginFrame(width, height, fade));
  }
  compositeTrails(target: GpuRenderTarget2D, background: readonly [number, number, number], bloom: number): void {
    requireTrails(this.owner.value).composite(requireTarget(target), background, bloom);
  }
  clearTrails(): void { this.owner.value.trails?.clear(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.retainedSeed = undefined;
    this.onDispose();
  }
}

export class WebGLGpu2DService implements Gpu2DService {
  private readonly fields = new Set<WebGLGpuFieldSystem>();
  private readonly particles = new Set<WebGLGpuParticleSystem>();
  private fieldId = 0;
  private particleId = 0;

  constructor(private readonly device: WebGL2Device, private readonly queue: GpuRenderPassQueue) {}

  createFieldSystem(id: string, options: GpuFieldSystem2DOptions): GpuFieldSystem2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('GPU field system id cannot be empty');
    let field: WebGLGpuFieldSystem | undefined;
    field = new WebGLGpuFieldSystem(
      this.device,
      `gl-game-lab.render-webgl2.field.${this.fieldId}.${normalized}`,
      options,
      () => { if (field) this.fields.delete(field); },
    );
    this.fieldId += 1;
    this.fields.add(field);
    return field;
  }

  createParticleSystem(id: string, options: GpuParticleSystem2DOptions): GpuParticleSystem2D {
    const normalized = id.trim();
    if (normalized.length === 0) throw new Error('GPU particle system id cannot be empty');
    let particles: WebGLGpuParticleSystem | undefined;
    particles = new WebGLGpuParticleSystem(
      this.device,
      `gl-game-lab.render-webgl2.particles.${this.particleId}.${normalized}`,
      options,
      () => { if (particles) this.particles.delete(particles); },
    );
    this.particleId += 1;
    this.particles.add(particles);
    return particles;
  }

  submit(id: string, execute: (target: GpuRenderTarget2D) => void): void {
    const pass: GpuFrameRenderPass = {
      id,
      execute: (destination) => { execute(new WebGLGpuRenderTarget(destination)); },
    };
    this.queue.submit(pass);
  }

  destroy(): void {
    for (const particles of [...this.particles]) particles.dispose();
    this.particles.clear();
    for (const field of [...this.fields]) field.dispose();
    this.fields.clear();
  }
}

function createParticleBundle(gl: WebGL2RenderingContext, options: GpuParticleSystem2DOptions): ParticleBundle {
  const disposers: Array<() => void> = [];
  try {
    const state = new GpuParticleState(gl, options); disposers.push(() => { state.dispose(); });
    const stepper = new GpuSimulationPass(gl, options.simulationFragmentSource); disposers.push(() => { stepper.dispose(); });
    const points = new GpuParticleRenderer(gl, {
      vertexSource: options.particleVertexSource,
      fragmentSource: options.particleFragmentSource,
      ...(options.blend ? { blend: options.blend } : {}),
    }); disposers.push(() => { points.dispose(); });
    const trails = options.trails ? new TrailFeedbackRenderer(gl) : undefined;
    if (trails) disposers.push(() => { trails.dispose(); });
    return { state, stepper, points, trails };
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
}

function disposeParticleBundle(bundle: ParticleBundle): void {
  bundle.trails?.dispose();
  bundle.points.dispose();
  bundle.stepper.dispose();
  bundle.state.dispose();
}

function requireTarget(target: GpuRenderTarget2D): GpuParticleRenderDestination {
  if (!(target instanceof WebGLGpuRenderTarget)) throw new Error('GPU target belongs to another backend');
  return target.native;
}

function requireTrails(bundle: ParticleBundle): TrailFeedbackRenderer {
  if (!bundle.trails) throw new Error('GPU particle system was created without trails');
  return bundle.trails;
}

function createBundle(gl: WebGL2RenderingContext, options: GpuFieldSystem2DOptions): FieldBundle {
  const state = new GpuFieldState(gl, options);
  const passes = new Map<string, GpuFieldPass>();
  try {
    for (const [id, source] of Object.entries(options.passes)) {
      if (id.trim().length === 0) throw new Error('GPU field pass id cannot be empty');
      passes.set(id, new GpuFieldPass(gl, source));
    }
    if (passes.size === 0) throw new Error('GPU field system requires at least one pass');
    return { state, passes };
  } catch (error) {
    for (const pass of passes.values()) pass.dispose();
    state.dispose();
    throw error;
  }
}

function disposeBundle(bundle: FieldBundle): void {
  for (const pass of bundle.passes.values()) pass.dispose();
  bundle.state.dispose();
}

function requirePass(bundle: FieldBundle, id: string): GpuFieldPass {
  const pass = bundle.passes.get(id);
  if (!pass) throw new Error(`Unknown GPU field pass: ${id}`);
  return pass;
}

function applyUniforms(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  uniforms: GpuUniforms2D,
): void {
  for (const [name, value] of Object.entries(uniforms)) {
    const location = uniform(name);
    if (value.type === '1f') gl.uniform1f(location, value.value);
    else if (value.type === '1i') gl.uniform1i(location, value.value);
    else if (value.type === '2f') gl.uniform2f(location, value.value[0], value.value[1]);
    else if (value.type === '3fv') gl.uniform3fv(location, value.value);
    else gl.uniform4fv(location, value.value);
  }
}

function applyBindings(
  gl: WebGL2RenderingContext,
  uniform: (name: string) => WebGLUniformLocation | null,
  bindings: GpuUniforms2D | GpuUniformBinder2D,
): void {
  if (typeof bindings !== 'function') { applyUniforms(gl, uniform, bindings); return; }
  const encoder: GpuUniformEncoder2D = {
    uniform1f: (location, value) => { gl.uniform1f(nativeLocation(location, uniform), value); },
    uniform1i: (location, value) => { gl.uniform1i(nativeLocation(location, uniform), value); },
    uniform2f: (location, x, y) => { gl.uniform2f(nativeLocation(location, uniform), x, y); },
    uniform3fv: (location, value) => { gl.uniform3fv(nativeLocation(location, uniform), value); },
    uniform4fv: (location, value) => { gl.uniform4fv(nativeLocation(location, uniform), value); },
    uniformTexture: (location, texture, unit) => {
      if (!(texture instanceof WebGLGpuTexture2D)) throw new Error('GPU texture belongs to another backend');
      if (!Number.isSafeInteger(unit) || unit < 2 || unit > 31) throw new Error('GPU texture unit must be an integer between 2 and 31');
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture.native());
      gl.uniform1i(nativeLocation(location, uniform), unit);
    },
  };
  bindings(encoder, (name) => Object.freeze({ name }));
}

function nativeLocation(location: GpuUniformLocation2D, uniform: (name: string) => WebGLUniformLocation | null): WebGLUniformLocation | null {
  return uniform(location.name);
}
