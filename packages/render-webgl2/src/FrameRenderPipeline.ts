import {
  RenderGraph,
  type RenderResource,
  type RenderResourceAllocator,
} from './RenderGraph.js';
import type { SpriteRenderTarget } from './SpriteRenderer.js';

export const WEBGL2_FRAME_PASS_IDS = Object.freeze([
  'frame.clear',
  'frame.backdrop',
  'frame.gpu-simulation',
  'frame.effects',
  'frame.particles',
  'frame.sprites',
  'frame.composite',
] as const);

export interface FrameRenderDestination {
  readonly target?: SpriteRenderTarget;
  readonly composite: boolean;
}

export interface FrameRenderStages {
  clear(destination: FrameRenderDestination): void;
  backdrop(destination: FrameRenderDestination): void;
  gpuSimulation(destination: FrameRenderDestination): void;
  effects(destination: FrameRenderDestination): void;
  particles(destination: FrameRenderDestination): void;
  sprites(destination: FrameRenderDestination): void;
  composite(destination: FrameRenderDestination): void;
}

export interface FrameRenderGraphSnapshot {
  readonly passes: readonly string[];
  readonly resources: readonly string[];
}

interface FrameResourceDescriptor {
  readonly kind: 'frame-destination';
}

const UNUSED_ALLOCATOR: RenderResourceAllocator<FrameRenderDestination, FrameResourceDescriptor> = {
  create: () => { throw new Error('Frame graph cannot allocate its external destination'); },
  destroy: () => undefined,
};

export class FrameRenderPipeline {
  private readonly graph = new RenderGraph<FrameRenderDestination, FrameResourceDescriptor>();
  private readonly destination: RenderResource<FrameResourceDescriptor>;

  constructor(stages: FrameRenderStages) {
    this.destination = this.graph.createResource('frame.destination', {
      descriptor: { kind: 'frame-destination' },
      lifetime: 'external',
    });
    const callbacks = [
      stages.clear,
      stages.backdrop,
      stages.gpuSimulation,
      stages.effects,
      stages.particles,
      stages.sprites,
      stages.composite,
    ];
    WEBGL2_FRAME_PASS_IDS.forEach((id, index) => {
      const callback = callbacks[index];
      if (!callback) throw new Error(`Frame render stage is unavailable: ${id}`);
      this.graph.addPass({
        id,
        ...(index === 0 ? {} : { reads: [this.destination] }),
        writes: [this.destination],
        execute: (context) => { callback(context.resource(this.destination)); },
      });
    });
  }

  execute(destination: FrameRenderDestination): void {
    this.graph.setExternal(this.destination, destination);
    this.graph.execute(UNUSED_ALLOCATOR);
  }

  snapshot(): FrameRenderGraphSnapshot {
    return Object.freeze({
      passes: Object.freeze(this.graph.orderedPasses().map(({ id }) => id)),
      resources: Object.freeze([this.destination.id]),
    });
  }
}
