import { describe, expect, it } from 'vitest';
import { RenderGraph, type RenderResourceAllocator } from '../index.js';

interface Descriptor { readonly label: string; }
interface Resource { readonly label: string; }

function allocator(created: string[], destroyed: string[]): RenderResourceAllocator<Resource, Descriptor> {
  return {
    create: (descriptor, id) => {
      created.push(id);
      return { label: descriptor.label };
    },
    destroy: (_resource, id) => { destroyed.push(id); },
  };
}

describe('RenderGraph', () => {
  it('orders pass dependencies and releases transient resources after execution', () => {
    const graph = new RenderGraph<Resource, Descriptor>();
    const scene = graph.createResource('scene', { descriptor: { label: 'scene' } });
    const output = graph.createResource('output', { descriptor: { label: 'output' } });
    const calls: string[] = [];
    graph.addPass({ id: 'draw', writes: [scene], execute: () => { calls.push('draw'); } });
    graph.addPass({ id: 'compose', reads: [scene], writes: [output], execute: () => { calls.push('compose'); } });
    const created: string[] = [];
    const destroyed: string[] = [];

    graph.execute(allocator(created, destroyed));

    expect(graph.orderedPasses().map(({ id }) => id)).toEqual(['draw', 'compose']);
    expect(calls).toEqual(['draw', 'compose']);
    expect(created).toEqual(['scene', 'output']);
    expect(destroyed).toEqual(['output', 'scene']);
  });

  it('retains persistent resources and accepts externally provided resources', () => {
    const graph = new RenderGraph<Resource, Descriptor>();
    const persistent = graph.createResource('history', { descriptor: { label: 'history' }, lifetime: 'persistent' });
    const screen = graph.createResource('screen', { descriptor: { label: 'screen' }, lifetime: 'external' });
    graph.setExternal(screen, { label: 'canvas' });
    graph.addPass({ id: 'present', reads: [persistent], writes: [screen], execute: () => undefined });
    const created: string[] = [];
    const destroyed: string[] = [];
    const resources = allocator(created, destroyed);

    graph.execute(resources);
    graph.execute(resources);
    graph.dispose(resources);

    expect(created).toEqual(['history']);
    expect(destroyed).toEqual(['history']);
  });

  it('rejects invalid read dependencies, unknown ordering references, and cycles', () => {
    const missingProducer = new RenderGraph<Resource, Descriptor>();
    const texture = missingProducer.createResource('texture', { descriptor: { label: 'texture' } });
    missingProducer.addPass({ id: 'read', reads: [texture], execute: () => undefined });
    expect(() => missingProducer.orderedPasses()).toThrow('before it is written');

    const unknown = new RenderGraph<Resource, Descriptor>();
    unknown.addPass({ id: 'one', after: ['missing'], execute: () => undefined });
    expect(() => unknown.orderedPasses()).toThrow('unknown pass');

    const cyclic = new RenderGraph<Resource, Descriptor>();
    cyclic.addPass({ id: 'one', after: ['two'], execute: () => undefined });
    cyclic.addPass({ id: 'two', after: ['one'], execute: () => undefined });
    expect(() => cyclic.orderedPasses()).toThrow('cycle');
  });
});
