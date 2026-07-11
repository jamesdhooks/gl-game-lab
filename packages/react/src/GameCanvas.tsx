import { useEffect, useRef, type CSSProperties } from 'react';
import type { EnginePlugin, InputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineRenderer,
  ExperienceRuntimeControllerService,
  GameEngine,
} from '@hooksjam/gl-game-lab-engine';
import { BrowserFrameLoop, WebInputAdapter } from '@hooksjam/gl-game-lab-platform-web';
import { createWebGL2RendererPlugin } from '@hooksjam/gl-game-lab-render-webgl2';
import { FrameProfiler, checksumRgba, type FrameProfileSummary } from '@hooksjam/gl-game-lab-tools';

export interface FixedFrameCaptureOptions {
  readonly frameNumber: number;
  readonly fixedDeltaSeconds?: number;
  readonly inputEvents?: readonly FixedFrameInputEvent[];
}

export interface FixedFrameInputEvent {
  readonly frameNumber: number;
  readonly event: InputEvent;
}

export interface FixedFrameCaptureResult {
  readonly frameNumber: number;
  readonly fixedDeltaSeconds: number;
  readonly profile: FrameProfileSummary;
  readonly checksum: string;
  readonly entityCount?: number;
}

export interface GameCanvasProps {
  readonly plugins?: readonly EnginePlugin[];
  readonly createPlugins?: () => readonly EnginePlugin[];
  readonly createEngine?: (canvas: HTMLCanvasElement) => GameEngine;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onReady?: (engine: GameEngine) => void;
  readonly onError?: (error: unknown) => void;
  readonly ariaLabel?: string;
  readonly preventDefaultInput?: boolean;
  readonly fixedFrameCapture?: FixedFrameCaptureOptions;
  readonly onFixedFrameCapture?: (result: FixedFrameCaptureResult) => void;
}

const EMPTY_ENGINE_PLUGINS: readonly EnginePlugin[] = Object.freeze([]);

export interface EngineDestroyHandle {
  readonly started: boolean;
  destroy(): Promise<void>;
}

export function createEngineDestroyHandle(engine: Pick<GameEngine, 'destroy'>): EngineDestroyHandle {
  let promise: Promise<void> | undefined;
  return {
    get started() { return promise !== undefined; },
    destroy() {
      promise ??= Promise.resolve().then(() => engine.destroy());
      return promise;
    },
  };
}

export function createBrowserGameEngine(canvas: HTMLCanvasElement, plugins: readonly EnginePlugin[] = []): GameEngine {
  return new GameEngine({ plugins: [createWebGL2RendererPlugin(canvas), ...plugins] });
}

export function GameCanvas({
  plugins = EMPTY_ENGINE_PLUGINS,
  createPlugins,
  createEngine,
  className,
  style,
  onReady,
  onError,
  ariaLabel = 'GLGameLab game canvas',
  preventDefaultInput = true,
  fixedFrameCapture,
  onFixedFrameCapture,
}: GameCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine
      ? createEngine(canvas)
      : createBrowserGameEngine(canvas, createPlugins?.() ?? plugins);
    let disposed = false;
    let destroyFailureReported = false;
    let loop: BrowserFrameLoop | undefined;
    let inputAdapter: WebInputAdapter | undefined;
    const destroyHandle = createEngineDestroyHandle(engine);
    const reportError = (error: unknown): void => {
      canvas.dataset.engineState = 'error';
      canvas.dataset.engineError = describeError(error);
      if (onError) onError(error);
      else queueMicrotask(() => { throw error; });
    };
    const resize = (): void => {
      if (!engine.kernel.has(EngineRenderer)) return;
      const renderer = engine.kernel.get(EngineRenderer);
      const bounds = canvas.getBoundingClientRect();
      renderer.resize(
        Math.max(1, bounds.width),
        Math.max(1, bounds.height),
        fixedFrameCapture ? 1 : window.devicePixelRatio || 1,
      );
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);

    const boot = async (): Promise<void> => {
      try {
        canvas.dataset.engineState = 'initializing';
        delete canvas.dataset.engineError;
        await engine.initialize();
        if (disposed) {
          await destroyHandle.destroy();
          return;
        }
        resize();
        inputAdapter = new WebInputAdapter(canvas, {
          input: engine.input,
          preventDefault: preventDefaultInput,
          getViewport: () => {
            const renderer = engine.kernel.tryGet(EngineRenderer);
            if (renderer) {
              return { width: renderer.viewport.width, height: renderer.viewport.height };
            }
            const bounds = canvas.getBoundingClientRect();
            return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
          },
        });
        await engine.start();
        if (disposed) {
          await destroyHandle.destroy();
          return;
        }
        if (fixedFrameCapture) {
          const capture = normalizeFixedFrameCapture(fixedFrameCapture);
          const profiler = new FrameProfiler(Math.max(2, capture.frameNumber));
          let inputEventIndex = 0;
          for (let frame = 0; frame < capture.frameNumber; frame += 1) {
            while (true) {
              const inputEvent = capture.inputEvents[inputEventIndex];
              if (!inputEvent || inputEvent.frameNumber !== frame) break;
              engine.input.ingest(inputEvent.event);
              inputEventIndex += 1;
            }
            const startedAt = performance.now();
            engine.frame(capture.fixedDeltaSeconds);
            profiler.record(performance.now() - startedAt);
          }
          const renderer = engine.kernel.get(EngineRenderer);
          const entityCount = engine.kernel.tryGet(ExperienceRuntimeControllerService)?.entityCount;
          const result = Object.freeze({
            ...capture,
            profile: profiler.summary,
            checksum: checksumRgba(renderer.readRgba()),
            ...(entityCount !== undefined ? { entityCount } : {}),
          });
          canvas.dataset.captureFrame = String(capture.frameNumber);
          canvas.dataset.captureDelta = String(capture.fixedDeltaSeconds);
          canvas.dataset.captureCpuP95 = String(result.profile.cpu.p95);
          canvas.dataset.captureChecksum = result.checksum;
          if (result.entityCount !== undefined) canvas.dataset.captureEntityCount = String(result.entityCount);
          canvas.dataset.engineState = 'capture-ready';
          onFixedFrameCapture?.(result);
        } else {
          loop = new BrowserFrameLoop(engine, undefined, (error) => {
            reportError(error);
          });
          loop.start();
          canvas.dataset.engineState = 'running';
        }
        onReady?.(engine);
      } catch (error) {
        let failure = error;
        if (destroyHandle.started) {
          destroyFailureReported = true;
        } else {
          try {
            await destroyHandle.destroy();
          } catch (cleanupError) {
            destroyFailureReported = true;
            failure = new AggregateError([error, cleanupError], 'Game canvas boot and cleanup failed');
          }
        }
        reportError(failure);
      }
    };
    void boot();

    return () => {
      disposed = true;
      canvas.dataset.engineState = 'destroyed';
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      inputAdapter?.destroy();
      loop?.stop();
      void destroyHandle.destroy().catch((error) => {
        if (!destroyFailureReported) {
          destroyFailureReported = true;
          reportError(error);
        }
      });
    };
  }, [createEngine, createPlugins, fixedFrameCapture, onError, onFixedFrameCapture, onReady, plugins, preventDefaultInput]);

  return <canvas ref={canvasRef} className={className} style={style} aria-label={ariaLabel} data-engine-state="created" />;
}

export function normalizeFixedFrameCapture(options: FixedFrameCaptureOptions): Required<FixedFrameCaptureOptions> {
  if (!Number.isSafeInteger(options.frameNumber) || options.frameNumber < 1 || options.frameNumber > 10_000) {
    throw new Error('Fixed capture frame number must be an integer between 1 and 10000');
  }
  const fixedDeltaSeconds = options.fixedDeltaSeconds ?? 1 / 60;
  if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0 || fixedDeltaSeconds > 0.25) {
    throw new Error('Fixed capture delta must be greater than zero and at most 0.25 seconds');
  }
  const inputEvents = [...(options.inputEvents ?? [])];
  let previousFrame = -1;
  for (const entry of inputEvents) {
    if (!Number.isSafeInteger(entry.frameNumber) || entry.frameNumber < 0 || entry.frameNumber >= options.frameNumber) {
      throw new Error('Fixed capture input frame must be within the capture frame range');
    }
    if (entry.frameNumber < previousFrame) throw new Error('Fixed capture input events must be ordered by frame');
    previousFrame = entry.frameNumber;
  }
  return Object.freeze({ frameNumber: options.frameNumber, fixedDeltaSeconds, inputEvents: Object.freeze(inputEvents) });
}

function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  if (messages.length === 0) messages.push(String(error));
  return messages.join(': ');
}
