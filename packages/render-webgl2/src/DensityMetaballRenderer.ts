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
  readonly edgeTightness?: number;
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
  readonly foamStrength?: number;
  readonly thermalStrength?: number;
  readonly bloomStrength?: number;
  readonly heatShimmer?: number;
  readonly depthDiffusion?: number;
  readonly renderStyle?: 'enhanced' | 'ultra';
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
  private readonly compositeTightness: WebGLUniformLocation;
  private readonly compositeUltra: WebGLUniformLocation;
  private readonly compositeFoam: WebGLUniformLocation;
  private readonly compositeThermalStrength: WebGLUniformLocation;
  private readonly compositeBloom: WebGLUniformLocation;
  private readonly compositeShimmer: WebGLUniformLocation;
  private readonly compositeDepthDiffusion: WebGLUniformLocation;
  private readonly paletteData = new Float32Array(12);
  private readonly backgroundData = new Float32Array(3);
  private density: GpuRenderTarget | undefined;
  private count = 0;
  private disposed = false;
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.splatProgram = createShaderProgram(gl, { label: 'density metaball splat', vertexSource: SPLAT_VERTEX, fragmentSource: SPLAT_FRAGMENT });
    this.compositeProgram = createShaderProgram(gl, { label: 'density metaball composite', vertexSource: SCREEN_VERTEX, fragmentSource: compositeFragmentSource() });
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
    this.compositeTightness = requireShaderUniform(gl, this.compositeProgram, 'uTightness', 'density metaball composite');
    this.compositeUltra = requireShaderUniform(gl, this.compositeProgram, 'uUltra', 'density metaball composite');
    this.compositeFoam = requireShaderUniform(gl, this.compositeProgram, 'uFoamStrength', 'density metaball composite');
    this.compositeThermalStrength = requireShaderUniform(gl, this.compositeProgram, 'uThermalStrength', 'density metaball composite');
    this.compositeBloom = requireShaderUniform(gl, this.compositeProgram, 'uBloomStrength', 'density metaball composite');
    this.compositeShimmer = requireShaderUniform(gl, this.compositeProgram, 'uHeatShimmer', 'density metaball composite');
    this.compositeDepthDiffusion = requireShaderUniform(gl, this.compositeProgram, 'uDepthDiffusion', 'density metaball composite');
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
    const requestedScale = bound(options.fieldScale, 0.2, 1.5);
    const scale = Math.min(requestedScale, 2048 / Math.max(1, destination.width), 2048 / Math.max(1, destination.height));
    const width = Math.max(32, Math.round(destination.width * scale)), height = Math.max(32, Math.round(destination.height * scale));
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
    gl.uniform1f(this.compositeTightness, options.edgeTightness ?? 0.72);
    gl.uniform1f(this.compositeUltra, options.renderStyle === 'ultra' ? 1 : 0);
    gl.uniform1f(this.compositeFoam, options.foamStrength ?? 0);
    gl.uniform1f(this.compositeThermalStrength, options.thermalStrength ?? 1);
    gl.uniform1f(this.compositeBloom, options.bloomStrength ?? 0);
    gl.uniform1f(this.compositeShimmer, options.heatShimmer ?? 0);
    gl.uniform1f(this.compositeDepthDiffusion, options.depthDiffusion ?? 0);
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
precision highp float;in float vTemperature;out vec4 outColor;void main(){vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);if(d>1.0)discard;float om=1.0-d;float density=(om*om*(.72+.28*om)*.42+smoothstep(.86,.06,d)*.055);outColor=vec4(density,density*(.72+.22*om),density*clamp(vTemperature,0.0,1.0),density);}`;
const SCREEN_VERTEX = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));out vec2 vUv;void main(){vec2 p=P[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0,1);}`;
function compositeFragmentSource(): string {
  return COMPOSITE_FRAGMENT_SOURCE
    .replaceAll(',0,1)', ',0.0,1.0)')
    .replaceAll(',0,8)', ',0.0,8.0)');
}
const COMPOSITE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;in vec2 vUv;out vec4 outColor;uniform sampler2D uDensity;uniform vec2 uTexel;uniform vec3 uPalette[4],uBackground;uniform int uPaletteCount;uniform float uThreshold,uSoftness,uTightness,uThermalContrast,uThermalStrength,uRefraction,uGloss,uRim,uOpacity,uTime,uBackgroundDepth,uAspect,uUltra,uFoamStrength,uBloomStrength,uHeatShimmer,uDepthDiffusion;
vec4 field(vec2 uv){return texture(uDensity,clamp(uv,vec2(.001),vec2(.999)));}float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}vec3 backdrop(vec2 uv){float a=sin(uv.x*7.0+uv.y*2.8+uTime*.055)*.5+.5;float h=smoothstep(-.85,.92,uv.y*2.0-1.0);vec3 deep=uPalette[min(2,uPaletteCount-1)],surface=uPalette[min(1,uPaletteCount-1)];return mix(uBackground*.72+deep*.16,deep*.48+surface*.22,h)+surface*(a-.5)*.035;}
void main(){vec4 packed=field(vUv);float d=packed.r;vec3 deep=uPalette[min(2,uPaletteCount-1)];vec3 bg=mix(uBackground,backdrop(vUv),.72);bg=mix(bg,deep*(.26+.04/uAspect),clamp(uBackgroundDepth,0,1)*.22);if(d<uThreshold*.42){outColor=vec4(bg,1);return;}float l=field(vUv-vec2(uTexel.x,0)).r,r=field(vUv+vec2(uTexel.x,0)).r,b=field(vUv-vec2(0,uTexel.y)).r,t=field(vUv+vec2(0,uTexel.y)).r;vec2 grad=.5*vec2(r-l,t-b);float signedPx=(d-uThreshold)/max(length(grad),.0018);float aa=mix(1.08,.26,clamp(uTightness,0,1))*(1.0+uSoftness*uSoftness*mix(2.1,4.8,uUltra));float alpha=smoothstep(-aa,aa,signedPx);if(alpha<.002){outColor=vec4(bg,1);return;}float thickness=max(packed.g,d*.68),thermal=clamp((packed.b/max(.001,d)-.5)*uThermalContrast+.5,0,1);vec3 N=normalize(vec3(-grad*mix(155.0,325.0,clamp(thickness*1.25,0,1)),1));vec3 V=vec3(0,0,1),L=normalize(vec3(-.34,-.52,.78)),H=normalize(L+V);float NoV=max(dot(N,V),.001),NoL=max(dot(N,L),0.0),fresnel=pow(1.0-NoV,5.0);float rough=mix(.34,.08,clamp(uGloss,0,1));float a=rough*rough,a2=a*a,NoH=max(dot(N,H),0.0),den=NoH*NoH*(a2-1.0)+1.0,spec=a2/max(3.14159*den*den,1e-5)*NoL;vec3 surface=uPalette[min(1,uPaletteCount-1)],foam=uPalette[min(3,uPaletteCount-1)];vec3 thermalColor=mix(deep,surface,smoothstep(.05,.55,thermal));thermalColor=mix(thermalColor,foam,smoothstep(.48,.98,thermal));vec3 body=mix(mix(surface,deep,.36),thermalColor,clamp(uThermalStrength,0,1));vec2 shimmer=vec2(sin(vUv.y*31.0+thermal*5.4+uTime*1.35),cos(vUv.x*27.0+thermal*4.2-uTime*1.18))*uHeatShimmer*uUltra*.003;vec2 refractUv=clamp(vUv+shimmer+N.xy*uRefraction*mix(.012,.042,clamp(thickness,0,1))*mix(1.0,1.95,uUltra),vec2(.001),vec2(.999));vec3 refracted=mix(body,body*.7+backdrop(refractUv)*.48,mix(.32,.58,uUltra));vec3 water=mix(refracted,mix(surface,foam,.16),fresnel*.12);water+=spec*vec3(1,.96,.86)*.16*uGloss;float rim=pow(1.0-NoV,1.55)*uRim*uUltra;water+=mix(surface,foam,.68)*rim*.7;water=mix(water,mix(deep,body,.54),smoothstep(.1,1.15,thickness)*uDepthDiffusion*uUltra*.58);float edge=alpha*(1.0-alpha)*4.0;float sparkle=smoothstep(.78,.99,hash(floor((vUv+grad*.018)*vec2(340,210))+floor(uTime*1.7)));float foamLine=edge*clamp(uFoamStrength,0,8)*uUltra;water+=max(foam,vec3(.94))*foamLine*(.22+sparkle*1.8)*uGloss;water+=mix(surface,foam,.5)*(spec*.08+edge*fresnel*.28)*uBloomStrength*uUltra;float outAlpha=alpha*uOpacity*mix(.82+.18*smoothstep(.02,.72,thickness),.58+.28*smoothstep(.04,.9,thickness),uUltra);outColor=vec4(mix(bg,water,outAlpha),1);}`;
