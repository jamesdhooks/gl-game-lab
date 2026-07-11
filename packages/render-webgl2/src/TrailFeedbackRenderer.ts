import { createGpuDoubleRenderTarget, type GpuDoubleRenderTarget } from './GpuRenderTarget.js';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';

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
  private targets: GpuDoubleRenderTarget | undefined;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.fadeProgram = createProgram(gl, VERTEX_SHADER, FADE_SHADER);
    try {
      this.compositeProgram = createProgram(gl, VERTEX_SHADER, COMPOSITE_SHADER);
      this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate trail feedback vertex array');
    } catch (error) {
      gl.deleteProgram(this.fadeProgram);
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
    gl.uniform1i(gl.getUniformLocation(this.fadeProgram, 'uTrail'), 0);
    gl.uniform1f(gl.getUniformLocation(this.fadeProgram, 'uFade'), range(fade, 0, 1, 'Trail fade'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: targets.write.framebuffer, width: this.width, height: this.height };
  }

  composite(destination: GpuParticleRenderDestination, background: readonly [number, number, number], bloom: number): void {
    this.assertUsable();
    const targets = requireValue(this.targets, 'Trail feedback beginFrame must run before composite');
    targets.swap();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.vao);
    targets.read.attach(0);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uTrail'), 0);
    gl.uniform3f(gl.getUniformLocation(this.compositeProgram, 'uBackground'), ...background);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'uBloom'), range(bloom, 0, 16, 'Trail bloom'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireValue(gl.createProgram(), 'Unable to create trail feedback program');
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Trail feedback shader link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireValue(gl.createShader(type), 'Unable to create trail feedback shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Trail feedback shader compilation failed: ${detail}`);
  }
  return shader;
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
