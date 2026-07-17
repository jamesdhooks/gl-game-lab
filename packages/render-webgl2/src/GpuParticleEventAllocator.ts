import { createGpuRenderTarget, type GpuRenderTarget } from './GpuRenderTarget.js';
import type { GpuParticleState } from './GpuParticleState.js';
import { GpuSimulationPass, type GpuSimulationUniformBinder } from './GpuSimulationPass.js';
import { createShaderProgram } from './ShaderProgram.js';

const EMPTY_CLAIM = 12_582_912;

/** Deterministic two-stage GPU child allocator: blended claims, then state resolve. */
export class GpuParticleEventAllocator {
  private readonly claimProgram: WebGLProgram;
  private readonly claimVao: WebGLVertexArrayObject;
  private readonly resolve: GpuSimulationPass;
  private readonly claims: GpuRenderTarget;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
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
    } catch (error) {
      gl.deleteVertexArray(vao); gl.deleteProgram(this.claimProgram); throw error;
    }
  }

  run(state: GpuParticleState, bind: GpuSimulationUniformBinder): void {
    this.assertUsable();
    const gl = this.gl;
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
    bind(gl, (name) => this.uniform(name));
    gl.drawArrays(gl.POINTS, 0, state.capacity * this.candidateLanes);
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resolve.run(state, (encoder, uniform) => {
      this.claims.attach(3); encoder.uniform1i(uniform('uParticleEventClaims'), 3); bind(encoder, uniform);
    });
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
    this.claims.dispose(); this.resolve.dispose(); this.gl.deleteVertexArray(this.claimVao); this.gl.deleteProgram(this.claimProgram); this.uniforms.clear();
  }

  private uniform(name: string): WebGLUniformLocation | null { if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.claimProgram, name)); return this.uniforms.get(name) ?? null; }
  private assertUsable(): void { if (this.disposed) throw new Error('GPU particle event allocator is disposed'); }
}
