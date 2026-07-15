import type { GpuParticleGridPointOptions2D } from '@hooksjam/gl-game-lab-engine';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import { createShaderProgram } from './ShaderProgram.js';
import type { GpuParticleGridState } from './GpuParticleGridState.js';
import type { BlendMode } from './SpriteRenderer.js';

const MAX_PALETTE_COLORS = 8;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D uParticleA;
uniform sampler2D uParticleB;
uniform ivec2 uStateSize;
uniform int uParticleCount;
uniform vec2 uWorldSize;
uniform float uRadiusScale;
uniform float uPixelScale;
uniform vec4 uPalette[${MAX_PALETTE_COLORS}];
uniform int uPaletteCount;
uniform int uPaletteMode;
uniform float uOpacity;
out vec4 vColor;
float hash(float value) {
  return fract(sin(value * 12.9898) * 43758.5453);
}
void main() {
  int index = gl_VertexID;
  int x = index % uStateSize.x;
  int y = index / uStateSize.x;
  vec4 particleA = texelFetch(uParticleA, ivec2(x, y), 0);
  vec4 particleB = texelFetch(uParticleB, ivec2(x, y), 0);
  float alive = float(index < uParticleCount) * step(0.5, particleA.a);
  vec2 position = particleA.xy;
  float radius = max(0.0, particleB.z);
  float seed = particleB.w;
  int paletteCount = max(1, uPaletteCount);
  int colorIndex = 0;
  if (uPaletteMode == 1) {
    colorIndex = int(mod(floor(seed), float(paletteCount)));
  } else {
    colorIndex = int(floor(hash(seed + 1.0) * float(paletteCount)));
  }
  colorIndex = clamp(colorIndex, 0, ${MAX_PALETTE_COLORS - 1});
  vec4 color = uPalette[colorIndex];
  color.a *= uOpacity * alive;
  vColor = color;
  vec2 clip = vec2(position.x / max(1.0, uWorldSize.x) * 2.0 - 1.0, 1.0 - position.y / max(1.0, uWorldSize.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = max(0.0, radius * uRadiusScale * uPixelScale * alive);
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float distanceFromCenter = dot(uv, uv);
  if (distanceFromCenter > 1.0) discard;
  float edge = smoothstep(1.0, 0.72, distanceFromCenter);
  fragColor = vec4(vColor.rgb, vColor.a * edge);
}`;

export class GpuParticleGridPointRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly paletteScratch = new Float32Array(MAX_PALETTE_COLORS * 4);
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createShaderProgram(gl, {
      label: 'GPU particle-grid point renderer',
      vertexSource: VERTEX_SOURCE,
      fragmentSource: FRAGMENT_SOURCE,
    });
    this.vao = requireValue(gl.createVertexArray(), 'Unable to allocate GPU particle-grid point vertex array');
  }

  render(state: GpuParticleGridState, destination: GpuParticleRenderDestination, options: GpuParticleGridPointOptions2D): void {
    this.assertUsable();
    validateOptions(options);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer ?? null);
    gl.viewport(0, 0, destination.width, destination.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    configureBlend(gl, options.blend ?? 'alpha');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.particleA.read.texture);
    gl.uniform1i(this.uniform('uParticleA'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.particleB.read.texture);
    gl.uniform1i(this.uniform('uParticleB'), 1);
    gl.uniform2i(this.uniform('uStateSize'), state.width, state.height);
    gl.uniform1i(this.uniform('uParticleCount'), state.count);
    gl.uniform2f(this.uniform('uWorldSize'), options.worldWidth, options.worldHeight);
    gl.uniform1f(this.uniform('uRadiusScale'), options.radiusScale);
    gl.uniform1f(this.uniform('uPixelScale'), destination.height / Math.max(1, options.worldHeight));
    gl.uniform1i(this.uniform('uPaletteCount'), Math.min(MAX_PALETTE_COLORS, options.palette.length));
    gl.uniform1i(this.uniform('uPaletteMode'), options.paletteMode === 'indexed' ? 1 : 0);
    gl.uniform1f(this.uniform('uOpacity'), options.opacity);
    this.paletteScratch.fill(0);
    options.palette.slice(0, MAX_PALETTE_COLORS).forEach((color, index) => {
      this.paletteScratch.set(color, index * 4);
    });
    gl.uniform4fv(this.uniform('uPalette'), this.paletteScratch);
    gl.drawArrays(gl.POINTS, 0, state.count);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('GPU particle-grid point renderer has been disposed');
  }
}

function validateOptions(options: GpuParticleGridPointOptions2D): void {
  if (!Number.isFinite(options.worldWidth) || options.worldWidth <= 0) throw new Error('GPU particle-grid point world width must be positive');
  if (!Number.isFinite(options.worldHeight) || options.worldHeight <= 0) throw new Error('GPU particle-grid point world height must be positive');
  if (!Number.isFinite(options.radiusScale) || options.radiusScale < 0) throw new Error('GPU particle-grid point radius scale must be non-negative');
  if (!Number.isFinite(options.opacity) || options.opacity < 0) throw new Error('GPU particle-grid point opacity must be non-negative');
  if (options.palette.length < 1) throw new Error('GPU particle-grid point renderer requires at least one palette color');
}

function configureBlend(gl: WebGL2RenderingContext, mode: BlendMode): void {
  if (mode === 'opaque') {
    gl.disable(gl.BLEND);
    return;
  }
  gl.enable(gl.BLEND);
  if (mode === 'additive') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else if (mode === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}
