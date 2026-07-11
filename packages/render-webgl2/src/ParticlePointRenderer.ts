import type { BlendMode, SpriteCamera2D, SpriteRenderTarget } from './SpriteRenderer.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { createShaderProgram, requireShaderUniform } from './ShaderProgram.js';

export const MAX_PARTICLE_PALETTE_COLORS = 16;

export interface ParticlePointBatch {
  readonly id: string;
  readonly count: number;
  readonly positions: Float32Array;
  readonly radii: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly palette: readonly (readonly [number, number, number, number])[];
  readonly blend?: BlendMode;
  readonly opacity?: number;
}

export interface ParticlePointDrawPlan {
  readonly particleCount: number;
  readonly drawCalls: number;
  readonly batches: readonly ParticlePointBatch[];
}

export function buildParticlePointDrawPlan(batches: readonly ParticlePointBatch[]): ParticlePointDrawPlan {
  const visible: ParticlePointBatch[] = [];
  let particleCount = 0;
  for (const batch of batches) {
    validateBatch(batch);
    if (batch.count === 0 || (batch.opacity ?? 1) === 0) continue;
    visible.push(batch);
    particleCount += batch.count;
  }
  return Object.freeze({ particleCount, drawCalls: visible.length, batches: Object.freeze(visible) });
}

export class ParticlePointRenderQueue {
  private readonly batches: ParticlePointBatch[] = [];

  submit(batch: ParticlePointBatch): void {
    validateBatch(batch);
    this.batches.push(batch);
  }

  buildPlan(): ParticlePointDrawPlan {
    return buildParticlePointDrawPlan(this.batches);
  }

  clear(): void {
    this.batches.length = 0;
  }

  get count(): number {
    let count = 0;
    for (const batch of this.batches) count += batch.count;
    return count;
  }
}

export class ParticlePointRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly positionBuffer: WebGLBuffer;
  private readonly radiusBuffer: WebGLBuffer;
  private readonly seedBuffer: WebGLBuffer;
  private readonly cameraLocation: WebGLUniformLocation;
  private readonly viewportLocation: WebGLUniformLocation;
  private readonly pixelRatioLocation: WebGLUniformLocation;
  private readonly opacityLocation: WebGLUniformLocation;
  private readonly paletteLocation: WebGLUniformLocation;
  private readonly paletteCountLocation: WebGLUniformLocation;
  private readonly paletteData = new Float32Array(MAX_PARTICLE_PALETTE_COLORS * 4);
  private disposed = false;

  constructor(private readonly device: WebGL2Device) {
    this.gl = device.gl;
    this.program = createShaderProgram(this.gl, { label: 'particle point renderer', vertexSource: VERTEX_SHADER, fragmentSource: FRAGMENT_SHADER });
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create particle vertex array');
    this.positionBuffer = requireValue(this.gl.createBuffer(), 'Unable to create particle position buffer');
    this.radiusBuffer = requireValue(this.gl.createBuffer(), 'Unable to create particle radius buffer');
    this.seedBuffer = requireValue(this.gl.createBuffer(), 'Unable to create particle seed buffer');
    this.cameraLocation = requireShaderUniform(this.gl, this.program, 'u_camera', 'particle point renderer');
    this.viewportLocation = requireShaderUniform(this.gl, this.program, 'u_viewport', 'particle point renderer');
    this.pixelRatioLocation = requireShaderUniform(this.gl, this.program, 'u_pixelRatio', 'particle point renderer');
    this.opacityLocation = requireShaderUniform(this.gl, this.program, 'u_opacity', 'particle point renderer');
    this.paletteLocation = requireShaderUniform(this.gl, this.program, 'u_palette[0]', 'particle point renderer');
    this.paletteCountLocation = requireShaderUniform(this.gl, this.program, 'u_paletteCount', 'particle point renderer');
    this.configureGeometry();
  }

  render(plan: ParticlePointDrawPlan, camera: SpriteCamera2D, target?: SpriteRenderTarget): void {
    this.assertUsable();
    if (plan.particleCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.resource.framebuffer ?? null);
    const targetWidth = target?.resource.descriptor.width ?? this.device.canvas.width;
    const targetHeight = target?.resource.descriptor.height ?? this.device.canvas.height;
    gl.viewport(0, 0, targetWidth, targetHeight);
    gl.uniform4f(this.cameraLocation, camera.centerX, camera.centerY, camera.zoom, 0);
    gl.uniform2f(this.viewportLocation, camera.viewportWidth, camera.viewportHeight);
    gl.uniform1f(this.pixelRatioLocation, targetWidth / camera.viewportWidth);
    gl.bindVertexArray(this.vao);
    for (const batch of plan.batches) this.drawBatch(batch);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteBuffer(this.positionBuffer);
    this.gl.deleteBuffer(this.radiusBuffer);
    this.gl.deleteBuffer(this.seedBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private configureGeometry(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.radiusBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private drawBatch(batch: ParticlePointBatch): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.positions.subarray(0, batch.count * 2), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.radiusBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.radii.subarray(0, batch.count), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.colorSeeds.subarray(0, batch.count), gl.DYNAMIC_DRAW);
    this.paletteData.fill(0);
    batch.palette.forEach((color, index) => { this.paletteData.set(color, index * 4); });
    gl.uniform4fv(this.paletteLocation, this.paletteData);
    gl.uniform1i(this.paletteCountLocation, batch.palette.length);
    gl.uniform1f(this.opacityLocation, batch.opacity ?? 1);
    configureBlend(gl, batch.blend ?? 'alpha');
    gl.drawArrays(gl.POINTS, 0, batch.count);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Particle point renderer has been destroyed');
    if (this.device.isContextLost) throw new Error('WebGL2 context is lost');
  }
}

function validateBatch(batch: ParticlePointBatch): void {
  if (!Number.isSafeInteger(batch.count) || batch.count < 0) throw new Error('Particle count must be a non-negative integer');
  if (batch.positions.length < batch.count * 2) throw new Error('Particle positions do not cover the active count');
  if (batch.radii.length < batch.count) throw new Error('Particle radii do not cover the active count');
  if (batch.colorSeeds.length < batch.count) throw new Error('Particle color seeds do not cover the active count');
  if (batch.palette.length < 1 || batch.palette.length > MAX_PARTICLE_PALETTE_COLORS) {
    throw new Error(`Particle palette must contain between 1 and ${MAX_PARTICLE_PALETTE_COLORS} colors`);
  }
  for (const color of batch.palette) {
    if (color.length !== 4 || !color.every((component) => Number.isFinite(component) && component >= 0 && component <= 1)) {
      throw new Error('Particle palette components must be between zero and one');
    }
  }
  if (batch.opacity !== undefined && (!Number.isFinite(batch.opacity) || batch.opacity < 0 || batch.opacity > 1)) {
    throw new Error('Particle opacity must be between zero and one');
  }
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

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_radius;
layout(location = 2) in float a_colorSeed;
uniform vec4 u_camera;
uniform vec2 u_viewport;
uniform float u_pixelRatio;
flat out float v_colorSeed;
void main() {
  vec2 screen = (a_position - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2(screen.x / u_viewport.x * 2.0 - 1.0, 1.0 - screen.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = max(1.0, a_radius * 2.0 * u_camera.z * u_pixelRatio);
  v_colorSeed = a_colorSeed;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
const int MAX_PALETTE = ${MAX_PARTICLE_PALETTE_COLORS};
uniform vec4 u_palette[MAX_PALETTE];
uniform int u_paletteCount;
uniform float u_opacity;
flat in float v_colorSeed;
out vec4 outColor;
uint hashId(int id) {
  uint value = uint(id) * 747796405u + 2891336453u;
  value = ((value >> 16) ^ value) * 2246822519u;
  value = ((value >> 13) ^ value) * 3266489917u;
  return (value >> 16) ^ value;
}
void main() {
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  float distance2 = dot(centered, centered);
  if (distance2 > 1.0) discard;
  int paletteIndex = int(hashId(int(abs(v_colorSeed) + 0.5)) % uint(max(1, u_paletteCount)));
  vec4 color = u_palette[paletteIndex];
  float edge = smoothstep(1.0, 0.86, distance2);
  float z = sqrt(max(0.0, 1.0 - distance2 * 0.45));
  vec3 normal = normalize(vec3(centered * 0.65, z));
  float light = 0.38 + 0.62 * max(0.0, dot(normal, normalize(vec3(-0.35, -0.55, 0.9))));
  vec3 rim = vec3(0.18, 0.24, 0.35) * (1.0 - z) * 0.4;
  outColor = vec4(color.rgb * light + rim, color.a * edge * u_opacity);
}`;
