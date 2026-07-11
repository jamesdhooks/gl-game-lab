import type {
  AudioPlaybackOptions,
  AudioService,
  AudioVoice,
  PlatformServiceState,
} from '@hooksjam/gl-game-lab-engine';

export interface WebAudioServiceOptions {
  readonly createContext?: () => AudioContext;
  readonly fetch?: typeof globalThis.fetch;
}

export class WebAudioService implements AudioService {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private volume = 1;
  private voiceId = 1;
  private destroyed = false;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly voices = new Set<ManagedAudioVoice>();
  private readonly createContext: () => AudioContext;
  private readonly fetchSource: typeof globalThis.fetch;

  constructor(options: WebAudioServiceOptions = {}) {
    this.createContext = options.createContext ?? defaultAudioContext;
    this.fetchSource = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get state(): PlatformServiceState {
    if (this.destroyed || this.context?.state === 'closed') return 'destroyed';
    return this.context?.state === 'running' ? 'ready' : 'suspended';
  }

  get masterVolume(): number {
    return this.volume;
  }

  async unlock(): Promise<void> {
    const context = this.requireContext();
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') throw new Error(`Audio context could not start: ${context.state}`);
  }

  load(id: string, source: string, signal?: AbortSignal): Promise<void> {
    this.assertUsable();
    const normalizedId = requireText(id, 'Audio id');
    const normalizedSource = requireText(source, 'Audio source');
    if (this.buffers.has(normalizedId)) return Promise.resolve();
    const existing = this.loading.get(normalizedId);
    if (existing) return existing;
    const operation = this.loadBuffer(normalizedId, normalizedSource, signal);
    this.loading.set(normalizedId, operation);
    void operation.finally(() => { this.loading.delete(normalizedId); }).catch(() => undefined);
    return operation;
  }

  unload(id: string): void {
    this.assertUsable();
    this.buffers.delete(requireText(id, 'Audio id'));
  }

  play(id: string, options: AudioPlaybackOptions = {}): AudioVoice {
    const context = this.requireContext();
    const normalizedId = requireText(id, 'Audio id');
    const buffer = this.buffers.get(normalizedId);
    if (!buffer) throw new Error(`Audio is not loaded: ${normalizedId}`);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const volume = requireUnit(options.volume ?? 1, 'Audio voice volume');
    const playbackRate = requirePositive(options.playbackRate ?? 1, 'Audio playback rate');
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = playbackRate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.requireMaster());
    const voice = new ManagedAudioVoice(this.voiceId, source, gain, volume, () => {
      this.voices.delete(voice);
    });
    this.voiceId += 1;
    this.voices.add(voice);
    source.start();
    return voice;
  }

  setMasterVolume(volume: number): void {
    this.assertUsable();
    this.volume = requireUnit(volume, 'Master volume');
    if (this.master) this.master.gain.value = this.volume;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.buffers.clear();
    this.loading.clear();
    const context = this.context;
    this.context = undefined;
    this.master = undefined;
    if (context && context.state !== 'closed') await context.close();
  }

  private async loadBuffer(id: string, source: string, signal?: AbortSignal): Promise<void> {
    const response = await this.fetchSource(source, signal ? { signal } : undefined);
    if (!response.ok) throw new Error(`Audio request failed (${response.status}): ${source}`);
    const buffer = await this.requireContext().decodeAudioData(await response.arrayBuffer());
    if (this.destroyed) throw new Error('Web audio service was destroyed during loading');
    this.buffers.set(id, buffer);
  }

  private requireContext(): AudioContext {
    this.assertUsable();
    if (!this.context) {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private requireMaster(): GainNode {
    this.requireContext();
    if (!this.master) throw new Error('Audio master gain is unavailable');
    return this.master;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Web audio service has been destroyed');
  }
}

class ManagedAudioVoice implements AudioVoice {
  private active = true;

  constructor(
    readonly id: number,
    private readonly source: AudioBufferSourceNode,
    private readonly gain: GainNode,
    volume: number,
    private readonly onStop: () => void,
  ) {
    this.gain.gain.value = volume;
    source.onended = () => { this.finish(); };
  }

  get playing(): boolean {
    return this.active;
  }

  stop(): void {
    if (!this.active) return;
    try { this.source.stop(); } catch { /* The source may already have ended. */ }
    this.finish();
  }

  setVolume(volume: number): void {
    if (!this.active) throw new Error('Audio voice has stopped');
    this.gain.gain.value = requireUnit(volume, 'Audio voice volume');
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    this.source.disconnect();
    this.gain.disconnect();
    this.onStop();
  }
}

function defaultAudioContext(): AudioContext {
  const Constructor = globalThis.AudioContext;
  if (!Constructor) throw new Error('Web Audio API is unavailable');
  return new Constructor();
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${label} cannot be empty`);
  return normalized;
}

function requireUnit(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between zero and one`);
  return value;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
  return value;
}
