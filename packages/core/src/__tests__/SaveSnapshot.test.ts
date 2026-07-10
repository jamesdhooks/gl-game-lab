import { describe, expect, it } from 'vitest';
import { SaveSnapshotCodec, requireJsonNumber, requireJsonObject } from '../index.js';

describe('SaveSnapshotCodec', () => {
  it('persists intentional game state independently from a world document', () => {
    const codec = new SaveSnapshotCodec({
      id: 'game.save',
      version: 1,
      encode: (state: { readonly score: number }) => ({ score: state.score }),
      decode: (data) => ({ score: requireJsonNumber(requireJsonObject(data, 'save').score, 'save.score') }),
    });

    const snapshot = codec.create('ball-pit', { score: 420 });

    expect(snapshot).toEqual({
      format: 'gl-game-lab.save',
      gameId: 'ball-pit',
      schema: 'game.save',
      version: 1,
      data: { score: 420 },
    });
    expect(codec.restore(snapshot)).toEqual({ gameId: 'ball-pit', state: { score: 420 } });
  });

  it('migrates older save state through every declared version', () => {
    const codec = new SaveSnapshotCodec({
      id: 'game.save',
      version: 2,
      migrations: [{
        from: 1,
        migrate: (data) => {
          const object = requireJsonObject(data, 'save.v1');
          return { score: object.points ?? 0 };
        },
      }],
      encode: (state: { readonly score: number }) => ({ score: state.score }),
      decode: (data) => ({ score: requireJsonNumber(requireJsonObject(data, 'save').score, 'save.score') }),
    });

    expect(codec.restore({
      format: 'gl-game-lab.save',
      gameId: 'ball-pit',
      schema: 'game.save',
      version: 1,
      data: { points: 9 },
    })).toEqual({ gameId: 'ball-pit', state: { score: 9 } });
  });

  it('rejects incomplete migrations and incompatible snapshots', () => {
    expect(() => new SaveSnapshotCodec({
      id: 'game.save',
      version: 3,
      migrations: [{ from: 1, migrate: (data) => data }],
      encode: () => null,
      decode: () => undefined,
    })).toThrow('Missing save migration for game.save version 2');

    const codec = new SaveSnapshotCodec({
      id: 'game.save',
      version: 1,
      encode: () => null,
      decode: () => undefined,
    });
    expect(() => codec.restore({
      format: 'gl-game-lab.save',
      gameId: 'ball-pit',
      schema: 'other.save',
      version: 1,
      data: null,
    })).toThrow('schema mismatch');
  });
});
