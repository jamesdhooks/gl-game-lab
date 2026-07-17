import type { CompiledParticleProgram2D, GpuRenderTarget2D, ParticleRenderTier2D } from '@hooksjam/gl-game-lab-engine';
import {
  WebGpuParticleEffectRuntimeBackend2D,
  type ParticleWebGpuBindGroup2D,
  type ParticleWebGpuDevice2D,
  type ParticleWebGpuRenderPipeline2D,
  type ParticleWebGpuSampler2D,
  type ParticleWebGpuShaderModule2D,
  type ParticleWebGpuTexture2D,
  type ParticleWebGpuTextureView2D,
  type WebGpuParticleEffectRender2D,
  type WebGpuParticleEffectRenderBindings2D,
} from './WebGpuParticleEffectRuntime2D.js';

const TEXTURE_BINDING = 0x04;
const RENDER_ATTACHMENT = 0x10;
const TRANSPARENT = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

export interface ParticleWebGpuCanvasContext2D {
  configure(options: Readonly<{ device: ParticleWebGpuDevice2D; format: string; alphaMode: 'premultiplied' }>): void;
  unconfigure?(): void;
  getCurrentTexture(): ParticleWebGpuTexture2D;
}

export interface WebGpuParticleCanvasDiagnostics2D {
  readonly queuedFrames: number;
  readonly submittedFrames: number;
  readonly particleDraws: number;
  readonly trailPasses: number;
  readonly compositePasses: number;
  readonly pipelineCacheHits: number;
  readonly pipelineCacheMisses: number;
  readonly deviceLost: boolean;
}

interface RenderJob {
  readonly program: CompiledParticleProgram2D;
  readonly tier: ParticleRenderTier2D;
  readonly bindings: WebGpuParticleEffectRenderBindings2D;
}

interface ParticlePipelineSet {
  readonly points: ParticleWebGpuRenderPipeline2D;
  readonly streaks: ParticleWebGpuRenderPipeline2D;
}

interface TrailTargets {
  readonly width: number;
  readonly height: number;
  readonly textures: readonly [ParticleWebGpuTexture2D, ParticleWebGpuTexture2D];
  index: 0 | 1;
}

/** Presents GPU-resident particle state directly to a transparent WebGPU canvas. */
export class WebGpuParticleCanvasRenderer2D {
  readonly render: WebGpuParticleEffectRender2D;
  private readonly jobs: RenderJob[] = [];
  private readonly pipelines = new Map<string, ParticlePipelineSet>();
  private readonly sampler: ParticleWebGpuSampler2D;
  private readonly fullscreenModule: ParticleWebGpuShaderModule2D;
  private readonly fadePipeline: ParticleWebGpuRenderPipeline2D;
  private readonly compositePipeline: ParticleWebGpuRenderPipeline2D;
  private trails: TrailTargets | undefined;
  private flushQueued = false;
  private disposed = false;
  private lost = false;
  private queuedFrames = 0;
  private submittedFrames = 0;
  private particleDraws = 0;
  private trailPasses = 0;
  private compositePasses = 0;
  private pipelineCacheHits = 0;
  private pipelineCacheMisses = 0;

  constructor(
    private readonly device: ParticleWebGpuDevice2D,
    private readonly context: ParticleWebGpuCanvasContext2D,
    private readonly format: string,
    private readonly canvas: HTMLCanvasElement,
  ) {
    context.configure({ device, format, alphaMode: 'premultiplied' });
    canvas.style.visibility = 'visible';
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.fullscreenModule = device.createShaderModule({ label: 'particle-canvas.feedback', code: FULLSCREEN_SHADER });
    this.fadePipeline = this.createFullscreenPipeline('fadeFragment', 'particle-canvas.fade');
    this.compositePipeline = this.createFullscreenPipeline('compositeFragment', 'particle-canvas.composite');
    this.render = (program, _state, target, tier, bindings) => {
      this.enqueue(program, target, tier, bindings);
    };
  }

  diagnostics(): WebGpuParticleCanvasDiagnostics2D {
    return Object.freeze({
      queuedFrames: this.queuedFrames,
      submittedFrames: this.submittedFrames,
      particleDraws: this.particleDraws,
      trailPasses: this.trailPasses,
      compositePasses: this.compositePasses,
      pipelineCacheHits: this.pipelineCacheHits,
      pipelineCacheMisses: this.pipelineCacheMisses,
      deviceLost: this.lost,
    });
  }

  markDeviceLost(): void {
    if (this.lost) return;
    this.lost = true;
    this.jobs.length = 0;
    this.canvas.style.visibility = 'hidden';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.jobs.length = 0;
    this.destroyTrails();
    this.pipelines.clear();
    this.context.unconfigure?.();
    this.canvas.style.visibility = 'hidden';
  }

  private enqueue(
    program: CompiledParticleProgram2D,
    target: GpuRenderTarget2D,
    tier: ParticleRenderTier2D,
    bindings: WebGpuParticleEffectRenderBindings2D,
  ): void {
    this.assertUsable();
    const width = Math.max(1, Math.round(target.width));
    const height = Math.max(1, Math.round(target.height));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.jobs.push({ program, tier, bindings });
    if (this.flushQueued) return;
    this.flushQueued = true;
    this.queuedFrames += 1;
    queueMicrotask(() => {
      this.flushQueued = false;
      if (!this.disposed && !this.lost) this.flush();
    });
  }

  private flush(): void {
    if (this.jobs.length === 0) return;
    const jobs = this.jobs.splice(0);
    const encoder = this.device.createCommandEncoder({ label: 'particle-canvas.frame' });
    const canvasView = this.context.getCurrentTexture().createView();
    const usesTrails = jobs.some((job) => job.tier === 'ultra' && job.program.renderPasses.ultra.some((pass) => pass.kind === 'trails'));
    if (usesTrails) {
      const trails = this.ensureTrails(this.canvas.width, this.canvas.height);
      const previous = trails.textures[trails.index].createView();
      const nextIndex = (1 - trails.index) as 0 | 1;
      const next = trails.textures[nextIndex].createView();
      const feedbackConfig = jobs[0]!.bindings.renderConfig;
      this.drawFullscreen(encoder, this.fadePipeline, previous, next, feedbackConfig, true);
      this.trailPasses += 1;
      let load = true;
      for (const job of jobs) {
        this.drawParticles(encoder, job, next, load);
        load = true;
      }
      this.drawFullscreen(encoder, this.compositePipeline, next, canvasView, feedbackConfig, true);
      this.compositePasses += 1;
      trails.index = nextIndex;
    } else {
      let load = false;
      for (const job of jobs) {
        this.drawParticles(encoder, job, canvasView, load);
        load = true;
      }
    }
    this.device.queue.submit([encoder.finish()]);
    this.submittedFrames += 1;
  }

  private drawParticles(
    encoder: ReturnType<ParticleWebGpuDevice2D['createCommandEncoder']>,
    job: RenderJob,
    view: ParticleWebGpuTextureView2D,
    load: boolean,
  ): void {
    const set = this.pipelineSet(job.program);
    const createBindings = (pipeline: ParticleWebGpuRenderPipeline2D): ParticleWebGpuBindGroup2D => this.device.createBindGroup({
      label: `${job.program.effect.source.id}.render-bindings`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        ...job.bindings.state,
        job.bindings.archetypeSize,
        job.bindings.archetypeLength,
        job.bindings.archetypeAlpha,
        job.bindings.archetypeIntensity,
        job.bindings.palette,
        job.bindings.renderConfig,
      ].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const bindExtensions = (pass: import('./WebGpuParticleEffectRuntime2D.js').ParticleWebGpuRenderPass2D, pipeline: ParticleWebGpuRenderPipeline2D): void => {
      if (!job.bindings.extensionEntries || job.bindings.extensionEntries.length === 0) return;
      pass.setBindGroup(1, this.device.createBindGroup({
        label: `${job.program.effect.source.id}.render-extension-bindings`,
        layout: pipeline.getBindGroupLayout(1),
        entries: job.bindings.extensionEntries,
      }));
    };
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: TRANSPARENT, loadOp: load ? 'load' : 'clear', storeOp: 'store' }],
    });
    const recipe = job.program.renderPasses[job.tier];
    if (recipe.some((entry) => entry.kind === 'streaks')) {
      pass.setPipeline(set.streaks);
      pass.setBindGroup(0, createBindings(set.streaks));
      bindExtensions(pass, set.streaks);
      pass.drawIndirect(job.bindings.indirectDraw, 0);
      this.particleDraws += 1;
    }
    if (recipe.some((entry) => entry.kind === 'points')) {
      pass.setPipeline(set.points);
      pass.setBindGroup(0, createBindings(set.points));
      bindExtensions(pass, set.points);
      pass.drawIndirect(job.bindings.indirectDraw, 0);
      this.particleDraws += 1;
    }
    pass.end();
  }

  private drawFullscreen(
    encoder: ReturnType<ParticleWebGpuDevice2D['createCommandEncoder']>,
    pipeline: ParticleWebGpuRenderPipeline2D,
    source: ParticleWebGpuTextureView2D,
    target: ParticleWebGpuTextureView2D,
    renderConfig: import('./WebGpuParticleEffectRuntime2D.js').ParticleWebGpuBuffer2D,
    clear: boolean,
  ): void {
    const group: ParticleWebGpuBindGroup2D = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: source },
        { binding: 2, resource: { buffer: renderConfig } },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, clearValue: TRANSPARENT, loadOp: clear ? 'clear' : 'load', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  private pipelineSet(program: CompiledParticleProgram2D): ParticlePipelineSet {
    const key = `${program.effect.graphHash}:${program.webgpu.render.hash}`;
    const cached = this.pipelines.get(key);
    if (cached) {
      this.pipelineCacheHits += 1;
      return cached;
    }
    this.pipelineCacheMisses += 1;
    const module = this.device.createShaderModule({ label: `${program.effect.source.id}.render`, code: program.webgpu.render.source });
    const points = this.createParticlePipeline(module, program.webgpu.render.entryPoint, `${program.effect.source.id}.points`);
    const streaks = this.createParticlePipeline(module, 'particleStreakVertex', `${program.effect.source.id}.streaks`);
    const set = Object.freeze({ points, streaks });
    this.pipelines.set(key, set);
    return set;
  }

  private createParticlePipeline(module: unknown, entryPoint: string, label: string): ParticleWebGpuRenderPipeline2D {
    return this.device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: { module, entryPoint },
      fragment: {
        module,
        entryPoint: 'particleFragment',
        targets: [{ format: this.format, blend: ADDITIVE_BLEND }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createFullscreenPipeline(entryPoint: string, label: string): ParticleWebGpuRenderPipeline2D {
    return this.device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: { module: this.fullscreenModule, entryPoint: 'fullscreenVertex' },
      fragment: { module: this.fullscreenModule, entryPoint, targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private ensureTrails(width: number, height: number): TrailTargets {
    if (this.trails?.width === width && this.trails.height === height) return this.trails;
    this.destroyTrails();
    const create = (suffix: string): ParticleWebGpuTexture2D => this.device.createTexture({
      label: `particle-canvas.trails-${suffix}`,
      size: [width, height, 1],
      format: this.format,
      usage: TEXTURE_BINDING | RENDER_ATTACHMENT,
    });
    this.trails = { width, height, textures: [create('a'), create('b')], index: 0 };
    return this.trails;
  }

  private destroyTrails(): void {
    this.trails?.textures.forEach((texture) => { texture.destroy(); });
    this.trails = undefined;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('WebGPU particle canvas renderer is disposed');
    if (this.lost) throw new Error('WebGPU particle device was lost');
  }
}

export interface WebGpuParticleCanvasSession2D {
  readonly backend: WebGpuParticleEffectRuntimeBackend2D;
  readonly renderer: WebGpuParticleCanvasRenderer2D;
  readonly adapterDescription: string;
  readonly lost: Promise<string>;
  dispose(): void;
}

export interface WebGpuParticleCanvasSessionOptions2D {
  readonly powerPreference?: 'low-power' | 'high-performance';
}

interface BrowserGpu2D {
  requestAdapter(options?: Readonly<{ powerPreference?: 'low-power' | 'high-performance' }>): Promise<BrowserGpuAdapter2D | null>;
  getPreferredCanvasFormat(): string;
}
interface BrowserGpuAdapter2D {
  readonly info?: Readonly<{ description?: string; vendor?: string; architecture?: string }>;
  requestDevice(): Promise<ParticleWebGpuDevice2D & {
    readonly lost?: Promise<Readonly<{ message?: string }>>;
    addEventListener?(type: 'uncapturederror', listener: (event: Readonly<{ error?: Readonly<{ message?: string }> }>) => void): void;
    removeEventListener?(type: 'uncapturederror', listener: (event: Readonly<{ error?: Readonly<{ message?: string }> }>) => void): void;
    destroy?(): void;
  }>;
}

/** Creates the development WebGPU presentation session; returns undefined when unavailable. */
export async function createWebGpuParticleCanvasSession2D(
  canvas: HTMLCanvasElement,
  options: WebGpuParticleCanvasSessionOptions2D = {},
): Promise<WebGpuParticleCanvasSession2D | undefined> {
  const gpu = (globalThis.navigator as Navigator & { readonly gpu?: BrowserGpu2D }).gpu;
  if (!gpu) return undefined;
  const adapter = await gpu.requestAdapter(options);
  if (!adapter) return undefined;
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as unknown as ParticleWebGpuCanvasContext2D | null;
  if (!context) {
    device.destroy?.();
    return undefined;
  }
  const renderer = new WebGpuParticleCanvasRenderer2D(device, context, gpu.getPreferredCanvasFormat(), canvas);
  const backend = new WebGpuParticleEffectRuntimeBackend2D(device, { render: renderer.render });
  let disposed = false;
  const onUncapturedError = (event: Readonly<{ error?: Readonly<{ message?: string }> }>): void => {
    const message = event.error?.message ?? 'WebGPU validation failed';
    backend.invalidate(new Error(message));
    renderer.markDeviceLost();
  };
  device.addEventListener?.('uncapturederror', onUncapturedError);
  const lost = (device.lost ?? new Promise<Readonly<{ message?: string }>>(() => undefined)).then((info) => {
    const message = info.message ?? 'WebGPU device lost';
    backend.invalidate(new Error(message));
    if (!disposed) renderer.markDeviceLost();
    return message;
  });
  const description = adapter.info?.description || adapter.info?.vendor || adapter.info?.architecture || 'WebGPU adapter';
  return Object.freeze({
    backend,
    renderer,
    adapterDescription: description,
    lost,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      device.removeEventListener?.('uncapturederror', onUncapturedError);
      renderer.dispose();
      device.destroy?.();
    },
  });
}

const ADDITIVE_BLEND = Object.freeze({
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
});

const FULLSCREEN_SHADER = `
struct VertexOut { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> }
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> renderConfig: array<vec4<f32>>;
@vertex fn fullscreenVertex(@builtin(vertex_index) index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
  var out: VertexOut; let position=positions[index]; out.position=vec4(position,0.0,1.0); out.uv=position*vec2(0.5,-0.5)+vec2(0.5,0.5); return out;
}
@fragment fn fadeFragment(input: VertexOut) -> @location(0) vec4<f32> {
  let persistence=clamp(renderConfig[2].z,0.0,0.9995); return textureSample(sourceTexture,sourceSampler,input.uv)*persistence;
}
@fragment fn compositeFragment(input: VertexOut) -> @location(0) vec4<f32> {
  let color=textureSample(sourceTexture,sourceSampler,input.uv); let bloom=max(0.0,renderConfig[2].w); return vec4(color.rgb*(1.0+bloom*0.18),color.a);
}`;
