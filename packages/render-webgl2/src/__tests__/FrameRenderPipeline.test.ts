import { describe, expect, it } from 'vitest';
import { FrameRenderPipeline, WEBGL2_FRAME_PASS_IDS } from '../index.js';

describe('FrameRenderPipeline', () => {
  it('executes the shipping frame graph in compiled dependency order', () => {
    const calls: string[] = [];
    const pipeline = new FrameRenderPipeline({
      clear: () => { calls.push('frame.clear'); },
      backdrop: () => { calls.push('frame.backdrop'); },
      gpuSimulation: () => { calls.push('frame.gpu-simulation'); },
      effects: () => { calls.push('frame.effects'); },
      particles: () => { calls.push('frame.particles'); },
      sprites: () => { calls.push('frame.sprites'); },
      composite: () => { calls.push('frame.composite'); },
    });

    pipeline.execute({ composite: false });

    expect(calls).toEqual(WEBGL2_FRAME_PASS_IDS);
    expect(pipeline.snapshot()).toEqual({
      passes: WEBGL2_FRAME_PASS_IDS,
      resources: ['frame.destination'],
    });
  });
});
