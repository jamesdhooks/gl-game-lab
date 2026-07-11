import { describe, expect, it, vi } from 'vitest';
import { GpuRenderPassQueue } from '../GpuRenderPassQueue.js';

describe('GpuRenderPassQueue', () => {
  it('executes ordered experience-owned GPU passes', () => {
    const queue = new GpuRenderPassQueue();
    const first = vi.fn();
    const second = vi.fn();
    queue.submit({ id: 'simulate', execute: first });
    queue.submit({ id: 'composite', execute: second });
    const destination = { width: 800, height: 600 };
    queue.execute(destination);
    expect(first).toHaveBeenCalledWith(destination);
    expect(second).toHaveBeenCalledWith(destination);
    queue.clear();
    expect(queue.count).toBe(0);
  });

  it('rejects duplicate pass ids within a frame', () => {
    const queue = new GpuRenderPassQueue();
    queue.submit({ id: 'particles', execute: () => undefined });
    expect(() => queue.submit({ id: 'particles', execute: () => undefined })).toThrow('already submitted');
  });
});
