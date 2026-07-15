import type { BlendMode } from './SpriteRenderer.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';
export interface DynamicTriangleMeshBatch {
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly edgeFactors?: Float32Array;
}
export interface DynamicTriangleMeshOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly palette: readonly (readonly [
    number,
    number,
    number
  ])[];
  readonly opacity?: number;
  readonly blend?: BlendMode;
  readonly shading?: 'flat' | 'sheen' | 'soft-body-skin';
}
export function validateDynamicTriangleMeshBatch(batch: DynamicTriangleMeshBatch): void {
  if (!Number.isSafeInteger(batch.vertexCount) || batch.vertexCount < 0 || batch.vertexCount % 3 !== 0)
    throw new Error('Dynamic mesh vertex count must be a non-negative multiple of three');
  if (batch.positions.length < batch.vertexCount * 2)
    throw new Error('Dynamic mesh positions do not cover the active vertices');
  if (batch.colorSeeds.length < batch.vertexCount)
    throw new Error('Dynamic mesh color seeds do not cover the active vertices');
  if (batch.edgeFactors && batch.edgeFactors.length < batch.vertexCount)
    throw new Error('Dynamic mesh edge factors do not cover the active vertices');
}
export class DynamicTriangleMeshRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly seedBuffer: WebGLBuffer;
  private readonly edgeBuffer: WebGLBuffer;
  private readonly worldSizeLocation: WebGLUniformLocation;
  private readonly paletteLocation: WebGLUniformLocation;
  private readonly paletteCountLocation: WebGLUniformLocation;
  private readonly opacityLocation: WebGLUniformLocation;
  private readonly sheenLocation: WebGLUniformLocation;
  private readonly paletteData = new Float32Array(12);
  private vertexCount = 0;
  private fallbackEdgeFactors = new Float32Array(0);
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createShaderProgram(gl, { label: 'dynamic triangle mesh', vertexSource: VERTEX_SHADER, fragmentSource: FRAGMENT_SHADER });
    this.vao = req(gl.createVertexArray(), 'Unable to allocate dynamic mesh vertex array');
    this.positionBuffer = req(gl.createBuffer(), 'Unable to allocate dynamic mesh position buffer');
    this.seedBuffer = req(gl.createBuffer(), 'Unable to allocate dynamic mesh seed buffer');
    this.edgeBuffer = req(gl.createBuffer(), 'Unable to allocate dynamic mesh edge buffer');
    this.worldSizeLocation = requireShaderUniform(gl, this.program, 'uWorldSize', 'dynamic triangle mesh');
    this.paletteLocation = requireShaderUniform(gl, this.program, 'uPalette[0]', 'dynamic triangle mesh');
    this.paletteCountLocation = requireShaderUniform(gl, this.program, 'uPaletteCount', 'dynamic triangle mesh');
    this.opacityLocation = requireShaderUniform(gl, this.program, 'uOpacity', 'dynamic triangle mesh');
    this.sheenLocation = requireShaderUniform(gl, this.program, 'uSheen', 'dynamic triangle mesh');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  update(batch: DynamicTriangleMeshBatch): void {
    this.assert();
    validateDynamicTriangleMeshBatch(batch);
    this.vertexCount = batch.vertexCount;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.positions.subarray(0, batch.vertexCount * 2), this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.seedBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.colorSeeds.subarray(0, batch.vertexCount), this.gl.DYNAMIC_DRAW);
    if (!batch.edgeFactors && this.fallbackEdgeFactors.length < batch.vertexCount) this.fallbackEdgeFactors = new Float32Array(batch.vertexCount);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.edgeBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.edgeFactors?.subarray(0, batch.vertexCount) ?? this.fallbackEdgeFactors.subarray(0, batch.vertexCount), this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }
  render(destination: GpuParticleRenderDestination, options: DynamicTriangleMeshOptions): void {
    this.assert();
    if (this.vertexCount === 0)
      return;
    if (options.palette.length < 1 || options.palette.length > 4)
      throw new Error('Dynamic mesh palette must contain between one and four colors');
    const gl = this.gl;
    this.paletteData.fill(0);
    options.palette.forEach((color, index) => this.paletteData.set(color, index * 3));
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    blend(gl, options.blend ?? 'alpha');
    gl.uniform2f(this.worldSizeLocation, options.worldWidth, options.worldHeight);
    gl.uniform3fv(this.paletteLocation, this.paletteData);
    gl.uniform1i(this.paletteCountLocation, options.palette.length);
    gl.uniform1f(this.opacityLocation, options.opacity ?? 1);
    gl.uniform1f(this.sheenLocation, options.shading === 'soft-body-skin' ? 2 : options.shading === 'flat' ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.seedBuffer);
    this.gl.deleteBuffer(this.edgeBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
  private assert() {
    if (this.disposed)
      throw new Error('Dynamic mesh renderer has been disposed');
  }
}
function blend(gl: WebGL2RenderingContext, mode: BlendMode) {
  if (mode === 'opaque') {
    gl.disable(gl.BLEND);
    return;
  }
  gl.enable(gl.BLEND);
  if (mode === 'additive')
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else if (mode === 'multiply')
    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
  else
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
const VERTEX_SHADER = `#version 300 es
precision highp float;layout(location=0)in vec2 aPosition;layout(location=1)in float aSeed;layout(location=2)in float aEdge;uniform vec2 uWorldSize;flat out float vSeed;out vec2 vPosition;out float vEdge;void main(){gl_Position=vec4(aPosition.x/uWorldSize.x*2.0-1.0,1.0-aPosition.y/uWorldSize.y*2.0,0,1);vSeed=aSeed;vPosition=aPosition/uWorldSize;vEdge=aEdge;}`;
const FRAGMENT_SHADER = `#version 300 es
precision highp float;flat in float vSeed;in vec2 vPosition;in float vEdge;uniform vec3 uPalette[4];uniform int uPaletteCount;uniform float uOpacity;uniform float uSheen;out vec4 outColor;void main(){int index=int(abs(vSeed))%max(1,uPaletteCount);vec3 base=uPalette[index];if(uSheen>1.5){float rim=smoothstep(0.0,1.0,vEdge);float bodyShade=mix(.42,1.28,rim);float softSpecular=pow(max(0.0,rim),2.15)*.18;outColor=vec4(base*bodyShade+base*softSpecular,uOpacity);return;}float sheen=mix(1.0,.82+.18*sin((vPosition.x-vPosition.y)*18.0+vSeed),uSheen);outColor=vec4(base*sheen,uOpacity);}`;
function req<T>(value: T | null, message: string): T {
  if (value === null)
    throw new Error(message);
  return value;
}
