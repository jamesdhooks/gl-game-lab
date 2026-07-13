import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import type { GpuUniformLookup } from './GpuSimulationPass.js';
import type { GpuFieldState } from './GpuFieldState.js';
import { createShaderProgram } from './ShaderProgram.js';
export type GpuFieldUniformBinder = (gl: WebGL2RenderingContext, uniform: GpuUniformLookup) => void;
export class GpuFieldPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext, fragmentSource: string, label = 'GPU field pass') {
    this.program = createShaderProgram(gl, { label, vertexSource: VERTEX_SHADER, fragmentSource });
    this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate GPU field vertex array');
  }
  step(state: GpuFieldState, bind: GpuFieldUniformBinder = () => undefined): void {
    this.draw(state, {
      framebuffer: state.targets.write.framebuffer,
      width: state.width,
      height: state.height
    }, bind);
    state.swap();
  }
  render(state: GpuFieldState, destination: GpuParticleRenderDestination, bind: GpuFieldUniformBinder = () => undefined): void {
    this.draw(state, destination, bind);
  }
  renderAdditive(state: GpuFieldState, destination: GpuParticleRenderDestination, bind: GpuFieldUniformBinder = () => undefined): void {
    this.draw(state, destination, bind, true);
  }
  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
  }
  private draw(state: GpuFieldState, destination: GpuParticleRenderDestination, bind: GpuFieldUniformBinder, additive = false): void {
    if (this.disposed)
      throw new Error('GPU field pass has been disposed');
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    if (additive) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    state.targets.read.attach(0);
    gl.uniform1i(this.uniform('uFieldState'), 0);
    gl.uniform2f(this.uniform('uFieldSize'), state.width, state.height);
    bind(gl, name => this.uniform(name));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (additive) gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }
}
function requireValue<T>(value: T | null, message: string): T {
  if (value === null)
    throw new Error(message);
  return value;
}
const VERTEX_SHADER = `#version 300 es
const vec2 POSITIONS[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));out vec2 vUv;void main(){vec2 p=POSITIONS[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
