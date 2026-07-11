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
  EngineDiagnosticsService,
  EngineQuality,
  EngineEvents,
  EngineHierarchy,
  EngineInput,
  EngineInputSources,
  EngineSchedule,
  EngineScenes,
  EngineSchemas,
  EngineSerializer,
  EngineWorld,
} from './Services.js';
import { InputSourceRegistry } from './InputSourceRegistry.js';
import { advanceSpriteAnimations } from './Render2D.js';
import { EngineDiagnostics } from './Diagnostics.js';
import { AdaptiveQualityService } from './Quality.js';

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
  readonly inputSources = new InputSourceRegistry();
  readonly assets: AssetManager;
  readonly diagnostics = new EngineDiagnostics();
  readonly quality = new AdaptiveQualityService();
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
    this.schedule.setProfiler(this.diagnostics);
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
    this.diagnostics.beginFrame(realDeltaSeconds);
    try {
      this.inputSources.poll(this.input);
      this.input.advanceFrame();
      this.runner.runFrame(realDeltaSeconds);
    } finally {
      this.diagnostics.endFrame(this.assets.diagnostics());
    }
  }

  async stop(): Promise<void> {
    await this.kernel.stop();
  }

  async destroy(): Promise<void> {
    if (this.kernel.state !== 'created') {
      await this.kernel.destroy();
      return;
    }
    const failures: unknown[] = [];
    try {
      await this.disposeRuntime();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.kernel.destroy();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Game engine destruction failed');
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
        context.provide(EngineInputSources, this.inputSources);
        context.provide(EngineAssets, this.assets);
        context.provide(EngineDiagnosticsService, this.diagnostics);
        context.provide(EngineQuality, this.quality);
        context.provide(EngineSchedule, this.schedule);
        context.provide(EngineScenes, this.scenes);
        context.provide(EngineSchemas, this.schemas);
        context.provide(EngineSerializer, this.serializer);
        this.schedule.addSystem({
          id: 'gl-game-lab.runtime.sprite-animation-2d',
          stage: 'update',
          access: { writes: ['engine.render-2d.sprite', 'engine.render-2d.animation'] },
          run: ({ time }) => { advanceSpriteAnimations(this.world, time.deltaSeconds); },
        });
      },
      start: () => { this.runner.start(); },
      stop: () => { this.runner.stop(); },
      dispose: () => this.disposeRuntime(),
    };
  }

  private async disposeRuntime(): Promise<void> {
    if (this.runtimeDisposed) return;
    this.runtimeDisposed = true;
    const failures: unknown[] = [];
    try {
      await this.scenes.unloadAll();
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.assets.destroy();
    } catch (error) {
      failures.push(error);
    } finally {
      this.hierarchy.destroy();
    }
    try {
      this.inputSources.reset(this.input);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, 'Game runtime disposal failed');
  }
}
