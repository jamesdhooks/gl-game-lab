import type { WebGL2Device, WebGLTextureResource } from './WebGL2Device.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';

export interface BloomOptions {
  readonly enabled?: boolean;
  readonly threshold?: number;
  readonly intensity?: number;
  readonly radius?: number;
  readonly iterations?: number;
  readonly resolutionScale?: number;
}

export interface NormalizedBloomOptions {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly intensity: number;
  readonly radius: number;
  readonly iterations: number;
  readonly resolutionScale: number;
}

export interface BloomPostProcessStats {
  readonly enabled: boolean;
  readonly renderTargetCount: number;
  readonly passes: number;
  readonly width: number;
  readonly height: number;
}

export interface EmissiveLightingOptions {
  readonly enabled?: boolean;
  /** Normalized bottom-left-origin source coordinate. */
  readonly source?: readonly [number, number];
  readonly radius?: number;
  readonly color?: readonly [number, number, number];
  readonly sourceIntensity?: number;
  readonly environmentStrength?: number;
  readonly shaftStrength?: number;
  readonly shaftLength?: number;
  readonly heatDistortion?: number;
  readonly timeSeconds?: number;
  readonly resolutionScale?: number;
}

interface NormalizedEmissiveLightingOptions {
  readonly enabled: boolean;
  readonly source: readonly [number, number];
  readonly radius: number;
  readonly color: readonly [number, number, number];
  readonly sourceIntensity: number;
  readonly environmentStrength: number;
  readonly shaftStrength: number;
  readonly shaftLength: number;
  readonly heatDistortion: number;
  readonly timeSeconds: number;
  readonly resolutionScale: number;
}

const DEFAULT_BLOOM: NormalizedBloomOptions = Object.freeze({
  enabled: false,
  threshold: 0.68,
  intensity: 0.9,
  radius: 1,
  iterations: 4,
  resolutionScale: 0.5,
});

const DEFAULT_LIGHTING: NormalizedEmissiveLightingOptions = Object.freeze({
  enabled: false, source: [0.5, 0.5] as const, radius: 0.2, color: [1, 0.72, 0.28] as const, sourceIntensity: 1,
  environmentStrength: 0, shaftStrength: 0, shaftLength: 0.55, heatDistortion: 0, timeSeconds: 0, resolutionScale: 0.25,
});

export function normalizeBloomOptions(options: BloomOptions = {}): NormalizedBloomOptions {
  const threshold = finiteRange(options.threshold ?? DEFAULT_BLOOM.threshold, 0, 1, 'Bloom threshold');
  const intensity = finiteRange(options.intensity ?? DEFAULT_BLOOM.intensity, 0, 8, 'Bloom intensity');
  const radius = finiteRange(options.radius ?? DEFAULT_BLOOM.radius, 0.25, 16, 'Bloom radius');
  const resolutionScale = finiteRange(options.resolutionScale ?? DEFAULT_BLOOM.resolutionScale, 0.125, 1, 'Bloom resolution scale');
  const iterations = options.iterations ?? DEFAULT_BLOOM.iterations;
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 12) {
    throw new Error('Bloom iterations must be an integer between 1 and 12');
  }
  return Object.freeze({
    enabled: options.enabled ?? DEFAULT_BLOOM.enabled,
    threshold,
    intensity,
    radius,
    iterations,
    resolutionScale,
  });
}

export function normalizeEmissiveLightingOptions(options: EmissiveLightingOptions = {}): NormalizedEmissiveLightingOptions {
  const source = options.source ?? DEFAULT_LIGHTING.source;
  const color = options.color ?? DEFAULT_LIGHTING.color;
  if (source.length !== 2 || !source.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Emissive light source must be normalized');
  if (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Emissive light color components must be between zero and one');
  return Object.freeze({
    enabled: options.enabled ?? false,
    source: [source[0], source[1]] as const, color: [color[0], color[1], color[2]] as const,
    radius: finiteRange(options.radius ?? DEFAULT_LIGHTING.radius, 0.001, 2, 'Emissive light radius'),
    sourceIntensity: finiteRange(options.sourceIntensity ?? 1, 0, 8, 'Emissive source intensity'),
    environmentStrength: finiteRange(options.environmentStrength ?? 0, 0, 8, 'Environmental light strength'),
    shaftStrength: finiteRange(options.shaftStrength ?? 0, 0, 4, 'Light shaft strength'),
    shaftLength: finiteRange(options.shaftLength ?? DEFAULT_LIGHTING.shaftLength, 0.05, 2, 'Light shaft length'),
    heatDistortion: finiteRange(options.heatDistortion ?? 0, 0, 2, 'Heat distortion'),
    timeSeconds: Number.isFinite(options.timeSeconds) ? options.timeSeconds! : 0,
    resolutionScale: finiteRange(options.resolutionScale ?? DEFAULT_LIGHTING.resolutionScale, 0.125, 1, 'Emissive lighting resolution scale'),
  });
}

/** Shared fullscreen bloom stage. Scene producers render into sceneTarget, then call composite(). */
export class BloomPostProcess {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly filterProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly lightingProgram: WebGLProgram;
  private readonly filterTextureLocation: WebGLUniformLocation;
  private readonly filterTexelLocation: WebGLUniformLocation;
  private readonly filterDirectionLocation: WebGLUniformLocation;
  private readonly filterThresholdLocation: WebGLUniformLocation;
  private readonly compositeSceneLocation: WebGLUniformLocation;
  private readonly compositeBloomLocation: WebGLUniformLocation;
  private readonly compositeIntensityLocation: WebGLUniformLocation;
  private readonly compositeLightingLocation: WebGLUniformLocation;
  private readonly compositeLightingStrengthLocation: WebGLUniformLocation;
  private readonly compositeSourceLocation: WebGLUniformLocation;
  private readonly compositeRadiusLocation: WebGLUniformLocation;
  private readonly compositeHeatLocation: WebGLUniformLocation;
  private readonly compositeTimeLocation: WebGLUniformLocation;
  private readonly lightingSourceLocation: WebGLUniformLocation;
  private readonly lightingColorLocation: WebGLUniformLocation;
  private readonly lightingRadiusLocation: WebGLUniformLocation;
  private readonly lightingEnvironmentLocation: WebGLUniformLocation;
  private readonly lightingShaftLocation: WebGLUniformLocation;
  private readonly lightingShaftLengthLocation: WebGLUniformLocation;
  private readonly lightingTimeLocation: WebGLUniformLocation;
  private options: NormalizedBloomOptions;
  private lightingOptions: NormalizedEmissiveLightingOptions = DEFAULT_LIGHTING;
  private scene: WebGLTextureResource | undefined;
  private ping: WebGLTextureResource | undefined;
  private pong: WebGLTextureResource | undefined;
  private lighting: WebGLTextureResource | undefined;
  private disposed = false;

  constructor(private readonly device: WebGL2Device, options: BloomOptions = {}) {
    this.gl = device.gl;
    this.options = normalizeBloomOptions(options);
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create post-process vertex array');
    this.filterProgram = createShaderProgram(this.gl, { label: 'bloom filter', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: FILTER_FRAGMENT_SHADER });
    this.compositeProgram = createShaderProgram(this.gl, { label: 'bloom composite', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: COMPOSITE_FRAGMENT_SHADER });
    this.lightingProgram = createShaderProgram(this.gl, { label: 'emissive lighting', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: LIGHTING_FRAGMENT_SHADER });
    this.filterTextureLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texture', 'bloom filter');
    this.filterTexelLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texel', 'bloom filter');
    this.filterDirectionLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_direction', 'bloom filter');
    this.filterThresholdLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_threshold', 'bloom filter');
    this.compositeSceneLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_scene', 'bloom composite');
    this.compositeBloomLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_bloom', 'bloom composite');
    this.compositeIntensityLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_intensity', 'bloom composite');
    this.compositeLightingLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_lighting', 'bloom composite');
    this.compositeLightingStrengthLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_lightingStrength', 'bloom composite');
    this.compositeSourceLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_source', 'bloom composite');
    this.compositeRadiusLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_radius', 'bloom composite');
    this.compositeHeatLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_heatDistortion', 'bloom composite');
    this.compositeTimeLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_time', 'bloom composite');
    this.lightingSourceLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_source', 'emissive lighting');
    this.lightingColorLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_color', 'emissive lighting');
    this.lightingRadiusLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_radius', 'emissive lighting');
    this.lightingEnvironmentLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_environment', 'emissive lighting');
    this.lightingShaftLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_shafts', 'emissive lighting');
    this.lightingShaftLengthLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_shaftLength', 'emissive lighting');
    this.lightingTimeLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_time', 'emissive lighting');
  }

  configure(options: BloomOptions): void {
    this.assertUsable();
    const next = normalizeBloomOptions(options);
    const allocationChanged = next.enabled !== this.options.enabled
      || next.resolutionScale !== this.options.resolutionScale;
    this.options = next;
    if (allocationChanged) this.releaseTargets();
  }

  configureLighting(options: EmissiveLightingOptions): void {
    this.assertUsable();
    const next = normalizeEmissiveLightingOptions(options);
    const allocationChanged = emissiveLightingActive(next) !== emissiveLightingActive(this.lightingOptions)
      || next.resolutionScale !== this.lightingOptions.resolutionScale;
    this.lightingOptions = next;
    if (allocationChanged) this.releaseTargets();
  }

  get configuration(): NormalizedBloomOptions {
    return this.options;
  }

  get sceneTarget(): WebGLTextureResource | undefined {
    this.assertUsable();
    if (!this.options.enabled && !emissiveLightingActive(this.lightingOptions)) return undefined;
    this.ensureTargets();
    return this.scene;
  }

  clearScene(color: readonly [number, number, number, number]): void {
    const scene = this.sceneTarget;
    if (!scene?.framebuffer) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    gl.viewport(0, 0, scene.descriptor.width, scene.descriptor.height);
    gl.clearColor(color[0], color[1], color[2], color[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  composite(): void {
    this.assertUsable();
    if (!this.options.enabled && !emissiveLightingActive(this.lightingOptions)) return;
    this.ensureTargets();
    const scene = requireResource(this.scene);
    const ping = this.ping;
    const pong = this.pong;
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    if (this.options.enabled && ping && pong) {
      gl.useProgram(this.filterProgram);
      gl.uniform1i(this.filterTextureLocation, 0);
      gl.uniform1f(this.filterThresholdLocation, this.options.threshold);
      this.drawFilter(scene, ping, 0, 0);
      for (let index = 0; index < this.options.iterations; index += 1) {
        this.drawFilter(ping, pong, this.options.radius, 0);
        this.drawFilter(pong, ping, 0, this.options.radius);
      }
    }
    if (this.lighting) this.drawLighting(this.lighting);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.device.canvas.width, this.device.canvas.height);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(this.compositeSceneLocation, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (ping ?? scene).texture);
    gl.uniform1i(this.compositeBloomLocation, 1);
    gl.uniform1f(this.compositeIntensityLocation, this.options.enabled ? this.options.intensity : 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, (this.lighting ?? scene).texture);
    gl.uniform1i(this.compositeLightingLocation, 2);
    gl.uniform1f(this.compositeLightingStrengthLocation, this.lighting ? this.lightingOptions.sourceIntensity : 0);
    gl.uniform2f(this.compositeSourceLocation, this.lightingOptions.source[0], this.lightingOptions.source[1]);
    gl.uniform1f(this.compositeRadiusLocation, this.lightingOptions.radius);
    gl.uniform1f(this.compositeHeatLocation, this.lightingOptions.enabled ? this.lightingOptions.heatDistortion : 0);
    gl.uniform1f(this.compositeTimeLocation, this.lightingOptions.timeSeconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  get stats(): BloomPostProcessStats {
    return Object.freeze({
      enabled: this.options.enabled,
      renderTargetCount: (this.scene ? 1 : 0) + (this.ping ? 2 : 0) + (this.lighting ? 1 : 0),
      passes: this.scene ? 1 + (this.options.enabled ? 1 + this.options.iterations * 2 : 0) + (this.lighting ? 1 : 0) : 0,
      width: this.scene?.descriptor.width ?? 0,
      height: this.scene?.descriptor.height ?? 0,
    });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseTargets();
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.filterProgram);
    this.gl.deleteProgram(this.compositeProgram);
    this.gl.deleteProgram(this.lightingProgram);
  }

  private ensureTargets(): void {
    const width = Math.max(1, this.device.canvas.width);
    const height = Math.max(1, this.device.canvas.height);
    const needsBloom = this.options.enabled;
    const needsLighting = emissiveLightingActive(this.lightingOptions) && (this.lightingOptions.environmentStrength > 0 || this.lightingOptions.shaftStrength > 0);
    if (this.scene?.descriptor.width === width && this.scene.descriptor.height === height
      && (!needsBloom || (this.ping && this.pong)) && (!needsLighting || this.lighting)) return;
    this.releaseTargets();
    this.scene = this.device.createTexture({ width, height, renderTarget: true, filter: 'linear' });
    if (needsBloom) {
      const bloomWidth = Math.max(1, Math.round(width * this.options.resolutionScale));
      const bloomHeight = Math.max(1, Math.round(height * this.options.resolutionScale));
      this.ping = this.device.createTexture({ width: bloomWidth, height: bloomHeight, renderTarget: true, filter: 'linear' });
      this.pong = this.device.createTexture({ width: bloomWidth, height: bloomHeight, renderTarget: true, filter: 'linear' });
    }
    if (needsLighting) this.lighting = this.device.createTexture({
      width: Math.max(1, Math.round(width * this.lightingOptions.resolutionScale)),
      height: Math.max(1, Math.round(height * this.lightingOptions.resolutionScale)), renderTarget: true, filter: 'linear',
    });
  }

  private drawLighting(destination: WebGLTextureResource): void {
    const gl = this.gl, options = this.lightingOptions;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.descriptor.width, destination.descriptor.height);
    gl.useProgram(this.lightingProgram);
    gl.uniform2f(this.lightingSourceLocation, options.source[0], options.source[1]);
    gl.uniform3f(this.lightingColorLocation, options.color[0], options.color[1], options.color[2]);
    gl.uniform1f(this.lightingRadiusLocation, options.radius);
    gl.uniform1f(this.lightingEnvironmentLocation, options.environmentStrength);
    gl.uniform1f(this.lightingShaftLocation, options.shaftStrength);
    gl.uniform1f(this.lightingShaftLengthLocation, options.shaftLength);
    gl.uniform1f(this.lightingTimeLocation, options.timeSeconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawFilter(source: WebGLTextureResource, destination: WebGLTextureResource, directionX: number, directionY: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.descriptor.width, destination.descriptor.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform2f(this.filterTexelLocation, 1 / source.descriptor.width, 1 / source.descriptor.height);
    gl.uniform2f(this.filterDirectionLocation, directionX, directionY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private releaseTargets(): void {
    this.scene?.dispose();
    this.ping?.dispose();
    this.pong?.dispose();
    this.lighting?.dispose();
    this.scene = undefined;
    this.ping = undefined;
    this.pong = undefined;
    this.lighting = undefined;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Bloom post-process has been destroyed');
    if (this.device.isContextLost) throw new Error('WebGL2 context is lost');
  }
}

function finiteRange(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function emissiveLightingActive(options: NormalizedEmissiveLightingOptions): boolean {
  return options.enabled && options.sourceIntensity > 0
    && (options.environmentStrength > 0 || options.shaftStrength > 0 || options.heatDistortion > 0);
}

function requireResource(resource: WebGLTextureResource | undefined): WebGLTextureResource {
  if (!resource) throw new Error('Bloom render target is unavailable');
  return resource;
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

const FILTER_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform float u_threshold;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 center = texture(u_texture, v_uv).rgb;
  if (dot(u_direction, u_direction) < 0.000001) {
    float brightness = max(center.r, max(center.g, center.b));
    outColor = vec4(center * smoothstep(u_threshold, min(1.0, u_threshold + 0.18), brightness), 1.0);
    return;
  }
  vec2 offset = u_texel * u_direction;
  vec3 color = center * 0.227027;
  color += texture(u_texture, v_uv + offset * 1.384615).rgb * 0.316216;
  color += texture(u_texture, v_uv - offset * 1.384615).rgb * 0.316216;
  color += texture(u_texture, v_uv + offset * 3.230769).rgb * 0.070270;
  color += texture(u_texture, v_uv - offset * 3.230769).rgb * 0.070270;
  outColor = vec4(color, 1.0);
}`;

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_lighting;
uniform float u_intensity;
uniform float u_lightingStrength;
uniform vec2 u_source;
uniform float u_radius;
uniform float u_heatDistortion;
uniform float u_time;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 delta=v_uv-u_source;
  float distanceToSource=length(delta);
  float heatMask=1.0-smoothstep(0.0,max(0.001,u_radius),distanceToSource);
  vec2 normal=distanceToSource>0.0001?delta/distanceToSource:vec2(0.0);
  float wave=sin(distanceToSource*180.0-u_time*9.0)+sin((v_uv.x+v_uv.y)*95.0+u_time*6.0);
  vec2 distortedUv=clamp(v_uv+normal*wave*u_heatDistortion*heatMask*0.0025,vec2(0.001),vec2(0.999));
  vec4 scene = texture(u_scene, distortedUv);
  vec3 glow = texture(u_bloom, v_uv).rgb * u_intensity;
  vec3 lighting=texture(u_lighting,v_uv).rgb*u_lightingStrength;
  outColor = vec4(scene.rgb + glow + lighting, scene.a);
}`;

const LIGHTING_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 u_source;
uniform vec3 u_color;
uniform float u_radius;
uniform float u_environment;
uniform float u_shafts;
uniform float u_shaftLength;
uniform float u_time;
in vec2 v_uv;
out vec4 outColor;
float hash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
void main(){
  vec2 delta=v_uv-u_source;
  float distanceToSource=length(delta);
  float radial=pow(max(0.0,1.0-distanceToSource/max(0.001,u_radius)),2.2)*u_environment;
  float angle=atan(delta.y,delta.x);
  float angularNoise=0.56+0.44*sin(angle*17.0+sin(angle*7.0)*2.4+u_time*0.11);
  angularNoise*=0.72+0.28*hash12(vec2(floor((angle+3.14159)*21.0),17.0));
  float shaftEnvelope=exp(-distanceToSource/max(0.001,u_shaftLength))*smoothstep(0.012,0.075,distanceToSource);
  float shafts=pow(max(0.0,angularNoise),5.0)*shaftEnvelope*u_shafts;
  outColor=vec4(u_color*(radial+shafts),1.0);
}`;
