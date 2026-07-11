import type { SpriteRenderTarget } from './SpriteRenderer.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';

export interface PaletteBackdropOptions {
  readonly base: readonly [number, number, number, number];
  readonly palette: readonly (readonly [number, number, number, number])[];
  readonly tier?: number;
  readonly blendStrength?: number;
}

export interface NormalizedPaletteBackdropOptions {
  readonly base: readonly [number, number, number];
  readonly primary: readonly [number, number, number];
  readonly secondary: readonly [number, number, number];
  readonly accent: readonly [number, number, number];
  readonly tier: number;
}

export function normalizePaletteBackdropOptions(options: PaletteBackdropOptions): NormalizedPaletteBackdropOptions {
  const base = rgb(options.base, 'Backdrop base');
  if (options.palette.length === 0) throw new Error('Backdrop palette requires at least one color');
  const primary = rgb(options.palette[0] ?? options.base, 'Backdrop primary');
  const secondary = rgb(options.palette[1] ?? options.palette[2] ?? options.palette[0] ?? options.base, 'Backdrop secondary');
  const accent = rgb(options.palette[3] ?? options.palette[2] ?? options.palette[1] ?? options.palette[0] ?? options.base, 'Backdrop accent');
  const tier = range(options.tier ?? 0.55, 0, 1, 'Backdrop tier');
  const blendStrength = range(options.blendStrength ?? 0.12, 0, 1, 'Backdrop blend strength');
  const paletteBase = mix(primary, secondary, 0.45);
  return Object.freeze({
    base: Object.freeze(mix(base, paletteBase, blendStrength)),
    primary: Object.freeze(primary),
    secondary: Object.freeze(secondary),
    accent: Object.freeze(accent),
    tier,
  });
}

export class PaletteBackdropRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly viewportLocation: WebGLUniformLocation;
  private readonly baseLocation: WebGLUniformLocation;
  private readonly primaryLocation: WebGLUniformLocation;
  private readonly secondaryLocation: WebGLUniformLocation;
  private readonly accentLocation: WebGLUniformLocation;
  private readonly tierLocation: WebGLUniformLocation;
  private configuration: NormalizedPaletteBackdropOptions | undefined;
  private disposed = false;

  constructor(private readonly device: WebGL2Device) {
    this.gl = device.gl;
    this.program = createShaderProgram(this.gl, { label: 'palette backdrop', vertexSource: VERTEX_SHADER, fragmentSource: FRAGMENT_SHADER });
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create backdrop vertex array');
    this.viewportLocation = requireShaderUniform(this.gl, this.program, 'u_viewport', 'palette backdrop');
    this.baseLocation = requireShaderUniform(this.gl, this.program, 'u_base', 'palette backdrop');
    this.primaryLocation = requireShaderUniform(this.gl, this.program, 'u_primary', 'palette backdrop');
    this.secondaryLocation = requireShaderUniform(this.gl, this.program, 'u_secondary', 'palette backdrop');
    this.accentLocation = requireShaderUniform(this.gl, this.program, 'u_accent', 'palette backdrop');
    this.tierLocation = requireShaderUniform(this.gl, this.program, 'u_tier', 'palette backdrop');
  }

  configure(options: PaletteBackdropOptions | undefined): void {
    this.assertUsable();
    this.configuration = options ? normalizePaletteBackdropOptions(options) : undefined;
  }

  get enabled(): boolean {
    return this.configuration !== undefined;
  }

  render(target?: SpriteRenderTarget): void {
    this.assertUsable();
    const options = this.configuration;
    if (!options) return;
    const gl = this.gl;
    const width = target?.resource.descriptor.width ?? this.device.canvas.width;
    const height = target?.resource.descriptor.height ?? this.device.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.resource.framebuffer ?? null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.viewportLocation, width, height);
    gl.uniform3fv(this.baseLocation, options.base);
    gl.uniform3fv(this.primaryLocation, options.primary);
    gl.uniform3fv(this.secondaryLocation, options.secondary);
    gl.uniform3fv(this.accentLocation, options.accent);
    gl.uniform1f(this.tierLocation, options.tier);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Palette backdrop renderer has been destroyed');
    if (this.device.isContextLost) throw new Error('WebGL2 context is lost');
  }
}

function rgb(color: readonly number[], label: string): [number, number, number] {
  if (color.length < 3 || !color.slice(0, 3).every((component) => Number.isFinite(component) && component >= 0 && component <= 1)) {
    throw new Error(`${label} components must be between zero and one`);
  }
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0];
}

function mix(from: readonly [number, number, number], to: readonly [number, number, number], amount: number): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function range(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return value;
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 u_viewport;
uniform vec3 u_base;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_accent;
uniform float u_tier;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_viewport;
  float vertical = smoothstep(0.0, 1.0, uv.y);
  float horizon = exp(-pow((uv.y - 0.44) * 4.3, 2.0));
  float vignette = 1.0 - smoothstep(0.28, 0.9, length((uv - 0.5) * vec2(1.22, 1.0))) * 0.42;
  float shimmer = sin((uv.x * 4.6 + uv.y * 2.1) * 3.14159) * 0.5 + 0.5;
  vec3 field = mix(u_base * 0.72 + u_primary * 0.08, u_base * 0.88 + u_secondary * 0.09, vertical);
  field += u_accent * horizon * mix(0.035, 0.1, u_tier);
  field += u_primary * shimmer * horizon * mix(0.012, 0.04, u_tier);
  outColor = vec4(field * vignette, 1.0);
}`;
