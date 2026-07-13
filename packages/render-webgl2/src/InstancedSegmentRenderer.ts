import type { BlendMode } from './SpriteRenderer.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';
export interface InstancedSegmentBatch {
  readonly count: number;
  readonly segments: Float32Array;
  readonly styles: Float32Array;
}
export interface InstancedSegmentRenderOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly palette: readonly (readonly [
    number,
    number,
    number
  ])[];
  readonly radiusScale?: number;
  readonly opacity?: number;
  readonly blend?: BlendMode;
}
export function validateInstancedSegmentBatch(batch: InstancedSegmentBatch): void {
  if (!Number.isSafeInteger(batch.count) || batch.count < 0)
    throw new Error('Instanced segment count must be a non-negative integer');
  if (batch.segments.length < batch.count * 4)
    throw new Error('Instanced segment geometry does not cover the active count');
  if (batch.styles.length < batch.count * 2)
    throw new Error('Instanced segment styles do not cover the active count');
}
export class InstancedSegmentRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly segmentBuffer: WebGLBuffer;
  private readonly styleBuffer: WebGLBuffer;
  private readonly worldSizeLocation: WebGLUniformLocation;
  private readonly radiusScaleLocation: WebGLUniformLocation;
  private readonly opacityLocation: WebGLUniformLocation;
  private readonly paletteLocation: WebGLUniformLocation;
  private readonly paletteCountLocation: WebGLUniformLocation;
  private readonly paletteData = new Float32Array(12);
  private count = 0;
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createShaderProgram(gl, { label: 'instanced segment renderer', vertexSource: VERTEX_SHADER, fragmentSource: FRAGMENT_SHADER });
    this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate segment vertex array');
    this.segmentBuffer = requireValue(gl.createBuffer(), 'Unable to allocate segment geometry buffer');
    this.styleBuffer = requireValue(gl.createBuffer(), 'Unable to allocate segment style buffer');
    this.worldSizeLocation = requireShaderUniform(gl, this.program, 'uWorldSize', 'instanced segment renderer');
    this.radiusScaleLocation = requireShaderUniform(gl, this.program, 'uRadiusScale', 'instanced segment renderer');
    this.opacityLocation = requireShaderUniform(gl, this.program, 'uOpacity', 'instanced segment renderer');
    this.paletteLocation = requireShaderUniform(gl, this.program, 'uPalette[0]', 'instanced segment renderer');
    this.paletteCountLocation = requireShaderUniform(gl, this.program, 'uPaletteCount', 'instanced segment renderer');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segmentBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.styleBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }
  update(batch: InstancedSegmentBatch): void {
    this.assertUsable();
    validateInstancedSegmentBatch(batch);
    this.count = batch.count;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.segmentBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.segments.subarray(0, batch.count * 4), this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.styleBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, batch.styles.subarray(0, batch.count * 2), this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }
  render(destination: GpuParticleRenderDestination, options: InstancedSegmentRenderOptions): void {
    this.assertUsable();
    if (this.count === 0)
      return;
    const gl = this.gl;
    if (options.palette.length < 1 || options.palette.length > 4)
      throw new Error('Instanced segment palette must contain between one and four colors');
    this.paletteData.fill(0);
    options.palette.forEach((color, index) => this.paletteData.set(color, index * 3));
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    configureBlend(gl, options.blend ?? 'alpha');
    gl.uniform2f(this.worldSizeLocation, options.worldWidth, options.worldHeight);
    gl.uniform1f(this.radiusScaleLocation, options.radiusScale ?? 1);
    gl.uniform1f(this.opacityLocation, options.opacity ?? 1);
    gl.uniform3fv(this.paletteLocation, this.paletteData);
    gl.uniform1i(this.paletteCountLocation, options.palette.length);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    this.gl.deleteBuffer(this.segmentBuffer);
    this.gl.deleteBuffer(this.styleBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
  private assertUsable() {
    if (this.disposed)
      throw new Error('Instanced segment renderer has been disposed');
  }
}
function configureBlend(gl: WebGL2RenderingContext, mode: BlendMode) {
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
function requireValue<T>(value: T | null, message: string): T {
  if (value === null)
    throw new Error(message);
  return value;
}
const VERTEX_SHADER = `#version 300 es
precision highp float;layout(location=0)in vec4 aSegment;layout(location=1)in vec2 aStyle;uniform vec2 uWorldSize;uniform float uRadiusScale;out vec2 vLocal;flat out float vLength;flat out float vRadius;out float vIntensity;flat out float vSeed;void main(){const vec2 corners[6]=vec2[6](vec2(0,-1),vec2(1,-1),vec2(1,1),vec2(0,-1),vec2(1,1),vec2(0,1));vec2 corner=corners[gl_VertexID],start=aSegment.xy,end=aSegment.zw,axis=end-start;float segmentLength=length(axis),radius=max(.001,aStyle.x*uRadiusScale);vec2 direction=segmentLength>.0001?axis/segmentLength:vec2(1,0),normal=vec2(-direction.y,direction.x);float along=mix(-radius,segmentLength+radius,corner.x),across=corner.y*radius;vec2 world=start+direction*along+normal*across;gl_Position=vec4(world.x/uWorldSize.x*2.0-1.0,1.0-world.y/uWorldSize.y*2.0,0,1);vLocal=vec2(along,across);vLength=segmentLength;vRadius=radius;vIntensity=aStyle.y;vSeed=float(gl_InstanceID);}`;
const FRAGMENT_SHADER = `#version 300 es
precision highp float;in vec2 vLocal;flat in float vLength;flat in float vRadius;in float vIntensity;flat in float vSeed;uniform vec3 uPalette[4];uniform int uPaletteCount;uniform float uOpacity;out vec4 outColor;float hash(float n){return fract(sin(n*17.13)*43758.5453);}void main(){float nearest=clamp(vLocal.x,0.0,vLength),distanceToAxis=length(vec2(vLocal.x-nearest,vLocal.y));float aa=max(fwidth(distanceToAxis),.75),edge=1.0-smoothstep(vRadius-aa,vRadius,distanceToAxis);if(edge<=.001)discard;int index=int(floor(hash(vSeed)*float(max(1,uPaletteCount))))%max(1,uPaletteCount);vec3 color=uPalette[index];outColor=vec4(color*(.55+vIntensity*.55),edge*uOpacity*clamp(vIntensity,.15,1.5));}`;
