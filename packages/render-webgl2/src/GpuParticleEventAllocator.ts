import { createGpuRenderTarget, type GpuRenderTarget } from './GpuRenderTarget.js';
import type { GpuParticleState } from './GpuParticleState.js';
import { GpuSimulationPass, type GpuSimulationUniformBinder } from './GpuSimulationPass.js';
import { createShaderProgram } from './ShaderProgram.js';

const EMPTY_CLAIM = 12_582_912;
const COUNTER_PIXELS = 4;

export interface GpuParticleEventCounterSnapshot {
  readonly attempts: number;
  readonly winners: number;
  readonly admissions: number;
  readonly contentionLosses: number;
  readonly occupiedLosses: number;
  readonly capacityLosses: number;
  readonly generationLosses: number;
  readonly attemptsByTrigger: readonly [number, number, number, number];
  readonly attemptsByPriority: readonly [number, number, number];
  readonly accuracy: 'delayed' | 'estimated';
}

/** Deterministic two-stage GPU child allocator: blended claims, then state resolve. */
export class GpuParticleEventAllocator {
  private readonly claimProgram: WebGLProgram;
  private readonly claimVao: WebGLVertexArrayObject;
  private readonly resolve: GpuSimulationPass;
  private readonly claims: GpuRenderTarget;
  private readonly counterSlots: readonly CounterSlot[];
  private readonly outcomeProgram: WebGLProgram;
  private readonly outcomeVao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly outcomeUniforms = new Map<string, WebGLUniformLocation | null>();
  private latestCounters: GpuParticleEventCounterSnapshot = EMPTY_COUNTERS;
  private missedCounterSamples = 0;
  private diagnosticsEnabled = false;
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    state: GpuParticleState,
    claimVertexSource: string,
    claimFragmentSource: string,
    resolveFragmentSource: string,
    private readonly candidateLanes: number,
    label = 'GPU particle events',
  ) {
    if (!gl.getExtension('EXT_float_blend')) throw new Error('EXT_float_blend is required for deterministic GPU particle events');
    this.claimProgram = createShaderProgram(gl, { label: `${label}.claims`, vertexSource: claimVertexSource, fragmentSource: claimFragmentSource });
    const vao = gl.createVertexArray();
    if (!vao) { gl.deleteProgram(this.claimProgram); throw new Error('Unable to allocate GPU particle event vertex array'); }
    this.claimVao = vao;
    try {
      this.resolve = new GpuSimulationPass(gl, resolveFragmentSource, `${label}.resolve`);
      this.claims = createGpuRenderTarget(gl, { width: state.width, height: state.height, precision: 'float', filter: 'nearest' });
      this.counterSlots = Object.freeze(Array.from({ length: 3 }, (): CounterSlot => ({
        target: createGpuRenderTarget(gl, { width: COUNTER_PIXELS, height: 1, precision: 'float', filter: 'nearest' }),
        readback: new Float32Array(COUNTER_PIXELS * 4),
        fence: undefined,
      })));
      this.outcomeProgram = createShaderProgram(gl, { label: `${label}.counter-outcomes`, vertexSource: OUTCOME_VERTEX_SOURCE, fragmentSource: OUTCOME_FRAGMENT_SOURCE });
      this.outcomeVao = requireValue(gl.createVertexArray(), 'Unable to allocate GPU particle event counter vertex array');
    } catch (error) {
      gl.deleteVertexArray(vao); gl.deleteProgram(this.claimProgram); throw error;
    }
  }

  run(state: GpuParticleState, bind: GpuSimulationUniformBinder): void {
    this.assertUsable();
    const gl = this.gl;
    if (this.diagnosticsEnabled) this.pollCounters();
    const counterSlot = this.diagnosticsEnabled
      ? this.counterSlots.find((slot) => slot.fence === undefined)
      : undefined;
    if (this.diagnosticsEnabled && !counterSlot) this.missedCounterSamples += 1;
    if (counterSlot) this.beginCounterSample(counterSlot, state, bind);
    this.claims.clear(EMPTY_CLAIM, EMPTY_CLAIM, EMPTY_CLAIM, EMPTY_CLAIM);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.claims.framebuffer);
    gl.viewport(0, 0, state.width, state.height);
    gl.useProgram(this.claimProgram); gl.bindVertexArray(this.claimVao);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MIN); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, state.positions.read.texture); gl.uniform1i(this.uniform('uPositionState'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, state.velocities.read.texture); gl.uniform1i(this.uniform('uVelocityState'), 1);
    if (!state.metadata) throw new Error('GPU particle event allocation requires metadata state');
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, state.metadata.read.texture); gl.uniform1i(this.uniform('uMetadataState'), 2);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height); gl.uniform1i(this.uniform('uCapacity'), state.capacity);
    gl.uniform1i(this.uniform('uDiagnosticMode'), 0);
    bind(gl, (name) => this.uniform(name));
    gl.drawArrays(gl.POINTS, 0, state.capacity * this.candidateLanes);
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (counterSlot) this.finishCounterSample(counterSlot, state);
    this.resolve.run(state, (encoder, uniform) => {
      this.claims.attach(3); encoder.uniform1i(uniform('uParticleEventClaims'), 3); bind(encoder, uniform);
    });
  }

  countersSnapshot(): GpuParticleEventCounterSnapshot {
    this.assertUsable();
    this.pollCounters();
    return this.latestCounters;
  }

  setDiagnosticsEnabled(enabled: boolean): void {
    this.assertUsable();
    if (this.diagnosticsEnabled === enabled) return;
    this.diagnosticsEnabled = enabled;
    this.clearCounters();
  }

  clearCounters(): void {
    for (const slot of this.counterSlots) {
      if (slot.fence) this.gl.deleteSync(slot.fence);
      slot.fence = undefined;
      slot.readback.fill(0);
    }
    this.latestCounters = EMPTY_COUNTERS;
    this.missedCounterSamples = 0;
  }

  /** Synchronous full claim snapshot for development diagnostics only. */
  debugReadback(): Float32Array {
    this.assertUsable();
    const output = new Float32Array(this.claims.width * this.claims.height * 4);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.claims.framebuffer);
    this.gl.readPixels(0, 0, this.claims.width, this.claims.height, this.gl.RGBA, this.gl.FLOAT, output);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return output;
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const slot of this.counterSlots) { if (slot.fence) this.gl.deleteSync(slot.fence); slot.fence = undefined; slot.target.dispose(); }
    this.claims.dispose(); this.resolve.dispose();this.gl.deleteVertexArray(this.outcomeVao);this.gl.deleteProgram(this.outcomeProgram); this.gl.deleteVertexArray(this.claimVao); this.gl.deleteProgram(this.claimProgram); this.uniforms.clear();this.outcomeUniforms.clear();
  }

  private beginCounterSample(slot: CounterSlot, state: GpuParticleState, bind: GpuSimulationUniformBinder): void {
    const gl = this.gl;
    slot.target.clear(0, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.target.framebuffer);gl.viewport(0, 0, COUNTER_PIXELS, 1);gl.useProgram(this.claimProgram);gl.bindVertexArray(this.claimVao);
    gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D, state.positions.read.texture);gl.uniform1i(this.uniform('uPositionState'), 0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D, state.velocities.read.texture);gl.uniform1i(this.uniform('uVelocityState'), 1);
    if (!state.metadata) throw new Error('GPU particle event counters require metadata state');
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D, state.metadata.read.texture);gl.uniform1i(this.uniform('uMetadataState'), 2);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height);gl.uniform1i(this.uniform('uCapacity'), state.capacity);gl.uniform1i(this.uniform('uDiagnosticMode'), 1);
    bind(gl, (name) => this.uniform(name));gl.drawArrays(gl.POINTS, 0, state.capacity * this.candidateLanes * 4);
    gl.disable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private finishCounterSample(slot: CounterSlot, state: GpuParticleState): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.target.framebuffer);gl.viewport(0, 0, COUNTER_PIXELS, 1);gl.useProgram(this.outcomeProgram);gl.bindVertexArray(this.outcomeVao);
    gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D, state.positions.read.texture);gl.uniform1i(this.outcomeUniform('uPositionState'), 0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D, this.claims.texture);gl.uniform1i(this.outcomeUniform('uClaims'), 1);
    gl.uniform2i(this.outcomeUniform('uStateSize'), state.width, state.height);gl.uniform1i(this.outcomeUniform('uCapacity'), state.capacity);gl.uniform1f(this.outcomeUniform('uEmptyClaim'), EMPTY_CLAIM);
    gl.drawArrays(gl.POINTS, 0, state.capacity * 2);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    slot.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) ?? undefined;
    if (!slot.fence) this.missedCounterSamples += 1;
    gl.flush();
  }

  private pollCounters(): void {
    for (const slot of this.counterSlots) {
      const fence = slot.fence;
      if (!fence) continue;
      const status = this.gl.clientWaitSync(fence, 0, 0);
      if (status !== this.gl.ALREADY_SIGNALED && status !== this.gl.CONDITION_SATISFIED) continue;
      this.gl.deleteSync(fence);
      slot.fence = undefined;
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, slot.target.framebuffer);
      this.gl.readPixels(0, 0, COUNTER_PIXELS, 1, this.gl.RGBA, this.gl.FLOAT, slot.readback);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.accumulateCounters(slot.readback);
    }
  }

  private accumulateCounters(values: Float32Array): void {
    this.latestCounters = accumulateGpuParticleEventCounters(
      this.latestCounters,
      values,
      this.missedCounterSamples > 0,
    );
  }

  private uniform(name: string): WebGLUniformLocation | null { if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.claimProgram, name)); return this.uniforms.get(name) ?? null; }
  private outcomeUniform(name: string): WebGLUniformLocation | null {if(!this.outcomeUniforms.has(name))this.outcomeUniforms.set(name,this.gl.getUniformLocation(this.outcomeProgram,name));return this.outcomeUniforms.get(name)??null;}
  private assertUsable(): void { if (this.disposed) throw new Error('GPU particle event allocator is disposed'); }
}

const EMPTY_COUNTERS: GpuParticleEventCounterSnapshot = Object.freeze({
  attempts: 0,
  winners: 0,
  admissions: 0,
  contentionLosses: 0,
  occupiedLosses: 0,
  capacityLosses: 0,
  generationLosses: 0,
  attemptsByTrigger: Object.freeze([0, 0, 0, 0] as const),
  attemptsByPriority: Object.freeze([0, 0, 0] as const),
  accuracy: 'estimated',
});

interface CounterSlot {
  readonly target: GpuRenderTarget;
  readonly readback: Float32Array;
  fence: WebGLSync | undefined;
}

/** Reduces one asynchronously-read 4x1 counter texture into cumulative diagnostics. */
export function accumulateGpuParticleEventCounters(
  previous: GpuParticleEventCounterSnapshot,
  values: ArrayLike<number>,
  missedSample: boolean,
): GpuParticleEventCounterSnapshot {
  const sampleAttempts = rounded(values[0]);
  const sampleWinners = rounded(values[1]);
  const sampleCapacityLosses = rounded(values[5]);
  const sampleGenerationLosses = rounded(values[6]);
  return Object.freeze({
    attempts: previous.attempts + sampleAttempts,
    winners: previous.winners + sampleWinners,
    admissions: previous.admissions + rounded(values[2]),
    contentionLosses: previous.contentionLosses
      + Math.max(0, sampleAttempts - sampleCapacityLosses - sampleGenerationLosses - sampleWinners),
    occupiedLosses: previous.occupiedLosses + rounded(values[4]),
    capacityLosses: previous.capacityLosses + sampleCapacityLosses,
    generationLosses: previous.generationLosses + sampleGenerationLosses,
    attemptsByTrigger: Object.freeze([
      previous.attemptsByTrigger[0] + rounded(values[8]),
      previous.attemptsByTrigger[1] + rounded(values[9]),
      previous.attemptsByTrigger[2] + rounded(values[10]),
      previous.attemptsByTrigger[3] + rounded(values[11]),
    ] as const),
    attemptsByPriority: Object.freeze([
      previous.attemptsByPriority[0] + rounded(values[12]),
      previous.attemptsByPriority[1] + rounded(values[13]),
      previous.attemptsByPriority[2] + rounded(values[14]),
    ] as const),
    accuracy: missedSample || previous.accuracy === 'estimated' && previous.attempts > 0
      ? 'estimated'
      : 'delayed',
  });
}

function rounded(value: number | undefined): number {
  return Math.max(0, Math.round(value ?? 0));
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const OUTCOME_VERTEX_SOURCE=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uPositionState;uniform sampler2D uClaims;uniform ivec2 uStateSize;uniform int uCapacity;uniform float uEmptyClaim;flat out vec4 vDiagnostic;
void main(){int target=gl_VertexID/2,metric=gl_VertexID-target*2;if(target>=uCapacity){gl_Position=vec4(2.0);return;}ivec2 uv=ivec2(target%uStateSize.x,target/uStateSize.x);vec4 claim=texelFetch(uClaims,uv,0),state=texelFetch(uPositionState,uv,0);float winner=claim.x<uEmptyClaim-.5?1.0:0.0,occupied=state.z<state.w?1.0:0.0,dropNew=abs(claim.y-1.0)<.25?1.0:0.0,occupiedLoss=winner*occupied*dropNew,admitted=winner*(1.0-occupied*dropNew);vDiagnostic=metric==0?vec4(0.0,winner,admitted,0.0):vec4(occupiedLoss,0.0,0.0,0.0);float pixel=float(metric);gl_Position=vec4((pixel+.5)/4.0*2.0-1.0,0.0,0.0,1.0);gl_PointSize=1.0;}`;
const OUTCOME_FRAGMENT_SOURCE=`#version 300 es
precision highp float;flat in vec4 vDiagnostic;out vec4 outColor;void main(){outColor=vDiagnostic;}`;
