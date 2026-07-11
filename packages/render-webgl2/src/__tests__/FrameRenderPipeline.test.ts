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

  it('registers deterministic backend extension passes around built-in stages', () => {
    const calls: string[] = [];
    const pipeline = new FrameRenderPipeline({
      clear: () => { calls.push('frame.clear'); }, backdrop: () => { calls.push('frame.backdrop'); },
      gpuSimulation: () => { calls.push('frame.gpu-simulation'); }, effects: () => { calls.push('frame.effects'); },
      particles: () => { calls.push('frame.particles'); }, sprites: () => { calls.push('frame.sprites'); },
      composite: () => { calls.push('frame.composite'); },
    });
    const unregisterLate = pipeline.register({ id: 'plugin.late', stage: 'frame.effects', order: 10, execute: () => { calls.push('plugin.late'); } });
    pipeline.register({ id: 'plugin.before', stage: 'frame.effects', position: 'before', execute: () => { calls.push('plugin.before'); } });
    pipeline.register({ id: 'plugin.early', stage: 'frame.effects', order: -10, execute: () => { calls.push('plugin.early'); } });

    pipeline.execute({ composite: false });
    expect(calls).toEqual([
      'frame.clear', 'frame.backdrop', 'frame.gpu-simulation',
      'plugin.before', 'frame.effects', 'plugin.early', 'plugin.late',
      'frame.particles', 'frame.sprites', 'frame.composite',
    ]);
    expect(pipeline.snapshot().passes).toContain('plugin.before');
    unregisterLate();
    unregisterLate();
    expect(pipeline.snapshot().passes).not.toContain('plugin.late');
    expect(() => pipeline.register({ id: 'frame.effects', stage: 'frame.effects', execute: () => undefined })).toThrow('built-in id');
  });
});
