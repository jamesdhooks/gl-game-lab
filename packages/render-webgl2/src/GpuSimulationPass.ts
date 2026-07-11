import type { GpuParticleState } from './GpuParticleState.js';

export type GpuUniformLookup = (name: string) => WebGLUniformLocation | null;
export type GpuSimulationUniformBinder = (gl: WebGL2RenderingContext, uniform: GpuUniformLookup) => void;

export class GpuSimulationPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, fragmentSource: string) {
    this.program = createProgram(gl, VERTEX_SHADER, fragmentSource);
    this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate GPU simulation vertex array');
  }

  run(state: GpuParticleState, bind: GpuSimulationUniformBinder): void {
    this.assertUsable();
    const gl = this.gl;
    state.bindWriteFramebuffer();
    gl.viewport(0, 0, state.width, state.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.positions.read.texture);
    gl.uniform1i(this.uniform('uPositionState'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.velocities.read.texture);
    gl.uniform1i(this.uniform('uVelocityState'), 1);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height);
    bind(gl, (name) => this.uniform(name));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    state.swap();
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

  private assertUsable(): void { if (this.disposed) throw new Error('GPU simulation pass has been disposed'); }
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireValue(gl.createProgram(), 'Unable to create GPU simulation program');
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`GPU simulation shader link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
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
  const shader = requireValue(gl.createShader(type), 'Unable to create GPU simulation shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`GPU simulation shader compilation failed: ${detail}`);
  }
  return shader;
}

function requireValue<T>(value: T | null, message: string): T { if (value === null) throw new Error(message); return value; }

const VERTEX_SHADER = `#version 300 es
const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
