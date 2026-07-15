import type { ColorRgba, ParticleBatch2D, Render2DService } from './Render2D.js';

export interface InteractionIndicatorPointer2D {
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
}

export interface InteractionRadiusIndicator2DOptions {
  readonly color?: ColorRgba;
  readonly maximumPointers?: number;
}

type MutableInteractionBatch = Omit<ParticleBatch2D, 'count'> & { count: number };

const DEFAULT_COLOR: ColorRgba = Object.freeze([0.72, 0.84, 0.92, 0.18]);

/**
 * Reuses one typed-array particle batch to display active pointer influence as
 * a flat, translucent disc. The indicator is deliberately renderer-level so
 * every experience uses the same visual and incurs no per-frame allocations.
 */
export class InteractionRadiusIndicator2D {
  private readonly positions: Float32Array;
  private readonly radii: Float32Array;
  private readonly colorSeeds: Float32Array;
  private readonly batch: MutableInteractionBatch;

  constructor(id: string, options: InteractionRadiusIndicator2DOptions = {}) {
    if (id.trim().length === 0) throw new Error('Interaction indicator id cannot be empty');
    const maximumPointers = options.maximumPointers ?? 8;
    if (!Number.isSafeInteger(maximumPointers) || maximumPointers < 1) {
      throw new Error('Interaction indicator pointer capacity must be a positive integer');
    }
    const color = options.color ?? DEFAULT_COLOR;
    if (color.length !== 4 || !color.every(component => Number.isFinite(component) && component >= 0 && component <= 1)) {
      throw new Error('Interaction indicator color components must be between zero and one');
    }
    this.positions = new Float32Array(maximumPointers * 2);
    this.radii = new Float32Array(maximumPointers);
    this.colorSeeds = new Float32Array(maximumPointers);
    this.batch = {
      id,
      count: 0,
      positions: this.positions,
      radii: this.radii,
      colorSeeds: this.colorSeeds,
      palette: [Object.freeze([...color]) as ColorRgba],
      paletteMode: 'indexed',
      shading: 'flat',
      blend: 'alpha',
    };
  }

  submit(
    renderer: Pick<Render2DService, 'submitParticles'>,
    pointers: readonly InteractionIndicatorPointer2D[],
    radius: number,
  ): void {
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('Interaction indicator radius must be positive');
    let count = 0;
    for (const pointer of pointers) {
      if (pointer.buttons === 0) continue;
      if (count >= this.radii.length) break;
      if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) continue;
      this.positions[count * 2] = pointer.x;
      this.positions[count * 2 + 1] = pointer.y;
      this.radii[count] = radius;
      this.colorSeeds[count] = 0;
      count += 1;
    }
    if (count === 0) return;
    this.batch.count = count;
    renderer.submitParticles(this.batch);
  }
}
