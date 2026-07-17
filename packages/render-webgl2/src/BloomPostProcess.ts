import type { WebGL2Device, WebGLTextureResource } from './WebGL2Device.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';

export interface BloomOptions {
  readonly enabled?: boolean;
  readonly threshold?: number;
  readonly intensity?: number;
  readonly radius?: number;
  readonly iterations?: number;
  readonly resolutionScale?: number;
  /** Extract bloom from energy above the renderer clear color instead of the complete scene. */
  readonly isolateClearColor?: boolean;
}

export interface NormalizedBloomOptions {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly intensity: number;
  readonly radius: number;
  readonly iterations: number;
  readonly resolutionScale: number;
  readonly isolateClearColor: boolean;
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
  readonly occluders?: readonly EmissiveLightingOccluder[];
}

export interface EmissiveLightingOccluder {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly radius: number;
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
  readonly occluders: readonly EmissiveLightingOccluder[];
}

const MAX_LIGHT_OCCLUDERS = 16;

const DEFAULT_BLOOM: NormalizedBloomOptions = Object.freeze({
  enabled: false,
  threshold: 0.68,
  intensity: 0.9,
  radius: 1,
  iterations: 4,
  resolutionScale: 0.5,
  isolateClearColor: false,
});

const DEFAULT_LIGHTING: NormalizedEmissiveLightingOptions = Object.freeze({
  enabled: false, source: [0.5, 0.5] as const, radius: 0.2, color: [1, 0.72, 0.28] as const, sourceIntensity: 1,
  environmentStrength: 0, shaftStrength: 0, shaftLength: 0.55, heatDistortion: 0, timeSeconds: 0, resolutionScale: 0.25,
  occluders: Object.freeze([]),
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
    isolateClearColor: options.isolateClearColor ?? DEFAULT_BLOOM.isolateClearColor,
  });
}

export function normalizeEmissiveLightingOptions(options: EmissiveLightingOptions = {}): NormalizedEmissiveLightingOptions {
  const source = options.source ?? DEFAULT_LIGHTING.source;
  const color = options.color ?? DEFAULT_LIGHTING.color;
  if (source.length !== 2 || !source.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Emissive light source must be normalized');
  if (color.length !== 3 || !color.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Emissive light color components must be between zero and one');
  const occluders = options.occluders ?? [];
  if (occluders.length > MAX_LIGHT_OCCLUDERS) throw new Error(`Emissive lighting supports at most ${MAX_LIGHT_OCCLUDERS} occluders`);
  for (const occluder of occluders) {
    if (![...occluder.a, ...occluder.b, occluder.radius].every(Number.isFinite) || occluder.radius < 0) throw new Error('Emissive light occluders must be finite with a non-negative radius');
  }
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
    occluders: Object.freeze(occluders.map((occluder) => Object.freeze({ a: [occluder.a[0], occluder.a[1]] as const, b: [occluder.b[0], occluder.b[1]] as const, radius: occluder.radius }))),
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
  private readonly filterBaselineLocation: WebGLUniformLocation;
  private readonly filterIsolateBaselineLocation: WebGLUniformLocation;
  private readonly compositeSceneLocation: WebGLUniformLocation;
  private readonly compositeBloomLocation: WebGLUniformLocation;
  private readonly compositeIntensityLocation: WebGLUniformLocation;
  private readonly compositeLightingLocation: WebGLUniformLocation;
  private readonly compositeLightingStrengthLocation: WebGLUniformLocation;
  private readonly compositeSourceLocation: WebGLUniformLocation;
  private readonly compositeRadiusLocation: WebGLUniformLocation;
  private readonly compositeHeatLocation: WebGLUniformLocation;
  private readonly compositeTimeLocation: WebGLUniformLocation;
  private readonly lightingEmissiveLocation: WebGLUniformLocation;
  private readonly lightingEmissiveTexelLocation: WebGLUniformLocation;
  private readonly lightingBaselineLocation: WebGLUniformLocation;
  private readonly lightingSourceLocation: WebGLUniformLocation;
  private readonly lightingColorLocation: WebGLUniformLocation;
  private readonly lightingRadiusLocation: WebGLUniformLocation;
  private readonly lightingEnvironmentLocation: WebGLUniformLocation;
  private readonly lightingShaftLocation: WebGLUniformLocation;
  private readonly lightingShaftLengthLocation: WebGLUniformLocation;
  private readonly lightingTimeLocation: WebGLUniformLocation;
  private readonly lightingAspectLocation: WebGLUniformLocation;
  private readonly lightingOccluderCountLocation: WebGLUniformLocation;
  private readonly lightingOccludersLocation: WebGLUniformLocation;
  private readonly lightingOccluderRadiiLocation: WebGLUniformLocation;
  private readonly lightingOccluderData = new Float32Array(MAX_LIGHT_OCCLUDERS * 4);
  private readonly lightingOccluderRadii = new Float32Array(MAX_LIGHT_OCCLUDERS);
  private options: NormalizedBloomOptions;
  private lightingOptions: NormalizedEmissiveLightingOptions = DEFAULT_LIGHTING;
  private scene: WebGLTextureResource | undefined;
  private ping: WebGLTextureResource | undefined;
  private pong: WebGLTextureResource | undefined;
  private lighting: WebGLTextureResource | undefined;
  private clearColor: readonly [number, number, number] = [0, 0, 0];
  private disposed = false;

  constructor(private readonly device: WebGL2Device, options: BloomOptions = {}) {
    this.gl = device.gl;
    this.options = normalizeBloomOptions(options);
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create post-process vertex array');
    this.filterProgram = createShaderProgram(this.gl, { label: 'bloom filter', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: BLOOM_FILTER_FRAGMENT_SHADER });
    this.compositeProgram = createShaderProgram(this.gl, { label: 'bloom composite', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: COMPOSITE_FRAGMENT_SHADER });
    this.lightingProgram = createShaderProgram(this.gl, { label: 'emissive lighting', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: LIGHTING_FRAGMENT_SHADER });
    this.filterTextureLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texture', 'bloom filter');
    this.filterTexelLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texel', 'bloom filter');
    this.filterDirectionLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_direction', 'bloom filter');
    this.filterThresholdLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_threshold', 'bloom filter');
    this.filterBaselineLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_baseline', 'bloom filter');
    this.filterIsolateBaselineLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_isolateBaseline', 'bloom filter');
    this.compositeSceneLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_scene', 'bloom composite');
    this.compositeBloomLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_bloom', 'bloom composite');
    this.compositeIntensityLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_intensity', 'bloom composite');
    this.compositeLightingLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_lighting', 'bloom composite');
    this.compositeLightingStrengthLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_lightingStrength', 'bloom composite');
    this.compositeSourceLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_source', 'bloom composite');
    this.compositeRadiusLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_radius', 'bloom composite');
    this.compositeHeatLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_heatDistortion', 'bloom composite');
    this.compositeTimeLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_time', 'bloom composite');
    this.lightingEmissiveLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_emissive', 'emissive lighting');
    this.lightingEmissiveTexelLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_emissiveTexel', 'emissive lighting');
    this.lightingBaselineLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_baseline', 'emissive lighting');
    this.lightingSourceLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_source', 'emissive lighting');
    this.lightingColorLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_color', 'emissive lighting');
    this.lightingRadiusLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_radius', 'emissive lighting');
    this.lightingEnvironmentLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_environment', 'emissive lighting');
    this.lightingShaftLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_shafts', 'emissive lighting');
    this.lightingShaftLengthLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_shaftLength', 'emissive lighting');
    this.lightingTimeLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_time', 'emissive lighting');
    this.lightingAspectLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_aspect', 'emissive lighting');
    this.lightingOccluderCountLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_occluderCount', 'emissive lighting');
    this.lightingOccludersLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_occluders[0]', 'emissive lighting');
    this.lightingOccluderRadiiLocation = requireShaderUniform(this.gl, this.lightingProgram, 'u_occluderRadii[0]', 'emissive lighting');
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
    this.clearColor = [color[0], color[1], color[2]];
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
      gl.uniform3f(this.filterBaselineLocation, this.clearColor[0], this.clearColor[1], this.clearColor[2]);
      gl.uniform1f(this.filterIsolateBaselineLocation, this.options.isolateClearColor ? 1 : 0);
      this.drawFilter(scene, ping, 0, 0);
      gl.uniform1f(this.filterIsolateBaselineLocation, 0);
      for (let index = 0; index < this.options.iterations; index += 1) {
        const directions = bloomBlurPassDirections(this.options.radius, this.options.iterations, index);
        this.drawFilter(ping, pong, directions.horizontal[0], directions.horizontal[1]);
        this.drawFilter(pong, ping, directions.vertical[0], directions.vertical[1]);
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
    const scene = requireResource(this.scene);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.descriptor.width, destination.descriptor.height);
    gl.useProgram(this.lightingProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(this.lightingEmissiveLocation, 0);
    gl.uniform2f(this.lightingEmissiveTexelLocation, 1 / scene.descriptor.width, 1 / scene.descriptor.height);
    gl.uniform3f(this.lightingBaselineLocation, this.clearColor[0], this.clearColor[1], this.clearColor[2]);
    gl.uniform2f(this.lightingSourceLocation, options.source[0], options.source[1]);
    gl.uniform3f(this.lightingColorLocation, options.color[0], options.color[1], options.color[2]);
    gl.uniform1f(this.lightingRadiusLocation, options.radius);
    gl.uniform1f(this.lightingEnvironmentLocation, options.environmentStrength);
    gl.uniform1f(this.lightingShaftLocation, options.shaftStrength);
    gl.uniform1f(this.lightingShaftLengthLocation, options.shaftLength);
    gl.uniform1f(this.lightingTimeLocation, options.timeSeconds);
    gl.uniform1f(this.lightingAspectLocation, this.device.canvas.width / Math.max(1, this.device.canvas.height));
    this.lightingOccluderData.fill(0);
    this.lightingOccluderRadii.fill(0);
    for (let index = 0; index < options.occluders.length; index += 1) {
      const occluder = options.occluders[index]!;
      const offset = index * 4;
      this.lightingOccluderData[offset] = occluder.a[0];
      this.lightingOccluderData[offset + 1] = occluder.a[1];
      this.lightingOccluderData[offset + 2] = occluder.b[0];
      this.lightingOccluderData[offset + 3] = occluder.b[1];
      this.lightingOccluderRadii[index] = occluder.radius;
    }
    gl.uniform1i(this.lightingOccluderCountLocation, options.occluders.length);
    gl.uniform4fv(this.lightingOccludersLocation, this.lightingOccluderData);
    gl.uniform1fv(this.lightingOccluderRadiiLocation, this.lightingOccluderRadii);
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

export interface BloomBlurPassDirections {
  readonly horizontal: readonly [number, number];
  readonly vertical: readonly [number, number];
}

/**
 * Splits the authored radius across repeated passes and slightly rotates each
 * separable pair. Reusing one large axis-aligned offset creates a visible
 * sampling lattice at full resolution; decorrelated sub-pixel directions
 * converge toward a smooth Gaussian instead.
 */
export function bloomBlurPassDirections(radius: number, iterations: number, index: number): BloomBlurPassDirections {
  const safeIterations = Math.max(1, Math.floor(iterations));
  const safeIndex = Math.max(0, Math.floor(index));
  const phase = (safeIndex * 0.7548776662466927 + 0.5) % 1;
  const step = Math.min(4, Math.max(0.01, radius) / Math.sqrt(safeIterations) * (0.92 + phase * 0.16));
  const angle = (phase - 0.5) * 0.24;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return Object.freeze({
    horizontal: Object.freeze([cosine * step, sine * step] as const),
    vertical: Object.freeze([-sine * step, cosine * step] as const),
  });
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

export const BLOOM_FILTER_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_texel;
uniform vec2 u_direction;
uniform float u_threshold;
uniform vec3 u_baseline;
uniform float u_isolateBaseline;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 center = texture(u_texture, v_uv).rgb;
  if (dot(u_direction, u_direction) < 0.000001) {
    center = max(vec3(0.0), center - u_baseline * u_isolateBaseline);
    float brightness = max(center.r, max(center.g, center.b));
    float kneeStart = max(0.0, u_threshold - 0.18);
    float kneeEnd = max(kneeStart + 0.0001, u_threshold);
    float contribution = smoothstep(kneeStart, kneeEnd, brightness);
    outColor = vec4(center * contribution, 1.0);
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

export const LIGHTING_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_emissive;
uniform vec2 u_emissiveTexel;
uniform vec3 u_baseline;
uniform vec2 u_source;
uniform vec3 u_color;
uniform float u_radius;
uniform float u_environment;
uniform float u_shafts;
uniform float u_shaftLength;
uniform float u_time;
uniform float u_aspect;
uniform int u_occluderCount;
uniform vec4 u_occluders[16];
uniform float u_occluderRadii[16];
in vec2 v_uv;
out vec4 outColor;
vec2 aspectPoint(vec2 point){return vec2(point.x*u_aspect,point.y);}
float pointSegmentDistance(vec2 point,vec2 a,vec2 b){
  vec2 ab=b-a;
  return length(point-(a+ab*clamp(dot(point-a,ab)/max(0.000001,dot(ab,ab)),0.0,1.0)));
}
float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
bool segmentsIntersect(vec2 a,vec2 b,vec2 c,vec2 d){
  vec2 ab=b-a;
  vec2 cd=d-c;
  float denominator=cross2(ab,cd);
  if(abs(denominator)<0.000001)return false;
  float t=cross2(c-a,cd)/denominator;
  float u=cross2(c-a,ab)/denominator;
  return t>=0.0&&t<=1.0&&u>=0.0&&u<=1.0;
}
float segmentDistance(vec2 a,vec2 b,vec2 c,vec2 d){
  if(segmentsIntersect(a,b,c,d))return 0.0;
  return min(min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d)),min(pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b)));
}
float shaftVisibility(vec2 pixel,vec2 emitter){
  vec2 target=aspectPoint(pixel);
  vec2 source=aspectPoint(emitter);
  float rayLength=length(source-target);
  if(rayLength<0.0001)return 1.0;
  for(int index=0;index<16;index++){
    if(index>=u_occluderCount)break;
    vec4 raw=u_occluders[index];
    vec2 a=aspectPoint(raw.xy);
    vec2 b=aspectPoint(raw.zw);
    float radius=u_occluderRadii[index];
    if(segmentDistance(target,source,a,b)<radius)return 0.0;
  }
  return 1.0;
}
vec3 emissiveAt(vec2 uv){
  vec2 safeUv=clamp(uv,vec2(0.001),vec2(0.999));
  vec3 energy=texture(u_emissive,safeUv).rgb*0.42;
  energy+=texture(u_emissive,safeUv+vec2(u_emissiveTexel.x,0.0)).rgb*0.145;
  energy+=texture(u_emissive,safeUv-vec2(u_emissiveTexel.x,0.0)).rgb*0.145;
  energy+=texture(u_emissive,safeUv+vec2(0.0,u_emissiveTexel.y)).rgb*0.145;
  energy+=texture(u_emissive,safeUv-vec2(0.0,u_emissiveTexel.y)).rgb*0.145;
  energy=max(energy-u_baseline,vec3(0.0));
  float peak=max(energy.r,max(energy.g,energy.b));
  return energy*smoothstep(0.06,0.32,peak);
}
float hash12(vec2 point){return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453123);}
void main(){
  vec2 delta=aspectPoint(v_uv)-aspectPoint(u_source);
  float distanceToSource=length(delta);
  float radial=pow(max(0.0,1.0-distanceToSource/max(0.001,u_radius)),2.2)*u_environment;
  radial*=shaftVisibility(v_uv,u_source);
  vec2 towardSource=u_source-v_uv;
  vec2 stepUv=towardSource/24.0;
  float jitter=hash12(floor(v_uv/u_emissiveTexel)+floor(u_time*18.0))*0.8;
  vec2 sampleUv=v_uv+stepUv*jitter;
  vec3 scattered=vec3(0.0);
  float decay=1.0;
  for(int sampleIndex=0;sampleIndex<24;sampleIndex++){
    sampleUv+=stepUv;
    vec3 emission=emissiveAt(sampleUv);
    float emissionPeak=max(emission.r,max(emission.g,emission.b));
    if(emissionPeak>0.002){
      emission*=shaftVisibility(v_uv,sampleUv);
      emission*=mix(0.62,1.38,hash12(floor(sampleUv/u_emissiveTexel)+float(sampleIndex)*17.0));
      scattered+=emission*decay;
    }
    decay*=mix(0.9,0.975,clamp(u_shaftLength*0.5,0.0,1.0));
  }
  scattered/=2.8;
  float shaftEnvelope=exp(-distanceToSource/max(0.001,u_shaftLength))*smoothstep(0.006,0.04,distanceToSource);
  vec3 shafts=scattered*u_color*(shaftEnvelope*u_shafts);
  outColor=vec4(u_color*radial+shafts,1.0);
}`;
