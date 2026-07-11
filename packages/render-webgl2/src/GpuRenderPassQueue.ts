import type { GpuParticleRenderDestination } from './GpuParticleRenderer.js';

export interface GpuFrameRenderPass {
  readonly id: string;
  execute(destination: GpuParticleRenderDestination): void;
}

export class GpuRenderPassQueue {
  private readonly passes: GpuFrameRenderPass[] = [];
  private readonly ids = new Set<string>();

  submit(pass: GpuFrameRenderPass): void {
    const id = pass.id.trim();
    if (id.length === 0) throw new Error('GPU frame render pass id cannot be empty');
    if (this.ids.has(id)) throw new Error(`GPU frame render pass already submitted: ${id}`);
    this.ids.add(id);
    this.passes.push(pass);
  }

  execute(destination: GpuParticleRenderDestination): void {
    for (const pass of this.passes) pass.execute(destination);
  }

  clear(): void { this.passes.length = 0; this.ids.clear(); }
  get count(): number { return this.passes.length; }
}
