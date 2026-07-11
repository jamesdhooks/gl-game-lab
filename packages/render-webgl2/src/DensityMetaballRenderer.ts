import { createGpuRenderTarget, type GpuRenderTarget } from './GpuRenderTarget.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';
export interface DensityMetaballBatch {
  readonly count: number;
  readonly positions: Float32Array;
  readonly radii: Float32Array;
  readonly temperatures: Float32Array;
}
export interface DensityMetaballOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly fieldScale: number;
  readonly particleRadiusScale: number;
  readonly threshold: number;
  readonly edgeSoftness: number;
  readonly palette: readonly (readonly [
    number,
    number,
    number
  ])[];
  readonly background: readonly [
    number,
    number,
    number
  ];
  readonly thermalContrast: number;
  readonly refraction: number;
  readonly gloss: number;
  readonly rimLighting: number;
  readonly opacity: number;
  readonly time?: number;
  readonly backgroundDepth?: number;
}
export function validateDensityMetaballBatch(batch: DensityMetaballBatch): void {
  if (!Number.isSafeInteger(batch.count) || batch.count < 0)
    throw new Error('Metaball count must be a non-negative integer');
  if (batch.positions.length < batch.count * 2)
    throw new Error('Metaball positions do not cover the active count');
  if (batch.radii.length < batch.count)
    throw new Error('Metaball radii do not cover the active count');
  if (batch.temperatures.length < batch.count)
    throw new Error('Metaball temperatures do not cover the active count');
}
export class DensityMetaballRenderer {
  private readonly splatProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly splatVao: WebGLVertexArrayObject;
  private readonly screenVao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly radiusBuffer: WebGLBuffer;
  private readonly temperatureBuffer: WebGLBuffer;
  private readonly splatWorldSize: WebGLUniformLocation;
  private readonly splatPixelScale: WebGLUniformLocation;
  private readonly splatRadiusScale: WebGLUniformLocation;
  private readonly compositeDensity: WebGLUniformLocation;
  private readonly compositeTexel: WebGLUniformLocation;
  private readonly compositePalette: WebGLUniformLocation;
  private readonly compositePaletteCount: WebGLUniformLocation;
  private readonly compositeBackground: WebGLUniformLocation;
  private readonly compositeThreshold: WebGLUniformLocation;
  private readonly compositeSoftness: WebGLUniformLocation;
  private readonly compositeThermalContrast: WebGLUniformLocation;
  private readonly compositeRefraction: WebGLUniformLocation;
  private readonly compositeGloss: WebGLUniformLocation;
  private readonly compositeRim: WebGLUniformLocation;
  private readonly compositeOpacity: WebGLUniformLocation;
  private readonly compositeTime: WebGLUniformLocation;
  private readonly compositeBackgroundDepth: WebGLUniformLocation;
  private readonly compositeAspect: WebGLUniformLocation;
  private readonly paletteData = new Float32Array(12);
  private readonly backgroundData = new Float32Array(3);
  private density: GpuRenderTarget | undefined;
  private count = 0;
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.splatProgram = createShaderProgram(gl, { label: 'density metaball splat', vertexSource: SPLAT_VERTEX, fragmentSource: SPLAT_FRAGMENT });
    this.compositeProgram = createShaderProgram(gl, { label: 'density metaball composite', vertexSource: SCREEN_VERTEX, fragmentSource: COMPOSITE_FRAGMENT });
    this.splatVao = req(gl.createVertexArray(), 'Unable to allocate metaball vertex array');
    this.screenVao = req(gl.createVertexArray(), 'Unable to allocate metaball screen array');
    this.positionBuffer = req(gl.createBuffer(), 'Unable to allocate metaball positions');
    this.radiusBuffer = req(gl.createBuffer(), 'Unable to allocate metaball radii');
    this.temperatureBuffer = req(gl.createBuffer(), 'Unable to allocate metaball temperatures');
    this.splatWorldSize = requireShaderUniform(gl, this.splatProgram, 'uWorldSize', 'density metaball splat');
    this.splatPixelScale = requireShaderUniform(gl, this.splatProgram, 'uPixelScale', 'density metaball splat');
    this.splatRadiusScale = requireShaderUniform(gl, this.splatProgram, 'uRadiusScale', 'density metaball splat');
    this.compositeDensity = requireShaderUniform(gl, this.compositeProgram, 'uDensity', 'density metaball composite');
    this.compositeTexel = requireShaderUniform(gl, this.compositeProgram, 'uTexel', 'density metaball composite');
    this.compositePalette = requireShaderUniform(gl, this.compositeProgram, 'uPalette[0]', 'density metaball composite');
    this.compositePaletteCount = requireShaderUniform(gl, this.compositeProgram, 'uPaletteCount', 'density metaball composite');
    this.compositeBackground = requireShaderUniform(gl, this.compositeProgram, 'uBackground', 'density metaball composite');
    this.compositeThreshold = requireShaderUniform(gl, this.compositeProgram, 'uThreshold', 'density metaball composite');
    this.compositeSoftness = requireShaderUniform(gl, this.compositeProgram, 'uSoftness', 'density metaball composite');
    this.compositeThermalContrast = requireShaderUniform(gl, this.compositeProgram, 'uThermalContrast', 'density metaball composite');
    this.compositeRefraction = requireShaderUniform(gl, this.compositeProgram, 'uRefraction', 'density metaball composite');
    this.compositeGloss = requireShaderUniform(gl, this.compositeProgram, 'uGloss', 'density metaball composite');
    this.compositeRim = requireShaderUniform(gl, this.compositeProgram, 'uRim', 'density metaball composite');
    this.compositeOpacity = requireShaderUniform(gl, this.compositeProgram, 'uOpacity', 'density metaball composite');
    this.compositeTime = requireShaderUniform(gl, this.compositeProgram, 'uTime', 'density metaball composite');
    this.compositeBackgroundDepth = requireShaderUniform(gl, this.compositeProgram, 'uBackgroundDepth', 'density metaball composite');
    this.compositeAspect = requireShaderUniform(gl, this.compositeProgram, 'uAspect', 'density metaball composite');
    gl.bindVertexArray(this.splatVao);
    attribute(gl, this.positionBuffer, 0, 2);
    attribute(gl, this.radiusBuffer, 1, 1);
    attribute(gl, this.temperatureBuffer, 2, 1);
    gl.bindVertexArray(null);
  }
  update(batch: DensityMetaballBatch) {
    this.assert();
    validateDensityMetaballBatch(batch);
    this.count = batch.count;
    upload(this.gl, this.positionBuffer, batch.positions.subarray(0, batch.count * 2));
    upload(this.gl, this.radiusBuffer, batch.radii.subarray(0, batch.count));
    upload(this.gl, this.temperatureBuffer, batch.temperatures.subarray(0, batch.count));
  }
  render(destination: GpuParticleRenderDestination, options: DensityMetaballOptions) {
    this.assert();
    if (options.palette.length < 2 || options.palette.length > 4)
      throw new Error('Metaball palette must contain between two and four colors');
    const width = Math.max(32, Math.round(destination.width * bound(options.fieldScale, 0.2, 1))), height = Math.max(32, Math.round(destination.height * bound(options.fieldScale, 0.2, 1)));
    this.ensureTarget(width, height);
    const density = this.density;
    if (!density)
      return;
    density.clear();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, density.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.splatProgram);
    gl.bindVertexArray(this.splatVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(this.splatWorldSize, options.worldWidth, options.worldHeight);
    gl.uniform1f(this.splatPixelScale, width / options.worldWidth);
    gl.uniform1f(this.splatRadiusScale, options.particleRadiusScale);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.screenVao);
    density.attach(0);
    gl.uniform1i(this.compositeDensity, 0);
    gl.uniform2f(this.compositeTexel, 1 / width, 1 / height);
    this.paletteData.fill(0);
    options.palette.forEach((color, index) => this.paletteData.set(color, index * 3));
    this.backgroundData.set(options.background);
    gl.uniform3fv(this.compositePalette, this.paletteData);
    gl.uniform1i(this.compositePaletteCount, options.palette.length);
    gl.uniform3fv(this.compositeBackground, this.backgroundData);
    gl.uniform1f(this.compositeThreshold, options.threshold);
    gl.uniform1f(this.compositeSoftness, Math.max(0.001, options.edgeSoftness * 0.08));
    gl.uniform1f(this.compositeThermalContrast, options.thermalContrast);
    gl.uniform1f(this.compositeRefraction, options.refraction);
    gl.uniform1f(this.compositeGloss, options.gloss);
    gl.uniform1f(this.compositeRim, options.rimLighting);
    gl.uniform1f(this.compositeOpacity, options.opacity);
    gl.uniform1f(this.compositeTime, options.time ?? 0);
    gl.uniform1f(this.compositeBackgroundDepth, options.backgroundDepth ?? 0);
    gl.uniform1f(this.compositeAspect, destination.width / Math.max(1, destination.height));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    this.density?.dispose();
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.radiusBuffer);
    this.gl.deleteBuffer(this.temperatureBuffer);
    this.gl.deleteVertexArray(this.splatVao);
    this.gl.deleteVertexArray(this.screenVao);
    this.gl.deleteProgram(this.splatProgram);
    this.gl.deleteProgram(this.compositeProgram);
  }
  private ensureTarget(width: number, height: number) {
    if (this.density?.width === width && this.density.height === height)
      return;
    this.density?.dispose();
    this.density = createGpuRenderTarget(this.gl, {
      width,
      height,
      precision: 'half-float',
      filter: 'linear'
    });
  }
  private assert() {
    if (this.disposed)
      throw new Error('Density metaball renderer has been disposed');
  }
}
function attribute(gl: WebGL2RenderingContext, buffer: WebGLBuffer, index: number, size: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(index);
  gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
}
function upload(gl: WebGL2RenderingContext, buffer: WebGLBuffer, data: Float32Array) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
function bound(value: number, min: number, max: number) {
  if (!Number.isFinite(value))
    throw new Error('Metaball option must be finite');
  return Math.max(min, Math.min(max, value));
}
function req<T>(value: T | null, message: string): T {
  if (value === null)
    throw new Error(message);
  return value;
}
const SPLAT_VERTEX = `#version 300 es
precision highp float;layout(location=0)in vec2 aPosition;layout(location=1)in float aRadius;layout(location=2)in float aTemperature;uniform vec2 uWorldSize;uniform float uPixelScale,uRadiusScale;out float vTemperature;void main(){gl_Position=vec4(aPosition.x/uWorldSize.x*2.0-1.0,1.0-aPosition.y/uWorldSize.y*2.0,0,1);gl_PointSize=max(2.0,aRadius*2.0*uPixelScale*uRadiusScale);vTemperature=aTemperature;}`;
const SPLAT_FRAGMENT = `#version 300 es
precision highp float;in float vTemperature;out vec4 outColor;void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;float density=exp(-d*2.8);outColor=vec4(density,density*clamp(vTemperature,0.0,1.0),0,density);}`;
const SCREEN_VERTEX = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));out vec2 vUv;void main(){vec2 p=P[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uDensity;uniform vec2 uTexel;uniform vec3 uPalette[4],uBackground;uniform int uPaletteCount;uniform float uThreshold,uSoftness,uThermalContrast,uRefraction,uGloss,uRim,uOpacity,uTime,uBackgroundDepth,uAspect;
float scene(vec3 p){p.x+=sin(p.y*1.7+uTime*.14)*.28;float a=length(p-vec3(sin(uTime*.09)*1.5,.2,3.2))-1.15;float b=length(p-vec3(-1.4,cos(uTime*.11)*.7,4.6))-.95;float plane=abs(p.y+1.45)-.12;return min(min(a,b),plane);}float march(vec3 ro,vec3 rd){float t=0.0;for(int i=0;i<40;i++){float d=scene(ro+rd*t);if(d<.012)return t;t+=d*.72;if(t>9.0)break;}return-1.0;}
void main(){vec2 p=(vUv-.5)*vec2(uAspect,1.0)*2.0;vec3 ray=normalize(vec3(p,1.7));float hit=march(vec3(0,0,-2.8),ray);float farMask=hit>0.0?1.0:0.0;vec3 farColor=mix(uBackground,uPalette[min(2,uPaletteCount-1)]*(.28+.16*sin(hit*2.0+uTime*.2)),farMask*uBackgroundDepth*.82);vec4 sample0=texture(uDensity,vUv);float density=sample0.r,heat=sample0.g/max(.0001,density);float l=texture(uDensity,vUv-vec2(uTexel.x,0)).r,r=texture(uDensity,vUv+vec2(uTexel.x,0)).r,b=texture(uDensity,vUv-vec2(0,uTexel.y)).r,t=texture(uDensity,vUv+vec2(0,uTexel.y)).r;vec2 grad=vec2(l-r,b-t);vec2 refracted=clamp(vUv+grad*uRefraction*.015,vec2(0),vec2(1));vec4 warped=texture(uDensity,refracted);density=max(density,warped.r*.4);float alpha=smoothstep(uThreshold-uSoftness,uThreshold+uSoftness,density)*uOpacity;vec3 normal=normalize(vec3(grad*4.0,1));float light=.46+.54*max(0.0,dot(normal,normalize(vec3(-.42,.62,1))));float thermal=clamp((heat-.5)*uThermalContrast+.5,0.0,1.0);vec3 body=mix(uPalette[min(2,uPaletteCount-1)],uPalette[min(1,uPaletteCount-1)],thermal);body=mix(body,uPalette[0],pow(thermal,2.4)*.72);float rim=pow(1.0-max(0.0,normal.z),2.0)*uRim;float spec=pow(max(0.0,dot(reflect(normalize(vec3(.42,-.62,-1)),normal),vec3(0,0,1))),12.0)*uGloss;body=body*light+uPalette[min(3,uPaletteCount-1)]*(rim+spec);outColor=vec4(mix(farColor,body,alpha),1);}`;
