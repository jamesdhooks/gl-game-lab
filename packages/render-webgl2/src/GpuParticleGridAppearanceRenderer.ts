import type {
  GpuExternalParticleRenderDiagnostics2D,
  GpuExternalParticleRenderOptions2D,
  GpuParticleGridPointOptions2D,
} from '@hooksjam/gl-game-lab-engine';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import type { GpuParticleGridState } from './GpuParticleGridState.js';
import { GpuParticleGridPointRenderer } from './GpuParticleGridPointRenderer.js';
import { createShaderProgram } from './ShaderProgram.js';
import { TrailFeedbackRenderer } from './TrailFeedbackRenderer.js';

const MAX_PALETTE_COLORS = 8;
const MAX_CURVE_KEYS = 8;

export interface GpuExternalParticleRenderWork2D {
  readonly particleLimit: number;
  readonly renderedParticles: number;
  readonly useStreaks: boolean;
  readonly useTrails: boolean;
  readonly passCount: number;
}

/**
 * Shared appearance pipeline for GPU state produced by a specialized solver.
 * It consumes the solver's textures in place: no state upload or readback.
 */
export class GpuParticleGridAppearanceRenderer {
  private readonly streakProgram: WebGLProgram;
  private readonly streakVao: WebGLVertexArrayObject;
  private readonly trails: TrailFeedbackRenderer;
  private readonly paletteScratch = new Float32Array(MAX_PALETTE_COLORS * 4);
  private readonly sizeCurveScratch = new Float32Array(MAX_CURVE_KEYS * 2);
  private readonly alphaCurveScratch = new Float32Array(MAX_CURVE_KEYS * 2);
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private activeParticles = 0;
  private renderedParticles = 0;
  private pointPasses = 0;
  private streakPasses = 0;
  private trailPasses = 0;
  private compositePasses = 0;
  private paletteUploadBytes = 0;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly points: GpuParticleGridPointRenderer,
  ) {
    this.streakProgram = createShaderProgram(gl, {
      label: 'external GPU particle streak renderer',
      vertexSource: STREAK_VERTEX_SOURCE,
      fragmentSource: STREAK_FRAGMENT_SOURCE,
    });
    this.streakVao = requireValue(gl.createVertexArray(), 'Unable to allocate external particle streak vertex array');
    this.trails = new TrailFeedbackRenderer(gl);
  }

  render(state: GpuParticleGridState, destination: GpuParticleRenderDestination, options: GpuExternalParticleRenderOptions2D): void {
    this.assertUsable();
    validateGpuExternalParticleRenderOptions2D(options);
    const stride = options.renderStride ?? 1;
    const work = resolveGpuExternalParticleRenderWork2D(state.count, options);
    const limit = work.particleLimit;
    const rendered = work.renderedParticles;
    const useStreaks = work.useStreaks;
    const useTrails = work.useTrails;
    let target = destination;
    if (useTrails) {
      const scale = options.trailResolutionScale ?? 1;
      target = this.trails.beginFrame(
        Math.max(1, Math.round(destination.width * scale)),
        Math.max(1, Math.round(destination.height * scale)),
        options.trailPersistence ?? 0.93,
      );
      this.trailPasses += 1;
    }

    const points: GpuParticleGridPointOptions2D = {
      worldWidth: options.worldWidth,
      worldHeight: options.worldHeight,
      radiusScale: options.radiusScale,
      palette: options.palette,
      paletteMode: options.paletteMode ?? 'continuous',
      appearanceSource: options.appearanceSource ?? 'color-seed',
      appearanceRange: options.appearanceRange ?? [0, 1],
      ...(options.sizeCurve ? { sizeCurve: options.sizeCurve } : {}),
      ...(options.alphaCurve ? { alphaCurve: options.alphaCurve } : {}),
      renderStride: stride,
      maxParticles: limit,
      opacity: options.opacity ?? 1,
      blend: options.blend ?? (options.tier === 'basic' ? 'alpha' : 'additive'),
    };
    this.points.render(state, target, points);
    this.pointPasses += 1;
    this.paletteUploadBytes += Math.min(MAX_PALETTE_COLORS, options.palette.length) * 16;

    if (useStreaks) {
      this.renderStreaks(state, target, options, stride, limit);
      this.streakPasses += 1;
      this.paletteUploadBytes += Math.min(MAX_PALETTE_COLORS, options.palette.length) * 16;
    }
    if (useTrails) {
      this.trails.compositeOverlay(destination, options.bloom ?? 1);
      this.compositePasses += 1;
    }
    this.activeParticles = state.count;
    this.renderedParticles = rendered;
  }

  clearHistory(): void { this.trails.clear(); }

  setContextGeneration(generation: number): void { this.generation = generation; }

  diagnostics(): GpuExternalParticleRenderDiagnostics2D {
    return Object.freeze({
      activeParticles: this.activeParticles,
      renderedParticles: this.renderedParticles,
      pointPasses: this.pointPasses,
      streakPasses: this.streakPasses,
      trailPasses: this.trailPasses,
      compositePasses: this.compositePasses,
      paletteUploadBytes: this.paletteUploadBytes,
      contextGeneration: this.generation,
      accuracy: 'exact',
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.trails.dispose();
    this.gl.deleteVertexArray(this.streakVao);
    this.gl.deleteProgram(this.streakProgram);
    this.uniforms.clear();
  }

  private renderStreaks(
    state: GpuParticleGridState,
    destination: GpuParticleRenderDestination,
    options: GpuExternalParticleRenderOptions2D,
    stride: number,
    limit: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.streakProgram);
    gl.bindVertexArray(this.streakVao);
    configureBlend(gl, options.blend ?? 'additive');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.particleA.read.texture);
    gl.uniform1i(this.uniform('uParticleA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.particleB.read.texture);
    gl.uniform1i(this.uniform('uParticleB'), 1);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height);
    gl.uniform1i(this.uniform('uParticleCount'), state.count);
    gl.uniform1i(this.uniform('uRenderStride'), stride);
    gl.uniform2f(this.uniform('uWorldSize'), options.worldWidth, options.worldHeight);
    gl.uniform1f(this.uniform('uPixelScale'), destination.height / options.worldHeight);
    gl.uniform1f(this.uniform('uRadiusScale'), options.radiusScale);
    gl.uniform1f(this.uniform('uStreakLength'), options.streakLength ?? 0);
    gl.uniform1f(this.uniform('uStreakWidth'), options.streakWidth ?? 1);
    gl.uniform1f(this.uniform('uOpacity'), options.opacity ?? 1);
    gl.uniform1i(this.uniform('uPaletteCount'), Math.min(MAX_PALETTE_COLORS, options.palette.length));
    gl.uniform1i(this.uniform('uPaletteMode'), paletteModeCode(options.paletteMode ?? 'continuous'));
    gl.uniform1i(this.uniform('uAppearanceSource'), appearanceSourceCode(options.appearanceSource ?? 'color-seed'));
    const appearanceRange = options.appearanceRange ?? [0, 1];
    gl.uniform2f(this.uniform('uAppearanceRange'), appearanceRange[0], appearanceRange[1]);
    this.paletteScratch.fill(0);
    options.palette.slice(0, MAX_PALETTE_COLORS).forEach((color, index) => this.paletteScratch.set(color, index * 4));
    gl.uniform4fv(this.uniform('uPalette'), this.paletteScratch);
    uploadCurve(gl, this.uniform('uSizeCurve'), this.uniform('uSizeCurveCount'), options.sizeCurve, this.sizeCurveScratch);
    uploadCurve(gl, this.uniform('uAlphaCurve'), this.uniform('uAlphaCurveCount'), options.alphaCurve, this.alphaCurveScratch);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.ceil(limit / stride));
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.streakProgram, name));
    return this.uniforms.get(name) ?? null;
  }

  private assertUsable(): void { if (this.disposed) throw new Error('External GPU particle appearance renderer has been disposed'); }
}

export function validateGpuExternalParticleRenderOptions2D(options: GpuExternalParticleRenderOptions2D): void {
  if (!Number.isFinite(options.worldWidth) || options.worldWidth <= 0 || !Number.isFinite(options.worldHeight) || options.worldHeight <= 0) throw new Error('External particle world dimensions must be positive');
  if (!Number.isFinite(options.radiusScale) || options.radiusScale < 0) throw new Error('External particle radius scale must be non-negative');
  if (options.palette.length < 1 || options.palette.length > MAX_PALETTE_COLORS) throw new Error(`External particle palette requires 1-${MAX_PALETTE_COLORS} colors`);
  if (options.trailPersistence !== undefined && (!Number.isFinite(options.trailPersistence) || options.trailPersistence < 0 || options.trailPersistence > 1)) throw new Error('External particle trail persistence must be between 0 and 1');
  if (options.trailResolutionScale !== undefined && (!Number.isFinite(options.trailResolutionScale) || options.trailResolutionScale <= 0 || options.trailResolutionScale > 1)) throw new Error('External particle trail resolution scale must be in (0, 1]');
  if (options.renderStride !== undefined && (!Number.isSafeInteger(options.renderStride) || options.renderStride < 1)) throw new Error('External particle render stride must be a positive integer');
  if (options.maxParticles !== undefined && (!Number.isSafeInteger(options.maxParticles) || options.maxParticles < 0)) throw new Error('External particle maximum must be a non-negative integer');
  validateCurve(options.sizeCurve, 'size');
  validateCurve(options.alphaCurve, 'alpha');
  if (options.appearanceRange !== undefined && (!options.appearanceRange.every(Number.isFinite) || options.appearanceRange[1] <= options.appearanceRange[0])) throw new Error('External particle appearance range must be finite and increasing');
}

export function resolveGpuExternalParticleRenderWork2D(activeParticles: number, options: GpuExternalParticleRenderOptions2D): GpuExternalParticleRenderWork2D {
  if (!Number.isSafeInteger(activeParticles) || activeParticles < 0) throw new Error('External particle active count must be a non-negative integer');
  validateGpuExternalParticleRenderOptions2D(options);
  const stride = options.renderStride ?? 1;
  const particleLimit = Math.min(activeParticles, options.maxParticles ?? activeParticles);
  const useStreaks = options.tier !== 'basic' && (options.streakLength ?? 0) > 0;
  const useTrails = options.tier === 'ultra' && (options.trailPersistence ?? 0) > 0;
  return Object.freeze({
    particleLimit,
    renderedParticles: Math.ceil(particleLimit / stride),
    useStreaks,
    useTrails,
    passCount: 1 + (useStreaks ? 1 : 0) + (useTrails ? 2 : 0),
  });
}

function validateCurve(curve: GpuExternalParticleRenderOptions2D['sizeCurve'], label: string): void {
  if (!curve) return;
  if (curve.keys.length < 1 || curve.keys.length > MAX_CURVE_KEYS) throw new Error(`External particle ${label} curve requires 1-${MAX_CURVE_KEYS} keys`);
  let previous = -1;
  for (const key of curve.keys) {
    if (!Number.isFinite(key.at) || key.at < 0 || key.at > 1 || key.at <= previous || !Number.isFinite(key.value) || key.value < 0) throw new Error(`External particle ${label} curve keys must be finite, ordered, and non-negative`);
    previous = key.at;
  }
}

function uploadCurve(
  gl: WebGL2RenderingContext,
  keysLocation: WebGLUniformLocation | null,
  countLocation: WebGLUniformLocation | null,
  curve: GpuExternalParticleRenderOptions2D['sizeCurve'],
  scratch: Float32Array,
): void {
  const keys = curve?.keys ?? [{ at: 0, value: 1 }, { at: 1, value: 1 }];
  scratch.fill(0);
  keys.forEach((key, index) => { scratch[index * 2] = key.at; scratch[index * 2 + 1] = key.value; });
  gl.uniform2fv(keysLocation, scratch);
  gl.uniform1i(countLocation, keys.length);
}

function paletteModeCode(mode: NonNullable<GpuExternalParticleRenderOptions2D['paletteMode']>): number {
  return mode === 'continuous' ? 2 : mode === 'indexed' ? 1 : 0;
}

function appearanceSourceCode(source: NonNullable<GpuExternalParticleRenderOptions2D['appearanceSource']>): number {
  return source === 'speed' ? 1 : source === 'foam' ? 2 : 0;
}

function configureBlend(gl: WebGL2RenderingContext, mode: 'alpha' | 'additive'): void {
  gl.enable(gl.BLEND);
  if (mode === 'additive') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function requireValue<T>(value: T | null, message: string): T { if (value === null) throw new Error(message); return value; }

const STREAK_VERTEX_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D uParticleA; uniform sampler2D uParticleB; uniform ivec2 uStateSize;
uniform int uParticleCount; uniform int uRenderStride; uniform vec2 uWorldSize; uniform float uPixelScale;
uniform float uRadiusScale; uniform float uStreakLength; uniform float uStreakWidth; uniform float uOpacity;
uniform vec4 uPalette[${MAX_PALETTE_COLORS}]; uniform int uPaletteCount; uniform int uPaletteMode;
uniform int uAppearanceSource; uniform vec2 uAppearanceRange;
uniform vec2 uSizeCurve[${MAX_CURVE_KEYS}]; uniform int uSizeCurveCount;
uniform vec2 uAlphaCurve[${MAX_CURVE_KEYS}]; uniform int uAlphaCurveCount;
out vec4 vColor; out vec2 vUv;
float hash(float value) { return fract(sin(value * 12.9898) * 43758.5453); }
float sampleCurve(vec2 keys[${MAX_CURVE_KEYS}], int count, float value) {
  if (count <= 0) return 1.0; vec2 previous = keys[0]; if (value <= previous.x) return previous.y;
  for (int i = 1; i < ${MAX_CURVE_KEYS}; i++) { if (i >= count) break; vec2 next = keys[i];
    if (value <= next.x) return mix(previous.y, next.y, clamp((value - previous.x) / max(0.0001, next.x - previous.x), 0.0, 1.0)); previous = next; }
  return previous.y;
}
vec4 palette(float seed, float material) {
  int count = max(1, uPaletteCount);
  if (uPaletteMode == 2) { float scaled = clamp(material, 0.0, 1.0) * float(max(0, count - 1)); int lower = clamp(int(floor(scaled)), 0, ${MAX_PALETTE_COLORS - 1}); return mix(uPalette[lower], uPalette[min(count - 1, lower + 1)], fract(scaled)); }
  int index = uPaletteMode == 1 ? int(mod(floor(seed), float(count))) : int(floor(hash(seed + 1.0) * float(count)));
  return uPalette[clamp(index, 0, ${MAX_PALETTE_COLORS - 1})];
}
void main() {
  int particleIndex = gl_InstanceID * uRenderStride; int x = particleIndex % uStateSize.x; int y = particleIndex / uStateSize.x;
  vec4 a = texelFetch(uParticleA, ivec2(x, y), 0); vec4 b = texelFetch(uParticleB, ivec2(x, y), 0);
  float alive = float(particleIndex < uParticleCount) * step(0.5, a.a); vec2 velocity = b.xy; float speed = length(velocity);
  float source = uAppearanceSource == 1 ? speed : (uAppearanceSource == 2 ? clamp(a.z, 0.0, 1.0) : hash(b.w + 1.0));
  float material = clamp((source - uAppearanceRange.x) / max(0.0001, uAppearanceRange.y - uAppearanceRange.x), 0.0, 1.0);
  vec2 direction = speed > 0.001 ? velocity / speed : vec2(0.0, 1.0); vec2 normal = vec2(-direction.y, direction.x);
  float authoredLength = min(speed * uStreakLength, max(uWorldSize.x, uWorldSize.y) * 0.24);
  float halfWidth = max(0.25, b.z * uRadiusScale * uStreakWidth * sampleCurve(uSizeCurve, uSizeCurveCount, material));
  vec2 start = a.xy - direction * authoredLength; vec2 end = a.xy;
  const vec2 corners[6] = vec2[6](vec2(0.0,-1.0),vec2(1.0,-1.0),vec2(1.0,1.0),vec2(0.0,-1.0),vec2(1.0,1.0),vec2(0.0,1.0));
  vec2 corner = corners[gl_VertexID]; vec2 world = mix(start, end, corner.x) + normal * corner.y * halfWidth;
  vec2 clip = vec2(world.x / uWorldSize.x * 2.0 - 1.0, 1.0 - world.y / uWorldSize.y * 2.0);
  gl_Position = alive > 0.0 ? vec4(clip, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);
  vUv = corner; vColor = palette(b.w, material); vColor.a *= alive * uOpacity * sampleCurve(uAlphaCurve, uAlphaCurveCount, material);
}`;

const STREAK_FRAGMENT_SOURCE = `#version 300 es
precision highp float; in vec4 vColor; in vec2 vUv; out vec4 outColor;
void main() { float edge = smoothstep(1.0, 0.35, abs(vUv.y)); float head = mix(0.18, 1.0, vUv.x); outColor = vec4(vColor.rgb * head, vColor.a * edge * head); }`;
