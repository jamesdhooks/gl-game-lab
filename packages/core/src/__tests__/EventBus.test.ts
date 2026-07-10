import { describe, expect, it } from 'vitest';
import { EventBus, createEventToken } from '../index.js';

interface ScoreChanged {
  readonly score: number;
}

describe('EventBus', () => {
  it('delivers typed immediate events in subscription order', () => {
    const bus = new EventBus();
    const ScoreChanged = createEventToken<ScoreChanged>('game.score-changed');
    const seen: number[] = [];
    bus.on(ScoreChanged, ({ score }) => { seen.push(score); });
    bus.on(ScoreChanged, ({ score }) => { seen.push(score * 2); });

    bus.emit(ScoreChanged, { score: 3 });

    expect(seen).toEqual([3, 6]);
  });

  it('supports once listeners and safe unsubscribe during dispatch', () => {
    const bus = new EventBus();
    const Event = createEventToken<number>('test.once');
    const seen: number[] = [];
    let unsubscribe = (): void => undefined;
    unsubscribe = bus.on(Event, (value) => {
      seen.push(value);
      unsubscribe();
    });
    bus.once(Event, (value) => { seen.push(value * 10); });

    bus.emit(Event, 2);
    bus.emit(Event, 3);

    expect(seen).toEqual([2, 20]);
    expect(bus.listenerCount(Event)).toBe(0);
  });

  it('queues events into explicit deterministic flush boundaries', () => {
    const bus = new EventBus();
    const Event = createEventToken<string>('test.queued');
    const seen: string[] = [];
    bus.on(Event, (value) => {
      seen.push(value);
      if (value === 'first') bus.enqueue(Event, 'next-flush');
    });
    bus.enqueue(Event, 'first');
    bus.enqueue(Event, 'second');

    expect(bus.flush()).toBe(2);
    expect(seen).toEqual(['first', 'second']);
    expect(bus.queuedCount).toBe(1);
    bus.flush();
    expect(seen).toEqual(['first', 'second', 'next-flush']);
  });

  it('rejects separately-created tokens with the same stable id', () => {
    const bus = new EventBus();
    const First = createEventToken<number>('duplicate');
    const Second = createEventToken<string>('duplicate');
    bus.on(First, () => undefined);
    expect(() => bus.on(Second, () => undefined)).toThrow('another token');
  });
});
