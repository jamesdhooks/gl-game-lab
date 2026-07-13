import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from 'react';
import type { EnginePlugin, InputEvent } from '@hooksjam/gl-game-lab-core';
import {
  EngineRenderer,
  EngineAccessibility,
  EngineQuality,
  ExperienceRuntimeControllerService,
  GameEngine,
  type EngineDiagnosticsSnapshot,
  type PerformanceBudgetResult,
} from '@hooksjam/gl-game-lab-engine';
import {
  BrowserFrameLoop,
  WebInputAdapter,
  createWebPlatformPlugin,
  type WebPlatformPluginOptions,
} from '@hooksjam/gl-game-lab-platform-web';
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
  readonly diagnostics: EngineDiagnosticsSnapshot;
  readonly budgets: readonly PerformanceBudgetResult[];
}

export interface CanvasFrameCapture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface GameCanvasHandle {
  captureFrame(): Promise<CanvasFrameCapture>;
}

export interface LogicalCanvasViewport {
  readonly width: number;
  readonly height: number;
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
  readonly showDiagnostics?: boolean;
  readonly maxPixels?: number;
  readonly maxFps?: number;
  readonly logicalViewport?: LogicalCanvasViewport;
  readonly onFrame?: (timestamp: number) => void;
}

const EMPTY_ENGINE_PLUGINS: readonly EnginePlugin[] = Object.freeze([]);
const MAX_DEVICE_PIXEL_RATIO = 2;

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

export async function destroyEngineAfterBoot(
  boot: Promise<void>,
  destroyHandle: EngineDestroyHandle,
): Promise<void> {
  await boot;
  await destroyHandle.destroy();
}

export function createBrowserGameEngine(
  canvas: HTMLCanvasElement,
  plugins: readonly EnginePlugin[] = [],
  platform: WebPlatformPluginOptions = {},
): GameEngine {
  return new GameEngine({
    plugins: [createWebGL2RendererPlugin(canvas), createWebPlatformPlugin(canvas, platform), ...plugins],
  });
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(function GameCanvas({
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
  showDiagnostics = false,
  maxPixels,
  maxFps,
  logicalViewport,
  onFrame,
}: GameCanvasProps, forwardedRef): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const diagnosticsRef = useRef<HTMLOutputElement | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onFixedFrameCaptureRef = useRef(onFixedFrameCapture);
  const onFrameRef = useRef(onFrame);
  const captureWaitersRef = useRef<Array<{ resolve: (capture: CanvasFrameCapture) => void; reject: (error: Error) => void }>>([]);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onFixedFrameCaptureRef.current = onFixedFrameCapture;
  onFrameRef.current = onFrame;

  useImperativeHandle(forwardedRef, () => ({
    captureFrame: () => new Promise<CanvasFrameCapture>((resolve, reject) => {
      captureWaitersRef.current.push({ resolve, reject });
    }),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine
      ? createEngine(canvas)
      : createBrowserGameEngine(canvas, createPlugins?.() ?? plugins, { preventDefaultInput });
    let disposed = false;
    let destroyFailureReported = false;
    let loop: BrowserFrameLoop | undefined;
    let fallbackInput: WebInputAdapter | undefined;
    let diagnosticsFrame: number | undefined;
    const destroyHandle = createEngineDestroyHandle(engine);
    const reportError = (error: unknown): void => {
      canvas.dataset.engineState = 'error';
      canvas.dataset.engineError = describeError(error);
      if (onErrorRef.current) onErrorRef.current(error);
      else queueMicrotask(() => { throw error; });
    };
    const resize = (): void => {
      if (!engine.kernel.has(EngineRenderer)) return;
      const renderer = engine.kernel.get(EngineRenderer);
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, logicalViewport?.width ?? bounds.width);
      const height = Math.max(1, logicalViewport?.height ?? bounds.height);
      const pixelRatio = fixedFrameCapture
        ? 1
        : resolvePixelRatio(width, height, window.devicePixelRatio || 1, maxPixels);
      renderer.resize(width, height, pixelRatio);
      engine.kernel.get(EngineQuality).configureViewport(
        width,
        height,
        pixelRatio,
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
        if (!engine.kernel.has(EngineAccessibility)) {
          fallbackInput = new WebInputAdapter(canvas, {
            input: engine.input,
            preventDefault: preventDefaultInput,
            getViewport: () => {
              const renderer = engine.kernel.tryGet(EngineRenderer);
              if (renderer) return { width: renderer.viewport.width, height: renderer.viewport.height };
              const bounds = canvas.getBoundingClientRect();
              return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
            },
          });
        }
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
          const diagnostics = engine.diagnostics.snapshot();
          if (!diagnostics) throw new Error('Fixed frame capture did not produce engine diagnostics');
          const entityCount = engine.kernel.tryGet(ExperienceRuntimeControllerService)?.entityCount;
          const result = Object.freeze({
            ...capture,
            profile: profiler.summary,
            checksum: checksumRgba(renderer.readRgba()),
            diagnostics,
            budgets: Object.freeze([engine.diagnostics.evaluate('desktop'), engine.diagnostics.evaluate('mobile')]),
            ...(entityCount !== undefined ? { entityCount } : {}),
          });
          canvas.dataset.captureFrame = String(capture.frameNumber);
          canvas.dataset.captureDelta = String(capture.fixedDeltaSeconds);
          canvas.dataset.captureCpuP95 = String(result.profile.cpu.p95);
          canvas.dataset.captureChecksum = result.checksum;
          canvas.dataset.captureDrawCalls = String(result.diagnostics.renderer?.drawCalls ?? 0);
          canvas.dataset.captureUploadBytes = String((result.diagnostics.renderer?.bufferUploadBytes ?? 0) + (result.diagnostics.renderer?.textureUploadBytes ?? 0));
          canvas.dataset.captureGpuBytes = String(result.diagnostics.renderer?.gpuResourceBytes ?? 0);
          canvas.dataset.captureDesktopBudget = String(result.budgets.find((budget) => budget.tier === 'desktop')?.passed ?? false);
          canvas.dataset.captureMobileBudget = String(result.budgets.find((budget) => budget.tier === 'mobile')?.passed ?? false);
          canvas.dataset.captureDiagnostics = engine.diagnostics.capture();
          if (result.entityCount !== undefined) canvas.dataset.captureEntityCount = String(result.entityCount);
          canvas.dataset.engineState = 'capture-ready';
          onFixedFrameCaptureRef.current?.(result);
        } else {
          loop = new BrowserFrameLoop(engine, undefined, (error) => {
            reportError(error);
          }, {
            ...(maxFps === undefined ? {} : { maxFps }),
            onAfterFrame: (timestamp) => {
              onFrameRef.current?.(timestamp);
              const waiters = captureWaitersRef.current.splice(0);
              if (waiters.length === 0) return;
              try {
                const renderer = engine.kernel.get(EngineRenderer);
                const capture = Object.freeze({ width: canvas.width, height: canvas.height, rgba: renderer.readRgba() });
                for (const waiter of waiters) waiter.resolve(capture);
              } catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                for (const waiter of waiters) waiter.reject(failure);
              }
            },
          });
          loop.start();
          canvas.dataset.engineState = 'running';
        }
        if (showDiagnostics) {
          const updateDiagnostics = (): void => {
            const output = diagnosticsRef.current;
            const snapshot = engine.diagnostics.snapshot();
            if (output && snapshot) output.textContent = diagnosticText(snapshot);
            diagnosticsFrame = requestAnimationFrame(updateDiagnostics);
          };
          diagnosticsFrame = requestAnimationFrame(updateDiagnostics);
        }
        onReadyRef.current?.(engine);
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
    const bootPromise = boot();

    return () => {
      disposed = true;
      canvas.dataset.engineState = 'destroyed';
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      fallbackInput?.destroy();
      loop?.stop();
      if (diagnosticsFrame !== undefined) cancelAnimationFrame(diagnosticsFrame);
      void destroyEngineAfterBoot(bootPromise, destroyHandle).catch((error) => {
        if (!destroyFailureReported) {
          destroyFailureReported = true;
          reportError(error);
        }
      });
      const waiters = captureWaitersRef.current.splice(0);
      for (const waiter of waiters) waiter.reject(new Error('Game canvas was destroyed before capture completed'));
    };
  }, [createEngine, createPlugins, fixedFrameCapture, logicalViewport?.height, logicalViewport?.width, maxFps, maxPixels, plugins, preventDefaultInput, showDiagnostics]);

  return <Fragment>
    <canvas
      ref={canvasRef}
      className={className}
      style={{ ...style, display: 'block', width: '100%', height: '100%' }}
      aria-label={ariaLabel}
      data-engine-state="created"
    />
    {showDiagnostics ? <output ref={diagnosticsRef} aria-live="off" style={DIAGNOSTICS_STYLE} /> : null}
  </Fragment>;
});

GameCanvas.displayName = 'GameCanvas';

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

export function resolvePixelRatio(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxPixels?: number,
): number {
  if (![width, height, devicePixelRatio].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Canvas pixel ratio inputs must be positive');
  }
  const cappedDeviceRatio = Math.min(devicePixelRatio, MAX_DEVICE_PIXEL_RATIO);
  if (maxPixels === undefined) return cappedDeviceRatio;
  if (!Number.isFinite(maxPixels) || maxPixels <= 0) throw new Error('Canvas maxPixels must be positive');
  return Math.min(cappedDeviceRatio, Math.sqrt(maxPixels / (width * height)));
}

const DIAGNOSTICS_STYLE: CSSProperties = {
  position: 'absolute', top: 8, left: 8, zIndex: 20, pointerEvents: 'none',
  whiteSpace: 'pre', padding: '6px 8px', borderRadius: 4,
  color: '#d8f7ff', background: 'rgba(2, 10, 18, 0.82)',
  font: '11px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace',
};

function diagnosticText(snapshot: EngineDiagnosticsSnapshot): string {
  const renderer = snapshot.renderer;
  const uploads = (renderer?.bufferUploadBytes ?? 0) + (renderer?.textureUploadBytes ?? 0);
  return [
    `${snapshot.fps.toFixed(1)} fps  ${snapshot.frameCpuMs.toFixed(2)} ms CPU`,
    `${renderer?.gpuMs === undefined ? 'GPU timer unavailable' : `${renderer.gpuMs.toFixed(2)} ms GPU`}`,
    `${renderer?.drawCalls ?? 0} draws  ${renderer?.points ?? 0} points`,
    `${formatBytes(uploads)} uploads  ${formatBytes(renderer?.gpuResourceBytes ?? 0)} GPU`,
    `${formatBytes(renderer?.transientAllocationBytes ?? 0)} tracked alloc`,
  ].join('\n');
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
