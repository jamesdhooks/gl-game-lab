import { describe, expect, it } from 'vitest';
import { FullscreenEffectRenderQueue } from '../FullscreenEffectRenderer.js';

describe('FullscreenEffectRenderQueue', () => {
  it('keeps ordered GPU effect submissions for the current frame', () => {
    const queue = new FullscreenEffectRenderQueue();
    queue.submit({
      id: 'field',
      fragmentSource: '#version 300 es\nvoid main() {}',
      uniforms: { time: { type: '1f', value: 1.5 } },
    });
    expect(queue.count).toBe(1);
    expect(queue.snapshot()[0]?.id).toBe('field');
    queue.clear();
    expect(queue.count).toBe(0);
  });

  it('rejects incomplete effect descriptors', () => {
    const queue = new FullscreenEffectRenderQueue();
    expect(() => queue.submit({ id: '', fragmentSource: 'shader' })).toThrow('id cannot be empty');
    expect(() => queue.submit({ id: 'field', fragmentSource: '' })).toThrow('source cannot be empty');
  });
});
