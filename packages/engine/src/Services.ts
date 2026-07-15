import {
  AssetManager,
  ComponentSchemaRegistry,
  EventBus,
  Hierarchy,
  InputState,
  SceneManager,
  Schedule,
  World,
  WorldSerializer,
  createExtensionToken,
  type JsonValue,
} from '@hooksjam/gl-game-lab-core';
import { InputSourceRegistry } from './InputSourceRegistry.js';
import type { Render2DService } from './Render2D.js';
import type { Gpu2DService } from './Gpu2D.js';
import type { EngineDiagnostics } from './Diagnostics.js';
import type { AdaptiveQualityService } from './Quality.js';

export const EngineWorld = createExtensionToken<World>('gl-game-lab.engine.world');
export const EngineHierarchy = createExtensionToken<Hierarchy>('gl-game-lab.engine.hierarchy');
export const EngineEvents = createExtensionToken<EventBus>('gl-game-lab.engine.events');
export const EngineInput = createExtensionToken<InputState>('gl-game-lab.engine.input');
export const EngineInputSources = createExtensionToken<InputSourceRegistry>('gl-game-lab.engine.input-sources');
export const EngineAssets = createExtensionToken<AssetManager>('gl-game-lab.engine.assets');
export const EngineSchedule = createExtensionToken<Schedule>('gl-game-lab.engine.schedule');
export const EngineScenes = createExtensionToken<SceneManager>('gl-game-lab.engine.scenes');
export const EngineSchemas = createExtensionToken<ComponentSchemaRegistry>('gl-game-lab.engine.schemas');
export const EngineSerializer = createExtensionToken<WorldSerializer>('gl-game-lab.engine.serializer');
export const EngineDiagnosticsService = createExtensionToken<EngineDiagnostics>('gl-game-lab.engine.diagnostics');
export const EngineQuality = createExtensionToken<AdaptiveQualityService>('gl-game-lab.engine.quality');

export type RenderBackendApi = 'webgl2' | 'webgpu' | 'headless';
export type RenderBackendState = 'ready' | 'context-lost' | 'destroyed';

export interface RenderViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface RenderBackendCapabilities {
  readonly api: RenderBackendApi;
  readonly gpuSimulation: boolean;
  readonly renderTargets: boolean;
  readonly instancing: boolean;
}

/** Host-facing renderer contract. It intentionally exposes no browser or GPU API types. */
export interface RenderBackend {
  readonly id: string;
  readonly state: RenderBackendState;
  readonly viewport: RenderViewport;
  readonly capabilities: RenderBackendCapabilities;
  resize(cssWidth: number, cssHeight: number, pixelRatio?: number): void;
  /** Requests one presentation even when the next frame contains no visual submissions. */
  requestRender(): void;
  /** Presents and reads a frame before the browser can discard its default framebuffer. */
  captureRgba(presentFrame: () => void): Uint8Array;
  readRgba(): Uint8Array;
}

export const EngineRenderer = createExtensionToken<RenderBackend>('gl-game-lab.engine.renderer');
export const EngineRender2D = createExtensionToken<Render2DService>('gl-game-lab.engine.render-2d');
export const EngineGpu2D = createExtensionToken<Gpu2DService>('gl-game-lab.engine.gpu-2d');

export type PlatformServiceState = 'ready' | 'suspended' | 'destroyed';

export interface AudioPlaybackOptions {
  readonly volume?: number;
  readonly loop?: boolean;
  readonly playbackRate?: number;
}

export interface AudioVoice {
  readonly id: number;
  readonly playing: boolean;
  stop(): void;
  setVolume(volume: number): void;
}

export interface AudioService {
  readonly state: PlatformServiceState;
  readonly masterVolume: number;
  unlock(): Promise<void>;
  load(id: string, source: string, signal?: AbortSignal): Promise<void>;
  unload(id: string): void;
  play(id: string, options?: AudioPlaybackOptions): AudioVoice;
  setMasterVolume(volume: number): void;
}

export type StoredValue = JsonValue;

export interface StorageService {
  get<T extends StoredValue>(key: string): Promise<T | undefined>;
  set(key: string, value: StoredValue): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}

export interface WorkerTaskOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface WorkerService {
  execute<TInput, TOutput>(moduleUrl: string, input: TInput, options?: WorkerTaskOptions): Promise<TOutput>;
}

export type AccessibilityPoliteness = 'polite' | 'assertive';

export interface AccessibilityService {
  readonly enabled: boolean;
  announce(message: string, politeness?: AccessibilityPoliteness): void;
  setStatus(message: string): void;
}

export const EngineAudio = createExtensionToken<AudioService>('gl-game-lab.engine.audio');
export const EngineStorage = createExtensionToken<StorageService>('gl-game-lab.engine.storage');
export const EngineWorkers = createExtensionToken<WorkerService>('gl-game-lab.engine.workers');
export const EngineAccessibility = createExtensionToken<AccessibilityService>('gl-game-lab.engine.accessibility');
