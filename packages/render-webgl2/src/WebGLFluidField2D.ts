import type {
  FluidDisplay2DOptions,
  FluidField2D,
  FluidSplat2D,
  FluidStep2DOptions,
  FluidFieldCreate2DOptions,
  FluidSeed2DOptions,
} from '@hooksjam/gl-game-lab-engine';
import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';
import type { RestorableResourceOwner } from './RestorableResourceOwner.js';
import { StableFluidField2D } from './StableFluidField2D.js';
import type { WebGL2Device } from './WebGL2Device.js';
import { WebGLGpuTexture2D } from './WebGLGpu2DService.js';

export class WebGLFluidField2D implements FluidField2D {
  private readonly owner: RestorableResourceOwner<StableFluidField2D>;
  private disposed = false;
  private lastSeed: { readonly kind: 'blank' | 'random' | 'voronoi' | 'cloud'; readonly seed: number; readonly options?: FluidSeed2DOptions } | undefined;
  private dyeRgba: Float32Array | undefined;
  private readonly velocityTexture: WebGLGpuTexture2D;
  private readonly dyeTexture: WebGLGpuTexture2D;

  constructor(
    device: WebGL2Device,
    id: string,
    width: number,
    height: number,
    options: FluidFieldCreate2DOptions,
    private readonly onDispose: () => void,
    private readonly recordWork: (drawCalls: number, uploadBytes?: number) => void,
  ) {
    this.owner = device.ownContextResource({
      id,
      priority: 50,
      estimatedBytes: width * height * 8 * 4 + (options.simulationWidth ?? width) * (options.simulationHeight ?? height) * 8 * 4,
      create: () => new StableFluidField2D(device.gl, { width, height, ...options }),
      dispose: (field) => { field.dispose(); },
      restored: (field) => {
        if (this.dyeRgba) field.uploadDyeRgba(this.dyeRgba);
        else if (this.lastSeed) field.seed(this.lastSeed.kind, this.lastSeed.seed, this.lastSeed.options);
      },
    });
    this.velocityTexture = new WebGLGpuTexture2D(options.simulationWidth ?? width, options.simulationHeight ?? height, () => this.owner.value.velocity.targets.read.texture);
    this.dyeTexture = new WebGLGpuTexture2D(width, height, () => this.owner.value.dye.targets.read.texture);
  }

  get width(): number { return this.owner.value.width; }
  get height(): number { return this.owner.value.height; }
  get simulationWidth(): number { return this.owner.value.velocity.width; }
  get simulationHeight(): number { return this.owner.value.velocity.height; }
  step(options: FluidStep2DOptions, splats: readonly FluidSplat2D[] = []): void {
    this.owner.value.step(options, splats);
    this.recordWork(5 + Math.max(1, Math.min(48, Math.floor(options.pressureIterations))) + splats.length * 2);
  }
  seed(kind: 'blank' | 'random' | 'voronoi' | 'cloud', seed: number, options?: FluidSeed2DOptions): void {
    this.lastSeed = { kind, seed, ...(options ? { options } : {}) };
    this.dyeRgba = undefined;
    this.owner.value.seed(kind, seed, options);
    if (kind !== 'blank') this.recordWork(1);
  }
  uploadDyeRgba(values: Float32Array): void {
    this.dyeRgba = values.slice();
    this.owner.value.uploadDyeRgba(this.dyeRgba);
    this.recordWork(0, this.dyeRgba.byteLength * 2);
  }
  texture(channel: 'velocity' | 'dye'): WebGLGpuTexture2D { return channel === 'velocity' ? this.velocityTexture : this.dyeTexture; }
  clear(): void { this.owner.value.clear(); }
  render(destination: GpuParticleRenderDestination, display: FluidDisplay2DOptions): void { this.owner.value.render(destination, display); this.recordWork(1); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.dispose();
    this.onDispose();
  }
}
