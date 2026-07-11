import type { BlendMode } from './SpriteRenderer.js';
import type { GpuParticleState } from './GpuParticleState.js';
import type { GpuUniformLookup } from './GpuSimulationPass.js';

export interface GpuParticleRenderDestination {
  readonly framebuffer?: WebGLFramebuffer | null;
  readonly width: number;
  readonly height: number;
}

export type GpuParticleUniformBinder = (gl: WebGL2RenderingContext, uniform: GpuUniformLookup) => void;

export interface GpuParticleRendererOptions {
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly blend?: BlendMode;
}

export class GpuParticleRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly blend: BlendMode;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, options: GpuParticleRendererOptions) {
    this.program = createProgram(gl, options.vertexSource, options.fragmentSource);
    this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate GPU particle vertex array');
    this.blend = options.blend ?? 'additive';
  }

  render(state: GpuParticleState, destination: GpuParticleRenderDestination, bind: GpuParticleUniformBinder): void {
    this.assertUsable();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    configureBlend(gl, this.blend);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.positions.read.texture);
    gl.uniform1i(this.uniform('uPositionState'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.velocities.read.texture);
    gl.uniform1i(this.uniform('uVelocityState'), 1);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height);
    gl.uniform1i(this.uniform('uParticleCapacity'), state.capacity);
    bind(gl, (name) => this.uniform(name));
    gl.drawArrays(gl.POINTS, 0, state.capacity);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private assertUsable(): void { if (this.disposed) throw new Error('GPU particle renderer has been disposed'); }
}

function configureBlend(gl: WebGL2RenderingContext, mode: BlendMode): void {
  if (mode === 'opaque') { gl.disable(gl.BLEND); return; }
  gl.enable(gl.BLEND);
  if (mode === 'additive') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else if (mode === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireValue(gl.createProgram(), 'Unable to create GPU particle program');
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`GPU particle shader link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireValue(gl.createShader(type), 'Unable to create GPU particle shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`GPU particle shader compilation failed: ${detail}`);
  }
  return shader;
}

function requireValue<T>(value: T | null, message: string): T { if (value === null) throw new Error(message); return value; }
