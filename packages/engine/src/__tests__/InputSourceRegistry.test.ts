import { describe, expect, it } from 'vitest';
import { InputState } from '@hooksjam/gl-game-lab-core';
import { InputSourceRegistry } from '../index.js';

describe('InputSourceRegistry', () => {
  it('polls registered sources before the input frame snapshot', () => {
    const input = new InputState();
    const sources = new InputSourceRegistry();
    const remove = sources.add({
      id: 'test.keyboard',
      poll: (state) => { state.ingest({ kind: 'key', phase: 'down', code: 'Space', key: ' ' }); },
    });

    sources.poll(input);
    expect(input.advanceFrame().isKeyPressed('Space')).toBe(true);
    remove();
    expect(sources.size).toBe(0);
  });

  it('rejects duplicate and reentrant source mutation', () => {
    const input = new InputState();
    const sources = new InputSourceRegistry();
    sources.add({ id: 'same', poll: () => undefined });
    expect(() => sources.add({ id: 'same', poll: () => undefined })).toThrow('already registered');
    sources.add({
      id: 'mutator',
      poll: () => { expect(() => sources.add({ id: 'late', poll: () => undefined })).toThrow('while polling'); },
    });
    sources.poll(input);
  });
});
