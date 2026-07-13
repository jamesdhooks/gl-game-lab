import type { GpuFieldMesh2D } from '@hooksjam/gl-game-lab-engine';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import type { GpuUniformLookup } from './GpuSimulationPass.js';
import type { GpuFieldState } from './GpuFieldState.js';
import { createShaderProgram } from './ShaderProgram.js';

export type GpuFieldMeshUniformBinder = (gl: WebGL2RenderingContext, uniform: GpuUniformLookup) => void;

export class GpuFieldMeshPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly cellBuffer: WebGLBuffer;
  private readonly facetBuffer: WebGLBuffer;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, label: string) {
    this.program = createShaderProgram(gl, { label, vertexSource, fragmentSource });
    this.vao = required(gl.createVertexArray(), 'Unable to allocate GPU field mesh vertex array');
    this.positionBuffer = required(gl.createBuffer(), 'Unable to allocate GPU field mesh position buffer');
    this.cellBuffer = required(gl.createBuffer(), 'Unable to allocate GPU field mesh cell buffer');
    this.facetBuffer = required(gl.createBuffer(), 'Unable to allocate GPU field mesh facet buffer');
    gl.bindVertexArray(this.vao);
    this.bindAttribute(this.positionBuffer, 0, 2);
    this.bindAttribute(this.cellBuffer, 1, 2);
    this.bindAttribute(this.facetBuffer, 2, 1);
    gl.bindVertexArray(null);
  }

  render(state: GpuFieldState, destination: GpuParticleRenderDestination, mesh: GpuFieldMesh2D, bind: GpuFieldMeshUniformBinder): void {
    if (this.disposed) throw new Error('GPU field mesh pass has been disposed');
    if (!Number.isSafeInteger(mesh.vertexCount) || mesh.vertexCount < 0 || mesh.vertexCount % 3 !== 0) throw new Error('GPU field mesh vertex count must be a non-negative multiple of three');
    if (mesh.positions.length < mesh.vertexCount * 2 || mesh.cells.length < mesh.vertexCount * 2 || mesh.facets.length < mesh.vertexCount) throw new Error('GPU field mesh buffers do not cover the active vertices');
    const gl = this.gl;
    this.upload(this.positionBuffer, mesh.positions.subarray(0, mesh.vertexCount * 2));
    this.upload(this.cellBuffer, mesh.cells.subarray(0, mesh.vertexCount * 2));
    this.upload(this.facetBuffer, mesh.facets.subarray(0, mesh.vertexCount));
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    state.targets.read.attach(0);
    gl.uniform1i(this.uniform('uFieldState'), 0);
    gl.uniform2f(this.uniform('uFieldSize'), state.width, state.height);
    bind(gl, name => this.uniform(name));
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.cellBuffer);
    this.gl.deleteBuffer(this.facetBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private bindAttribute(buffer: WebGLBuffer, index: number, size: number): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.enableVertexAttribArray(index);
    this.gl.vertexAttribPointer(index, size, this.gl.FLOAT, false, 0, 0);
  }
  private upload(buffer: WebGLBuffer, data: Float32Array): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.DYNAMIC_DRAW);
  }
  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }
}

function required<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}
