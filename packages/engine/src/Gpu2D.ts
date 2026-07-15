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
  readonly meshPasses?: Readonly<Record<string, { readonly vertexSource: string; readonly fragmentSource: string }>>;
}

export interface GpuFieldMesh2D {
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly cells: Float32Array;
  readonly facets: Float32Array;
  /** Increment when mutating an existing mesh's buffers in place. Static meshes may omit it. */
  readonly revision?: number;
}

export interface GpuFieldSystem2D {
  readonly width: number;
  readonly height: number;
  /** Increments whenever backend resources are recreated after device/context loss. */
  readonly generation: number;
  clear(): void;
  step(passId: string, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  render(passId: string, target: GpuRenderTarget2D, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
  renderMesh(passId: string, target: GpuRenderTarget2D, mesh: GpuFieldMesh2D, uniforms?: GpuUniforms2D | GpuUniformBinder2D): void;
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

export interface GpuParticleGridSystem2DOptions {
  readonly capacity: number;
  readonly width?: number;
  readonly height?: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly precision?: 'float';
}

export interface GpuParticleGridSeed2D {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly radii: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly foam: Float32Array;
  readonly affine: Float32Array;
}

export interface GpuParticleGridSnapshot2D {
  readonly count: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly radii: Float32Array;
  readonly colorSeeds: Float32Array;
  readonly foam: Float32Array;
  readonly affine: Float32Array;
}

export interface GpuParticleGridTransferOptions2D {
  readonly cell: number;
  readonly radius: number;
}

export interface GpuParticleGridTransfer2D {
  readonly columns: number;
  readonly rows: number;
  readonly mass: Float32Array;
  readonly momentumX: Float32Array;
  readonly momentumY: Float32Array;
}

export interface GpuParticleGridUpdateOptions2D extends GpuParticleGridTransferOptions2D {
  readonly dt: number;
  readonly stiffness: number;
  readonly restDensity: number;
  readonly separation: number;
  readonly viscosity: number;
  readonly gravity: number;
}

export interface GpuParticleGridUpdate2D {
  readonly columns: number;
  readonly rows: number;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly previousVelocityX: Float32Array;
  readonly previousVelocityY: Float32Array;
  readonly pressure: Float32Array;
}

export interface GpuParticleGridParticleUpdateOptions2D extends GpuParticleGridUpdateOptions2D {
  readonly width: number;
  readonly height: number;
  readonly flipness: number;
  readonly foamFrame: number;
  readonly circleObstacles?: Float32Array;
  readonly segmentObstacles?: Float32Array;
}

export interface GpuParticleGridSystem2D {
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly count: number;
  readonly generation: number;
  clear(): void;
  uploadSeed(seed: GpuParticleGridSeed2D): void;
  /** Advances particle-grid simulation state entirely on the active GPU backend. */
  step(options: GpuParticleGridParticleUpdateOptions2D): void;
  debugReadback(): GpuParticleGridSnapshot2D;
  debugComputeParticleToGrid(options: GpuParticleGridTransferOptions2D): GpuParticleGridTransfer2D;
  debugComputeGridUpdate(options: GpuParticleGridUpdateOptions2D): GpuParticleGridUpdate2D;
  debugComputeParticleUpdate(options: GpuParticleGridParticleUpdateOptions2D): GpuParticleGridSnapshot2D;
  dispose(): void;
}

export interface GpuParticleGridCapabilities2D {
  /** True only when particle-grid scatter/gather can run without changing solver semantics. */
  readonly supported: boolean;
  readonly floatRenderTargets: boolean;
  readonly floatBlend: boolean;
  readonly multipleRenderTargets: boolean;
  readonly vertexTextureFetch: boolean;
  readonly maxDrawBuffers: number;
  readonly maxColorAttachments: number;
  readonly maxVertexTextureImageUnits: number;
}

export interface Gpu2DCapabilities {
  readonly particleGrid: GpuParticleGridCapabilities2D;
}

export interface GpuParticleGridValidation2D {
  readonly supported: boolean;
  readonly reason?: string;
}

export interface Gpu2DService {
  readonly capabilities: Gpu2DCapabilities;
  validateParticleGridSupport(): GpuParticleGridValidation2D;
  createFieldSystem(id: string, options: GpuFieldSystem2DOptions): GpuFieldSystem2D;
  createParticleSystem(id: string, options: GpuParticleSystem2DOptions): GpuParticleSystem2D;
  createParticleGridSystem(id: string, options: GpuParticleGridSystem2DOptions): GpuParticleGridSystem2D;
  submit(id: string, execute: (target: GpuRenderTarget2D) => void): void;
}
