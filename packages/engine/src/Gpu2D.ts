export type GpuUniform2D =
  | { readonly type: '1f'; readonly value: number }
  | { readonly type: '1i'; readonly value: number }
  | { readonly type: '2f'; readonly value: readonly [number, number] }
  | { readonly type: '3fv'; readonly value: Float32Array }
  | { readonly type: '4fv'; readonly value: Float32Array };

export type GpuUniforms2D = Readonly<Record<string, GpuUniform2D>>;

export interface GpuUniformLocation2D { readonly name: string }
export type GpuUniformLookup2D = (name: string) => GpuUniformLocation2D;
export interface GpuUniformEncoder2D {
  uniform1f(location: GpuUniformLocation2D, value: number): void;
  uniform1i(location: GpuUniformLocation2D, value: number): void;
  uniform2f(location: GpuUniformLocation2D, x: number, y: number): void;
  uniform3fv(location: GpuUniformLocation2D, value: Float32Array): void;
  uniform4fv(location: GpuUniformLocation2D, value: Float32Array): void;
  uniformTexture(location: GpuUniformLocation2D, texture: GpuTexture2D, unit: number): void;
}
export type GpuUniformBinder2D = (encoder: GpuUniformEncoder2D, uniform: GpuUniformLookup2D) => void;

/** Opaque render destination. Content can inspect dimensions but cannot access backend handles. */
export interface GpuRenderTarget2D {
  readonly width: number;
  readonly height: number;
}

/** Opaque sampled texture whose native handle remains owned by the active backend. */
export interface GpuTexture2D {
  readonly width: number;
  readonly height: number;
}

export interface GpuFieldSystem2DOptions {
  readonly width: number;
  readonly height: number;
  readonly precision?: 'half-float' | 'float';
  readonly filter?: 'nearest' | 'linear';
  readonly passes: Readonly<Record<string, string>>;
}

export interface GpuFieldSystem2D {
  readonly width: number;
  readonly height: number;
  /** Increments whenever backend resources are recreated after device/context loss. */
  readonly generation: number;
  clear(): void;
  step(passId: string, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  render(passId: string, target: GpuRenderTarget2D, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  dispose(): void;
}

export interface GpuParticleSeed2D {
  readonly positions?: Float32Array;
  readonly velocities?: Float32Array;
}

export interface GpuParticleSystem2DOptions {
  readonly capacity: number;
  readonly width?: number;
  readonly height?: number;
  readonly precision?: 'half-float' | 'float';
  readonly simulationFragmentSource: string;
  readonly particleVertexSource: string;
  readonly particleFragmentSource: string;
  readonly blend?: 'opaque' | 'alpha' | 'additive' | 'multiply';
  readonly trails?: boolean;
}

export interface GpuParticleSystem2D {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  readonly generation: number;
  clear(): void;
  uploadSeed(seed: GpuParticleSeed2D): void;
  step(uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  render(target: GpuRenderTarget2D, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  beginTrails(width: number, height: number, fade: number): GpuRenderTarget2D;
  compositeTrails(target: GpuRenderTarget2D, background: readonly [number, number, number], bloom: number): void;
  clearTrails(): void;
  dispose(): void;
}

export interface Gpu2DService {
  createFieldSystem(id: string, options: GpuFieldSystem2DOptions): GpuFieldSystem2D;
  createParticleSystem(id: string, options: GpuParticleSystem2DOptions): GpuParticleSystem2D;
  submit(id: string, execute: (target: GpuRenderTarget2D) => void): void;
}
