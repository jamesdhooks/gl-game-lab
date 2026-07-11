import { describe, expect, it } from 'vitest';
import { WebAudioService } from '../index.js';

describe('WebAudioService', () => {
  it('loads, unlocks, plays, controls, and releases decoded audio', async () => {
    let contextState: AudioContextState = 'suspended';
    let sourceStarted = false;
    let sourceStopped = false;
    let contextClosed = false;
    const source = {
      buffer: null,
      loop: false,
      playbackRate: { value: 1 },
      onended: null,
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => { sourceStarted = true; },
      stop: () => { sourceStopped = true; },
    } as unknown as AudioBufferSourceNode;
    const gain = {
      gain: { value: 1 },
      connect: () => undefined,
      disconnect: () => undefined,
    } as unknown as GainNode;
    const context = {
      get state() { return contextState; },
      destination: {},
      createGain: () => gain,
      createBufferSource: () => source,
      decodeAudioData: async () => ({} as AudioBuffer),
      resume: async () => { contextState = 'running'; },
      close: async () => { contextState = 'closed'; contextClosed = true; },
    } as unknown as AudioContext;
    const service = new WebAudioService({
      createContext: () => context,
      fetch: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });

    await service.load('impact', '/impact.ogg');
    await service.unlock();
    const voice = service.play('impact', { volume: 0.5, playbackRate: 1.25 });
    expect(sourceStarted).toBe(true);
    expect(voice.playing).toBe(true);
    service.setMasterVolume(0.75);
    expect(service.masterVolume).toBe(0.75);
    voice.setVolume(0.25);
    expect(gain.gain.value).toBe(0.25);
    voice.stop();
    expect(sourceStopped).toBe(true);
    expect(voice.playing).toBe(false);

    await service.destroy();
    expect(contextClosed).toBe(true);
    expect(service.state).toBe('destroyed');
  });

  it('deduplicates concurrent loads and rejects unknown playback ids', async () => {
    let requests = 0;
    const context = {
      state: 'running', destination: {},
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined }) as unknown as GainNode,
      decodeAudioData: async () => ({} as AudioBuffer),
      close: async () => undefined,
    } as unknown as AudioContext;
    const service = new WebAudioService({
      createContext: () => context,
      fetch: async () => { requests += 1; return new Response(new Uint8Array([1]), { status: 200 }); },
    });

    await Promise.all([service.load('music', '/music.ogg'), service.load('music', '/music.ogg')]);
    expect(requests).toBe(1);
    expect(() => service.play('missing')).toThrow('not loaded');
    await service.destroy();
  });
});
