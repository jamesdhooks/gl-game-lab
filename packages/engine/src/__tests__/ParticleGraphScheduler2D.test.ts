import { describe, expect, it, vi } from 'vitest';
import { PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION, ParticleGraphScheduler2D, particleGraph2D, type ParticleEffectGraph2D } from '../index.js';

const graph: ParticleEffectGraph2D = {
  schemaVersion: PARTICLE_EFFECT_GRAPH_SCHEMA_VERSION, id: 'scheduler', parameters: [],
  archetypes: [{ id: 'spark', spawn: { shape: 'point', spread: 0 }, motion: { gravity: 0, drag: 0 }, lifecycle: { lifetime: 1 }, appearance: { size: { start: 1, end: 0 }, alpha: { start: 1, end: 0 }, intensity: { start: 1, end: 0 } } }],
  emitters: [
    { id: 'first', archetypeId: 'spark', timeline: { duration: 0.5, bursts: [{ time: 0, count: 1 }] }, source: { kind: 'point' }, transform: { space: 'effect' }, limits: { importance: 'primary' } },
    { id: 'second', archetypeId: 'spark', timeline: { manual: true, bursts: [{ time: 0, count: 1 }] }, source: { kind: 'point' }, transform: { space: 'effect' }, limits: { importance: 'secondary' } },
  ],
  graph: { root: particleGraph2D.sequence(particleGraph2D.emit('first'), particleGraph2D.delay(0.25, particleGraph2D.emit('second')), particleGraph2D.gate({ kind: 'signal', signal: 'burst' }, particleGraph2D.repeat(2, particleGraph2D.emit('second')))) },
  renderRecipes: { defaultTier: 'basic', recipes: [{ tier: 'basic', points: true, blend: 'additive' }] },
  capacity: { min: 1, default: 16, max: 32, previewMax: 8 }, quality: { defaultTier: 'basic' },
};

describe('ParticleGraphScheduler2D', () => {
  it('executes sequence timing, delays, bounded repeats, and signal gates', () => {
    const emit = vi.fn();
    const scheduler = new ParticleGraphScheduler2D(graph, () => ({}), { emit, stop: vi.fn(), signal: vi.fn(), reference: vi.fn() }, 4);
    scheduler.start(); expect(emit).toHaveBeenCalledTimes(1); expect(emit.mock.calls.at(-1)?.[0]).toBe('first');
    scheduler.update(0.74); expect(emit).toHaveBeenCalledTimes(1);
    scheduler.update(0.02); expect(emit.mock.calls.at(-1)?.[0]).toBe('second');
    scheduler.trigger({ kind: 'signal', signal: 'burst' }); expect(emit).toHaveBeenCalledTimes(4);
  });

  it('makes seeded random choices deterministic', () => {
    const randomGraph = { ...graph, graph: { root: { kind: 'random-choice' as const, children: [particleGraph2D.emit('first'), particleGraph2D.emit('second')] } } };
    const first = vi.fn(), second = vi.fn();
    new ParticleGraphScheduler2D(randomGraph, () => ({}), { emit: first, stop: vi.fn(), signal: vi.fn(), reference: vi.fn() }, 99).start();
    new ParticleGraphScheduler2D(randomGraph, () => ({}), { emit: second, stop: vi.fn(), signal: vi.fn(), reference: vi.fn() }, 99).start();
    expect(first.mock.calls).toEqual(second.mock.calls);
  });

  it('executes timeline markers and safely accepts lifecycle events while flushing', () => {
    const emit = vi.fn();
    const markerGraph: ParticleEffectGraph2D = {
      ...graph,
      graph: {
        root: particleGraph2D.parallel(
          {
            kind: 'timeline',
            markers: [{ time: 0.25, marker: 'accent' }],
            child: particleGraph2D.emit('first'),
          },
          particleGraph2D.gate({ kind: 'marker', marker: 'accent' }, particleGraph2D.emit('second')),
          particleGraph2D.gate({ kind: 'emitter-start', emitterId: 'first' }, particleGraph2D.emit('second')),
        ),
      },
    };
    let scheduler: ParticleGraphScheduler2D;
    scheduler = new ParticleGraphScheduler2D(markerGraph, () => ({}), {
      emit: (id) => {
        emit(id);
        if (id === 'first') scheduler.trigger({ kind: 'emitter-start', emitterId: id });
      },
      stop: vi.fn(), signal: vi.fn(), reference: vi.fn(),
    }, 7);
    scheduler.start();
    expect(emit.mock.calls).toEqual([['first'], ['second']]);
    scheduler.update(0.25);
    expect(emit.mock.calls).toEqual([['first'], ['second'], ['second']]);
  });

  it('carries nested parameter remaps and transform spaces into emitted graph actions', () => {
    const contextualGraph: ParticleEffectGraph2D = {
      ...graph,
      parameters: [
        { id: 'local-power', kind: 'number', defaultValue: 1 },
        { id: 'scene-power', kind: 'number', defaultValue: 4 },
      ],
      graph: {
        root: {
          kind: 'parameter-remap', map: { 'local-power': 'scene-power' }, child: {
            kind: 'transform', space: 'world', child: particleGraph2D.emit('second'),
          },
        },
      },
    };
    const emit = vi.fn();
    new ParticleGraphScheduler2D(contextualGraph, () => ({ 'local-power': 1, 'scene-power': 8 }), {
      emit, stop: vi.fn(), signal: vi.fn(), reference: vi.fn(),
    }, 3).start();
    expect(emit).toHaveBeenCalledWith('second', { parameterMap: { 'local-power': 'scene-power' }, space: 'world' });
  });
});
