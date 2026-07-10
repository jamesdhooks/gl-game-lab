import {
  AssetManager,
  Engine,
  EventBus,
  Hierarchy,
  InputState,
  SceneManager,
  Schedule,
  ScheduleRunner,
  World,
  WorldSerializer,
  createCoreSchemaRegistry,
  type AssetManagerOptions,
  type ClockOptions,
  type EnginePlugin,
} from '@hooksjam/gl-game-lab-core';
import {
  EngineAssets,
  EngineEvents,
  EngineHierarchy,
  EngineInput,
  EngineSchedule,
  EngineScenes,
  EngineSchemas,
  EngineSerializer,
  EngineWorld,
} from './Services.js';

export const GAME_ENGINE_RUNTIME_PLUGIN_ID = 'gl-game-lab.runtime';

export interface GameEngineOptions {
  readonly plugins?: readonly EnginePlugin[];
  readonly clock?: ClockOptions;
  readonly assets?: Omit<AssetManagerOptions, 'events'>;
}

export class GameEngine {
  readonly world = new World();
  readonly hierarchy = new Hierarchy(this.world);
  readonly events = new EventBus();
  readonly input = new InputState();
  readonly assets: AssetManager;
  readonly schedule = new Schedule();
  readonly scenes: SceneManager;
  readonly schemas = createCoreSchemaRegistry();
  readonly serializer = new WorldSerializer(this.schemas);
  readonly runner: ScheduleRunner;
  readonly kernel: Engine;
  private runtimeDisposed = false;

  constructor(options: GameEngineOptions = {}) {
    this.assets = new AssetManager({ ...options.assets, events: this.events });
    this.scenes = new SceneManager(this.world, this.hierarchy, this.events);
    this.runner = new ScheduleRunner(this.schedule, this.world, options.clock);
    this.kernel = new Engine({ plugins: [this.runtimePlugin(), ...(options.plugins ?? [])] });
  }

  get state() {
    return this.kernel.state;
  }

  async initialize(): Promise<void> {
    await this.kernel.initialize();
  }

  async start(): Promise<void> {
    await this.kernel.start();
  }

  frame(realDeltaSeconds: number): void {
    if (this.kernel.state !== 'running') {
      throw new Error(`Game engine cannot run a frame while ${this.kernel.state}`);
    }
    this.input.advanceFrame();
    this.runner.runFrame(realDeltaSeconds);
  }

  async stop(): Promise<void> {
    await this.kernel.stop();
  }

  async destroy(): Promise<void> {
    if (this.kernel.state === 'created') await this.disposeRuntime();
    await this.kernel.destroy();
  }

  private runtimePlugin(): EnginePlugin {
    return {
      id: GAME_ENGINE_RUNTIME_PLUGIN_ID,
      version: '1.0.0',
      install: (context) => {
        context.provide(EngineWorld, this.world);
        context.provide(EngineHierarchy, this.hierarchy);
        context.provide(EngineEvents, this.events);
        context.provide(EngineInput, this.input);
        context.provide(EngineAssets, this.assets);
        context.provide(EngineSchedule, this.schedule);
        context.provide(EngineScenes, this.scenes);
        context.provide(EngineSchemas, this.schemas);
        context.provide(EngineSerializer, this.serializer);
      },
      start: () => { this.runner.start(); },
      stop: () => { this.runner.stop(); },
      dispose: () => this.disposeRuntime(),
    };
  }

  private async disposeRuntime(): Promise<void> {
    if (this.runtimeDisposed) return;
    this.runtimeDisposed = true;
    let firstFailure: unknown;
    try {
      await this.scenes.unloadAll();
    } catch (error) {
      firstFailure = error;
    }
    try {
      await this.assets.destroy();
    } catch (error) {
      firstFailure ??= error;
    } finally {
      this.hierarchy.destroy();
    }
    if (firstFailure !== undefined) throw firstFailure;
  }
}
