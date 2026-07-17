import { createGpuDoubleRenderTarget, type GpuDoubleRenderTarget } from './GpuRenderTarget.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';

export interface TrailFeedbackOptions {
  readonly fade?: number;
  readonly bloom?: number;
}

export interface NormalizedTrailFeedbackOptions {
  readonly fade: number;
  readonly bloom: number;
}

export function normalizeTrailFeedbackOptions(options: TrailFeedbackOptions = {}): NormalizedTrailFeedbackOptions {
  return Object.freeze({
    fade: range(options.fade ?? 0.932, 0, 1, 'Trail fade'),
    bloom: range(options.bloom ?? 1.82, 0, 16, 'Trail bloom'),
  });
}

export class TrailFeedbackRenderer {
  private readonly fadeProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fadeTrailLocation: WebGLUniformLocation;
  private readonly fadeAmountLocation: WebGLUniformLocation;
  private readonly compositeTrailLocation: WebGLUniformLocation;
  private readonly compositeBackgroundLocation: WebGLUniformLocation;
  private readonly compositeBloomLocation: WebGLUniformLocation;
  private targets: GpuDoubleRenderTarget | undefined;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.fadeProgram = createShaderProgram(gl, { label: 'trail feedback fade', vertexSource: VERTEX_SHADER, fragmentSource: FADE_SHADER });
    const composite = createShaderProgram(gl, { label: 'trail feedback composite', vertexSource: VERTEX_SHADER, fragmentSource: COMPOSITE_SHADER });
    try {
      this.compositeProgram = composite;
      this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate trail feedback vertex array');
      this.fadeTrailLocation = requireShaderUniform(gl, this.fadeProgram, 'uTrail', 'trail feedback fade');
      this.fadeAmountLocation = requireShaderUniform(gl, this.fadeProgram, 'uFade', 'trail feedback fade');
      this.compositeTrailLocation = requireShaderUniform(gl, composite, 'uTrail', 'trail feedback composite');
      this.compositeBackgroundLocation = requireShaderUniform(gl, composite, 'uBackground', 'trail feedback composite');
      this.compositeBloomLocation = requireShaderUniform(gl, composite, 'uBloom', 'trail feedback composite');
    } catch (error) {
      gl.deleteProgram(this.fadeProgram);
      gl.deleteProgram(composite);
      throw error;
    }
  }

  beginFrame(width: number, height: number, fade: number): GpuParticleRenderDestination {
    this.assertUsable();
    this.ensureTargets(width, height);
    const targets = requireValue(this.targets, 'Trail feedback targets are unavailable');
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.write.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.fadeProgram);
    gl.bindVertexArray(this.vao);
    targets.read.attach(0);
    gl.uniform1i(this.fadeTrailLocation, 0);
    gl.uniform1f(this.fadeAmountLocation, range(fade, 0, 1, 'Trail fade'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: targets.write.framebuffer, width: this.width, height: this.height };
  }

  composite(destination: GpuParticleRenderDestination, background: readonly [number, number, number], bloom: number): void {
    this.compositeInternal(destination, background, bloom, false);
  }

  /** Composites trail history over an existing scene without replacing its color. */
  compositeOverlay(destination: GpuParticleRenderDestination, bloom: number): void {
    this.compositeInternal(destination, [0, 0, 0], bloom, true);
  }

  private compositeInternal(destination: GpuParticleRenderDestination, background: readonly [number, number, number], bloom: number, overlay: boolean): void {
    this.assertUsable();
    const targets = requireValue(this.targets, 'Trail feedback beginFrame must run before composite');
    targets.swap();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    if (overlay) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else gl.disable(gl.BLEND);
    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.vao);
    targets.read.attach(0);
    gl.uniform1i(this.compositeTrailLocation, 0);
    gl.uniform3f(this.compositeBackgroundLocation, ...background);
    gl.uniform1f(this.compositeBloomLocation, range(bloom, 0, 16, 'Trail bloom'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (overlay) gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clear(): void { this.targets?.clear(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.targets?.dispose();
    this.targets = undefined;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.fadeProgram);
    this.gl.deleteProgram(this.compositeProgram);
  }

  private ensureTargets(width: number, height: number): void {
    const nextWidth = dimension(width, 'Trail width');
    const nextHeight = dimension(height, 'Trail height');
    if (this.targets && nextWidth === this.width && nextHeight === this.height) return;
    this.targets?.dispose();
    this.targets = createGpuDoubleRenderTarget(this.gl, { width: nextWidth, height: nextHeight, precision: 'half-float', filter: 'linear' });
    this.targets.clear();
    this.width = nextWidth;
    this.height = nextHeight;
  }

  private assertUsable(): void { if (this.disposed) throw new Error('Trail feedback renderer has been disposed'); }
}

function range(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return value;
}

function dimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function requireValue<T>(value: T | null | undefined, message: string): T { if (value == null) throw new Error(message); return value; }

const VERTEX_SHADER = `#version 300 es
const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() { vec2 p = POSITIONS[gl_VertexID]; vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FADE_SHADER = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTrail; uniform float uFade;
void main() { outColor = texture(uTrail, vUv) * uFade; }`;

const COMPOSITE_SHADER = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTrail; uniform vec3 uBackground; uniform float uBloom;
void main() {
  vec3 trail = texture(uTrail, vUv).rgb;
  vec3 glow = trail * (1.0 + max(0.0, uBloom) * 0.42);
  vec3 color = uBackground + glow;
  outColor = vec4(color / (1.0 + color * 0.32), 1.0);
}`;
