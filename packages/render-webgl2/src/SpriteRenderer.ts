import type { WebGLTextureResource } from './WebGL2Device.js';
import type { WebGL2Device } from './WebGL2Device.js';

export type BlendMode = 'alpha' | 'additive' | 'multiply' | 'opaque';

export interface SpriteTexture {
  readonly id: string;
  readonly texture: WebGLTexture;
}

export interface SpriteCamera2D {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface SpriteInstance {
  readonly texture: SpriteTexture;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly tint?: readonly [number, number, number, number];
  readonly uv?: readonly [number, number, number, number];
  readonly zIndex?: number;
  readonly blend?: BlendMode;
  readonly visible?: boolean;
}

export interface SpriteBatch {
  readonly texture: SpriteTexture;
  readonly blend: BlendMode;
  readonly sprites: readonly SpriteInstance[];
}

export interface SpriteDrawPlan {
  readonly spriteCount: number;
  readonly culledCount: number;
  readonly batches: readonly SpriteBatch[];
}

export interface SpriteRenderTarget {
  readonly resource: WebGLTextureResource;
}

interface MutableSpriteBatch {
  readonly texture: SpriteTexture;
  readonly blend: BlendMode;
  readonly sprites: SpriteInstance[];
}

const INSTANCE_FLOATS = 15;

export function createSpriteCamera2D(
  viewportWidth: number,
  viewportHeight: number,
  options: Partial<Omit<SpriteCamera2D, 'viewportWidth' | 'viewportHeight'>> = {},
): SpriteCamera2D {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new Error('Camera viewport width must be positive');
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) throw new Error('Camera viewport height must be positive');
  const zoom = options.zoom ?? 1;
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Camera zoom must be positive');
  const centerX = options.centerX ?? 0;
  const centerY = options.centerY ?? 0;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) throw new Error('Camera center must be finite');
  return Object.freeze({
    centerX,
    centerY,
    zoom,
    viewportWidth,
    viewportHeight,
  });
}

export function buildSpriteDrawPlan(
  sprites: readonly SpriteInstance[],
  camera: SpriteCamera2D,
): SpriteDrawPlan {
  const visible: Array<{ readonly sprite: SpriteInstance; readonly order: number }> = [];
  let culledCount = 0;
  sprites.forEach((sprite, order) => {
    validateSprite(sprite);
    if (sprite.visible === false || !isSpriteVisible(sprite, camera)) {
      culledCount += 1;
      return;
    }
    visible.push({ sprite, order });
  });
  visible.sort((left, right) => (left.sprite.zIndex ?? 0) - (right.sprite.zIndex ?? 0) || left.order - right.order);

  const batches: MutableSpriteBatch[] = [];
  for (const { sprite } of visible) {
    const blend = sprite.blend ?? 'alpha';
    const previous = batches[batches.length - 1];
    if (previous && previous.texture === sprite.texture && previous.blend === blend) {
      previous.sprites.push(sprite);
    } else {
      batches.push({ texture: sprite.texture, blend, sprites: [sprite] });
    }
  }
  return Object.freeze({
    spriteCount: visible.length,
    culledCount,
    batches: Object.freeze(batches.map((batch) => Object.freeze({ ...batch, sprites: Object.freeze(batch.sprites) }))),
  });
}

export class SpriteRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly cameraLocation: WebGLUniformLocation;
  private readonly viewportLocation: WebGLUniformLocation;
  private readonly textureLocation: WebGLUniformLocation;
  private disposed = false;

  constructor(private readonly device: WebGL2Device) {
    this.gl = device.gl;
    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create sprite vertex array');
    this.quadBuffer = requireValue(this.gl.createBuffer(), 'Unable to create sprite quad buffer');
    this.instanceBuffer = requireValue(this.gl.createBuffer(), 'Unable to create sprite instance buffer');
    this.cameraLocation = requireValue(this.gl.getUniformLocation(this.program, 'u_camera'), 'Sprite camera uniform is missing');
    this.viewportLocation = requireValue(this.gl.getUniformLocation(this.program, 'u_viewport'), 'Sprite viewport uniform is missing');
    this.textureLocation = requireValue(this.gl.getUniformLocation(this.program, 'u_texture'), 'Sprite texture uniform is missing');
    this.configureGeometry();
  }

  render(plan: SpriteDrawPlan, camera: SpriteCamera2D, target?: SpriteRenderTarget): void {
    this.assertUsable();
    if (plan.spriteCount === 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.resource.framebuffer ?? null);
    gl.viewport(0, 0, target?.resource.descriptor.width ?? this.device.canvas.width, target?.resource.descriptor.height ?? this.device.canvas.height);
    gl.useProgram(this.program);
    gl.uniform4f(this.cameraLocation, camera.centerX, camera.centerY, camera.zoom, 0);
    gl.uniform2f(this.viewportLocation, camera.viewportWidth, camera.viewportHeight);
    gl.uniform1i(this.textureLocation, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    for (const batch of plan.batches) {
      configureBlend(gl, batch.blend);
      gl.bindTexture(gl.TEXTURE_2D, batch.texture.texture);
      const data = packSprites(batch.sprites);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.sprites.length);
    }
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteBuffer(this.instanceBuffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private configureGeometry(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    let offset = 0;
    configureInstanceAttribute(gl, 1, 2, stride, offset); offset += 2 * Float32Array.BYTES_PER_ELEMENT;
    configureInstanceAttribute(gl, 2, 2, stride, offset); offset += 2 * Float32Array.BYTES_PER_ELEMENT;
    configureInstanceAttribute(gl, 3, 2, stride, offset); offset += 2 * Float32Array.BYTES_PER_ELEMENT;
    configureInstanceAttribute(gl, 4, 1, stride, offset); offset += Float32Array.BYTES_PER_ELEMENT;
    configureInstanceAttribute(gl, 5, 4, stride, offset); offset += 4 * Float32Array.BYTES_PER_ELEMENT;
    configureInstanceAttribute(gl, 6, 4, stride, offset);
    gl.bindVertexArray(null);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Sprite renderer has been destroyed');
    if (this.device.isContextLost) throw new Error('WebGL2 context is lost');
  }
}

function packSprites(sprites: readonly SpriteInstance[]): Float32Array {
  const data = new Float32Array(sprites.length * INSTANCE_FLOATS);
  let offset = 0;
  for (const sprite of sprites) {
    const tint = sprite.tint ?? [1, 1, 1, 1];
    const uv = sprite.uv ?? [0, 0, 1, 1];
    data.set([
      sprite.x,
      sprite.y,
      sprite.width,
      sprite.height,
      sprite.anchorX ?? 0.5,
      sprite.anchorY ?? 0.5,
      sprite.rotation ?? 0,
      tint[0], tint[1], tint[2], tint[3],
      uv[0], uv[1], uv[2], uv[3],
    ], offset);
    offset += INSTANCE_FLOATS;
  }
  return data;
}

function isSpriteVisible(sprite: SpriteInstance, camera: SpriteCamera2D): boolean {
  const radius = Math.hypot(sprite.width, sprite.height) * 0.5;
  const halfWidth = camera.viewportWidth / camera.zoom * 0.5;
  const halfHeight = camera.viewportHeight / camera.zoom * 0.5;
  return sprite.x + radius >= camera.centerX - halfWidth
    && sprite.x - radius <= camera.centerX + halfWidth
    && sprite.y + radius >= camera.centerY - halfHeight
    && sprite.y - radius <= camera.centerY + halfHeight;
}

function validateSprite(sprite: SpriteInstance): void {
  for (const value of [
    sprite.x,
    sprite.y,
    sprite.width,
    sprite.height,
    sprite.rotation ?? 0,
    sprite.anchorX ?? 0.5,
    sprite.anchorY ?? 0.5,
    sprite.zIndex ?? 0,
    ...(sprite.tint ?? [1, 1, 1, 1]),
    ...(sprite.uv ?? [0, 0, 1, 1]),
  ]) {
    if (!Number.isFinite(value)) throw new Error('Sprite transform values must be finite');
  }
  if (sprite.width < 0 || sprite.height < 0) throw new Error('Sprite dimensions cannot be negative');
}

function configureInstanceAttribute(gl: WebGL2RenderingContext, location: number, size: number, stride: number, offset: number): void {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(location, 1);
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

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create sprite shader program');
  try {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Sprite shader link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`);
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireValue(gl.createShader(type), 'Unable to create sprite shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Sprite shader compilation failed: ${error}`);
  }
  return shader;
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_position;
layout(location = 2) in vec2 a_size;
layout(location = 3) in vec2 a_anchor;
layout(location = 4) in float a_rotation;
layout(location = 5) in vec4 a_tint;
layout(location = 6) in vec4 a_uv;
uniform vec4 u_camera;
uniform vec2 u_viewport;
out vec2 v_uv;
out vec4 v_tint;
void main() {
  vec2 local = (a_corner - a_anchor) * a_size;
  float s = sin(a_rotation);
  float c = cos(a_rotation);
  vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 screen = (a_position + rotated - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2(screen.x / u_viewport.x * 2.0 - 1.0, 1.0 - screen.y / u_viewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = mix(a_uv.xy, a_uv.zw, a_corner);
  v_tint = a_tint;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
in vec2 v_uv;
in vec4 v_tint;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv) * v_tint;
}`;
