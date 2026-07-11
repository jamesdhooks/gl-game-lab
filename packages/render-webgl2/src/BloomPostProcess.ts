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

const DEFAULT_BLOOM: NormalizedBloomOptions = Object.freeze({
  enabled: false,
  threshold: 0.68,
  intensity: 0.9,
  radius: 1,
  iterations: 4,
  resolutionScale: 0.5,
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

/** Shared fullscreen bloom stage. Scene producers render into sceneTarget, then call composite(). */
export class BloomPostProcess {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly filterProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly filterTextureLocation: WebGLUniformLocation;
  private readonly filterTexelLocation: WebGLUniformLocation;
  private readonly filterDirectionLocation: WebGLUniformLocation;
  private readonly filterThresholdLocation: WebGLUniformLocation;
  private readonly compositeSceneLocation: WebGLUniformLocation;
  private readonly compositeBloomLocation: WebGLUniformLocation;
  private readonly compositeIntensityLocation: WebGLUniformLocation;
  private options: NormalizedBloomOptions;
  private scene: WebGLTextureResource | undefined;
  private ping: WebGLTextureResource | undefined;
  private pong: WebGLTextureResource | undefined;
  private disposed = false;

  constructor(private readonly device: WebGL2Device, options: BloomOptions = {}) {
    this.gl = device.gl;
    this.options = normalizeBloomOptions(options);
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create post-process vertex array');
    this.filterProgram = createShaderProgram(this.gl, { label: 'bloom filter', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: FILTER_FRAGMENT_SHADER });
    this.compositeProgram = createShaderProgram(this.gl, { label: 'bloom composite', vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource: COMPOSITE_FRAGMENT_SHADER });
    this.filterTextureLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texture', 'bloom filter');
    this.filterTexelLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_texel', 'bloom filter');
    this.filterDirectionLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_direction', 'bloom filter');
    this.filterThresholdLocation = requireShaderUniform(this.gl, this.filterProgram, 'u_threshold', 'bloom filter');
    this.compositeSceneLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_scene', 'bloom composite');
    this.compositeBloomLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_bloom', 'bloom composite');
    this.compositeIntensityLocation = requireShaderUniform(this.gl, this.compositeProgram, 'u_intensity', 'bloom composite');
  }

  configure(options: BloomOptions): void {
    this.assertUsable();
    const next = normalizeBloomOptions(options);
    const allocationChanged = next.enabled !== this.options.enabled
      || next.resolutionScale !== this.options.resolutionScale;
    this.options = next;
    if (allocationChanged) this.releaseTargets();
  }

  get configuration(): NormalizedBloomOptions {
    return this.options;
  }

  get sceneTarget(): WebGLTextureResource | undefined {
    this.assertUsable();
    if (!this.options.enabled) return undefined;
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
    if (!this.options.enabled) return;
    this.ensureTargets();
    const scene = requireResource(this.scene);
    const ping = requireResource(this.ping);
    const pong = requireResource(this.pong);
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.filterProgram);
    gl.uniform1i(this.filterTextureLocation, 0);
    gl.uniform1f(this.filterThresholdLocation, this.options.threshold);
    this.drawFilter(scene, ping, 0, 0);
    for (let index = 0; index < this.options.iterations; index += 1) {
      this.drawFilter(ping, pong, this.options.radius, 0);
      this.drawFilter(pong, ping, 0, this.options.radius);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.device.canvas.width, this.device.canvas.height);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(this.compositeSceneLocation, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ping.texture);
    gl.uniform1i(this.compositeBloomLocation, 1);
    gl.uniform1f(this.compositeIntensityLocation, this.options.intensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  get stats(): BloomPostProcessStats {
    return Object.freeze({
      enabled: this.options.enabled,
      renderTargetCount: this.scene ? 3 : 0,
      passes: this.options.enabled ? 2 + this.options.iterations * 2 : 0,
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
  }

  private ensureTargets(): void {
    const width = Math.max(1, this.device.canvas.width);
    const height = Math.max(1, this.device.canvas.height);
    if (this.scene?.descriptor.width === width && this.scene.descriptor.height === height && this.ping && this.pong) return;
    this.releaseTargets();
    this.scene = this.device.createTexture({ width, height, renderTarget: true, filter: 'linear' });
    const bloomWidth = Math.max(1, Math.round(width * this.options.resolutionScale));
    const bloomHeight = Math.max(1, Math.round(height * this.options.resolutionScale));
    this.ping = this.device.createTexture({ width: bloomWidth, height: bloomHeight, renderTarget: true, filter: 'linear' });
    this.pong = this.device.createTexture({ width: bloomWidth, height: bloomHeight, renderTarget: true, filter: 'linear' });
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
    this.scene = undefined;
    this.ping = undefined;
    this.pong = undefined;
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
uniform float u_intensity;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 scene = texture(u_scene, v_uv);
  vec3 glow = texture(u_bloom, v_uv).rgb * u_intensity;
  outColor = vec4(scene.rgb + glow, scene.a);
}`;
