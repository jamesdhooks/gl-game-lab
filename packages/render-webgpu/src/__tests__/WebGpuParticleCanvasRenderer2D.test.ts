import { describe, expect, it, vi } from 'vitest';
import {
  adaptParticleEffectDefinition2D,
  compileParticleEffect2D,
  compileParticleProgram2D,
  type GpuRenderTarget2D,
  type ParticleEffectDefinition2D,
} from '@hooksjam/gl-game-lab-engine';
import {
  WebGpuParticleCanvasRenderer2D,
  type ParticleWebGpuBuffer2D,
  type ParticleWebGpuCanvasContext2D,
  type ParticleWebGpuDevice2D,
} from '../index.js';

class Buffer implements ParticleWebGpuBuffer2D { destroy(): void {} }

function fixture() {
  const submit = vi.fn();
  const draw = vi.fn();
  const drawIndirect = vi.fn();
  const renderPasses: unknown[] = [];
  const textureDestroy = vi.fn();
  const device: ParticleWebGpuDevice2D = {
    queue: { writeBuffer: vi.fn(), submit },
    createBuffer: () => new Buffer(),
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createTexture: () => ({ createView: () => ({}), destroy: textureDestroy }),
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: vi.fn(), end: vi.fn() }),
      beginRenderPass: (options) => {
        renderPasses.push(options);
        return { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw, drawIndirect, end: vi.fn() };
      },
      finish: () => ({}),
    }),
  };
  const context: ParticleWebGpuCanvasContext2D = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: () => ({ createView: () => ({}), destroy: vi.fn() }),
  };
  const canvas = { width: 1, height: 1, style: {} } as HTMLCanvasElement;
  return { device, context, canvas, submit, draw, drawIndirect, renderPasses, textureDestroy };
}

const DEFINITION: ParticleEffectDefinition2D = {
  id: 'canvas-test',
  capacity: { min: 16, default: 16, max: 16, previewMax: 16 },
  archetypes: [{
    id: 'spark', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 0, drag: 0 },
    lifecycle: { lifetime: 1 },
    appearance: { size: { start: 2, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } },
  }],
  modules: { motion: true, lifecycle: true },
  renderRecipes: {
    defaultTier: 'basic',
    recipes: [
      { tier: 'basic', points: true, blend: 'additive' },
      { tier: 'ultra', points: true, streaks: true, trails: true, bloom: true, blend: 'additive' },
    ],
  },
};

describe('WebGpuParticleCanvasRenderer2D', () => {
  it('batches one frame of direct point rendering and presents it once', async () => {
    const state = fixture();
    const renderer = new WebGpuParticleCanvasRenderer2D(state.device, state.context, 'rgba8unorm', state.canvas);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(DEFINITION)));
    const buffer = new Buffer();
    renderer.render(program, [buffer, buffer, buffer], { width: 320, height: 180 } as GpuRenderTarget2D, 'basic', {
      state: [buffer, buffer, buffer], archetypeSize: buffer, archetypeLength: buffer, archetypeAlpha: buffer,
      archetypeIntensity: buffer, palette: buffer, renderConfig: buffer, indirectDraw: buffer, paletteCount: 1, capacity: 16,
    });
    await Promise.resolve();
    expect(state.canvas.width).toBe(320);
    expect(state.canvas.height).toBe(180);
    expect(state.drawIndirect).toHaveBeenCalledWith(buffer, 0);
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(renderer.diagnostics()).toMatchObject({ submittedFrames: 1, particleDraws: 1, trailPasses: 0 });
    renderer.dispose();
  });

  it('executes feedback, points, streaks, and composite for Ultra', async () => {
    const state = fixture();
    const renderer = new WebGpuParticleCanvasRenderer2D(state.device, state.context, 'rgba8unorm', state.canvas);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(DEFINITION)));
    const buffer = new Buffer();
    renderer.render(program, [buffer, buffer, buffer], { width: 256, height: 256 } as GpuRenderTarget2D, 'ultra', {
      state: [buffer, buffer, buffer], archetypeSize: buffer, archetypeLength: buffer, archetypeAlpha: buffer,
      archetypeIntensity: buffer, palette: buffer, renderConfig: buffer, indirectDraw: buffer, paletteCount: 1, capacity: 16,
    });
    await Promise.resolve();
    expect(state.draw).toHaveBeenCalledWith(3);
    expect(state.drawIndirect).toHaveBeenCalledTimes(2);
    expect(renderer.diagnostics()).toMatchObject({ submittedFrames: 1, particleDraws: 2, trailPasses: 1, compositePasses: 1 });
    renderer.dispose();
    expect(state.textureDestroy).toHaveBeenCalledTimes(2);
  });

  it('hides presentation and rejects new work after device loss', () => {
    const state = fixture();
    const renderer = new WebGpuParticleCanvasRenderer2D(state.device, state.context, 'rgba8unorm', state.canvas);
    const program = compileParticleProgram2D(compileParticleEffect2D(adaptParticleEffectDefinition2D(DEFINITION)));
    const buffer = new Buffer();
    renderer.markDeviceLost();
    expect(state.canvas.style.visibility).toBe('hidden');
    expect(() => renderer.render(program, [buffer, buffer, buffer], { width: 16, height: 16 } as GpuRenderTarget2D, 'basic', {
      state: [buffer, buffer, buffer], archetypeSize: buffer, archetypeLength: buffer, archetypeAlpha: buffer,
      archetypeIntensity: buffer, palette: buffer, renderConfig: buffer, indirectDraw: buffer, paletteCount: 1, capacity: 16,
    })).toThrow('device was lost');
  });
});
