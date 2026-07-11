import type { BlendMode, SpriteRenderTarget } from './SpriteRenderer.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { createShaderProgram } from './ShaderProgram.js';

export type FullscreenUniform =
  | { readonly type: '1f'; readonly value: number }
  | { readonly type: '1i'; readonly value: number }
  | { readonly type: '2f'; readonly value: readonly [number, number] }
  | { readonly type: '3f'; readonly value: readonly [number, number, number] }
  | { readonly type: '4f'; readonly value: readonly [number, number, number, number] }
  | { readonly type: '1fv'; readonly value: Float32Array }
  | { readonly type: '4fv'; readonly value: Float32Array };

export interface FullscreenEffect {
  readonly id: string;
  readonly fragmentSource: string;
  readonly uniforms?: Readonly<Record<string, FullscreenUniform>>;
  readonly blend?: BlendMode;
}

export class FullscreenEffectRenderQueue {
  private readonly effects: FullscreenEffect[] = [];

  submit(effect: FullscreenEffect): void {
    validateEffect(effect);
    this.effects.push(effect);
  }

  snapshot(): readonly FullscreenEffect[] {
    return this.effects;
  }

  clear(): void {
    this.effects.length = 0;
  }

  get count(): number {
    return this.effects.length;
  }
}

interface CompiledEffect {
  readonly source: string;
  readonly program: WebGLProgram;
  readonly locations: Map<string, WebGLUniformLocation | null>;
}

export class FullscreenEffectRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly compiled = new Map<string, CompiledEffect>();
  private disposed = false;

  constructor(private readonly device: WebGL2Device) {
    this.gl = device.gl;
    this.vao = requireValue(this.gl.createVertexArray(), 'Unable to create fullscreen effect vertex array');
  }

  render(effects: readonly FullscreenEffect[], target?: SpriteRenderTarget): void {
    this.assertUsable();
    if (effects.length === 0) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.resource.framebuffer ?? null);
    gl.viewport(
      0,
      0,
      target?.resource.descriptor.width ?? this.device.canvas.width,
      target?.resource.descriptor.height ?? this.device.canvas.height,
    );
    gl.bindVertexArray(this.vao);
    for (const effect of effects) this.draw(effect);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const effect of this.compiled.values()) this.gl.deleteProgram(effect.program);
    this.compiled.clear();
    this.gl.deleteVertexArray(this.vao);
  }

  private draw(effect: FullscreenEffect): void {
    const gl = this.gl;
    const compiled = this.requireCompiled(effect);
    gl.useProgram(compiled.program);
    configureBlend(gl, effect.blend ?? 'opaque');
    for (const [name, uniform] of Object.entries(effect.uniforms ?? {})) {
      let location = compiled.locations.get(name);
      if (!compiled.locations.has(name)) {
        location = gl.getUniformLocation(compiled.program, name);
        compiled.locations.set(name, location);
      }
      if (location) applyUniform(gl, location, uniform);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private requireCompiled(effect: FullscreenEffect): CompiledEffect {
    const current = this.compiled.get(effect.id);
    if (current?.source === effect.fragmentSource) return current;
    if (current) this.gl.deleteProgram(current.program);
    const compiled: CompiledEffect = {
      source: effect.fragmentSource,
      program: createShaderProgram(this.gl, { label: `fullscreen effect ${effect.id}`, vertexSource: VERTEX_SHADER, fragmentSource: effect.fragmentSource }),
      locations: new Map(),
    };
    this.compiled.set(effect.id, compiled);
    return compiled;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Fullscreen effect renderer has been destroyed');
    if (this.device.isContextLost) throw new Error('WebGL2 context is lost');
  }
}

function validateEffect(effect: FullscreenEffect): void {
  if (effect.id.trim().length === 0) throw new Error('Fullscreen effect id cannot be empty');
  if (effect.fragmentSource.trim().length === 0) throw new Error('Fullscreen fragment source cannot be empty');
}

function applyUniform(gl: WebGL2RenderingContext, location: WebGLUniformLocation, uniform: FullscreenUniform): void {
  switch (uniform.type) {
    case '1f': gl.uniform1f(location, uniform.value); break;
    case '1i': gl.uniform1i(location, uniform.value); break;
    case '2f': gl.uniform2f(location, ...uniform.value); break;
    case '3f': gl.uniform3f(location, ...uniform.value); break;
    case '4f': gl.uniform4f(location, ...uniform.value); break;
    case '1fv': gl.uniform1fv(location, uniform.value); break;
    case '4fv': gl.uniform4fv(location, uniform.value); break;
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
const vec2 POSITIONS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
