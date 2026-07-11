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

export type WebGL2FramePassId = typeof WEBGL2_FRAME_PASS_IDS[number];
export type FrameRenderExtensionPosition = 'before' | 'after';

export interface FrameRenderExtensionPass {
  readonly id: string;
  readonly stage: WebGL2FramePassId;
  readonly position?: FrameRenderExtensionPosition;
  readonly order?: number;
  execute(destination: FrameRenderDestination): void;
}

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
  private graph = new RenderGraph<FrameRenderDestination, FrameResourceDescriptor>();
  private destination: RenderResource<FrameResourceDescriptor>;
  private readonly extensions = new Map<string, FrameRenderExtensionPass>();
  private readonly stages: FrameRenderStages;

  constructor(stages: FrameRenderStages) {
    this.stages = stages;
    this.destination = this.createDestination();
    this.rebuild();
  }

  register(pass: FrameRenderExtensionPass): () => void {
    const id = pass.id.trim();
    if (id.length === 0) throw new Error('Frame render extension pass id cannot be empty');
    if ((WEBGL2_FRAME_PASS_IDS as readonly string[]).includes(id)) throw new Error(`Frame render extension pass uses a built-in id: ${id}`);
    if (this.extensions.has(id)) throw new Error(`Frame render extension pass already exists: ${id}`);
    if (!(WEBGL2_FRAME_PASS_IDS as readonly string[]).includes(pass.stage)) throw new Error(`Unknown frame render extension stage: ${pass.stage}`);
    if (pass.position !== undefined && pass.position !== 'before' && pass.position !== 'after') {
      throw new Error(`Unknown frame render extension position: ${String(pass.position)}`);
    }
    const order = pass.order ?? 0;
    if (!Number.isSafeInteger(order)) throw new Error('Frame render extension order must be an integer');
    const normalized = Object.freeze({ ...pass, id, position: pass.position ?? 'after', order });
    this.extensions.set(id, normalized);
    this.rebuild();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.extensions.delete(id);
      this.rebuild();
    };
  }

  private createDestination(): RenderResource<FrameResourceDescriptor> {
    return this.graph.createResource('frame.destination', {
      descriptor: { kind: 'frame-destination' },
      lifetime: 'external',
    });
  }

  private rebuild(): void {
    this.graph = new RenderGraph<FrameRenderDestination, FrameResourceDescriptor>();
    this.destination = this.createDestination();
    const destination = this.destination;
    const callbacks = [
      this.stages.clear,
      this.stages.backdrop,
      this.stages.gpuSimulation,
      this.stages.effects,
      this.stages.particles,
      this.stages.sprites,
      this.stages.composite,
    ];
    let passIndex = 0;
    WEBGL2_FRAME_PASS_IDS.forEach((id, index) => {
      const callback = callbacks[index];
      if (!callback) throw new Error(`Frame render stage is unavailable: ${id}`);
      const extensions = [...this.extensions.values()]
        .filter((extension) => extension.stage === id)
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
      const before = extensions.filter((extension) => extension.position === 'before');
      const after = extensions.filter((extension) => extension.position !== 'before');
      for (const extension of before) { this.addPass(extension.id, extension.execute, passIndex, destination); passIndex += 1; }
      this.addPass(id, callback, passIndex, destination); passIndex += 1;
      for (const extension of after) { this.addPass(extension.id, extension.execute, passIndex, destination); passIndex += 1; }
    });
  }

  private addPass(
    id: string,
    callback: (destination: FrameRenderDestination) => void,
    index: number,
    destination: RenderResource<FrameResourceDescriptor>,
  ): void {
    this.graph.addPass({
      id,
      ...(index === 0 ? {} : { reads: [destination] }),
      writes: [destination],
      execute: (context) => { callback(context.resource(destination)); },
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
