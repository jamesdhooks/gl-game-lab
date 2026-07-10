import { useEffect, useRef, type CSSProperties } from 'react';
import type { EnginePlugin } from '@hooksjam/gl-game-lab-core';
import { GameEngine } from '@hooksjam/gl-game-lab-engine';
import { BrowserFrameLoop, WebInputAdapter } from '@hooksjam/gl-game-lab-platform-web';
import {
  WebGL2RendererService,
  createWebGL2RendererPlugin,
} from '@hooksjam/gl-game-lab-render-webgl2';

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
}

const EMPTY_ENGINE_PLUGINS: readonly EnginePlugin[] = Object.freeze([]);

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
}: GameCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createEngine
      ? createEngine(canvas)
      : createBrowserGameEngine(canvas, createPlugins?.() ?? plugins);
    let disposed = false;
    let initialized = false;
    let loop: BrowserFrameLoop | undefined;
    let inputAdapter: WebInputAdapter | undefined;
    const resize = (): void => {
      if (!engine.kernel.has(WebGL2RendererService)) return;
      const renderer = engine.kernel.get(WebGL2RendererService);
      const bounds = canvas.getBoundingClientRect();
      renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height), window.devicePixelRatio || 1);
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);

    const boot = async (): Promise<void> => {
      try {
        canvas.dataset.engineState = 'initializing';
        delete canvas.dataset.engineError;
        await engine.initialize();
        initialized = true;
        if (disposed) {
          await engine.destroy();
          return;
        }
        resize();
        inputAdapter = new WebInputAdapter(canvas, {
          input: engine.input,
          preventDefault: preventDefaultInput,
          getViewport: () => {
            const renderer = engine.kernel.tryGet(WebGL2RendererService);
            if (renderer) {
              const camera = renderer.sprites.activeCamera;
              return { width: camera.viewportWidth, height: camera.viewportHeight };
            }
            const bounds = canvas.getBoundingClientRect();
            return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
          },
        });
        await engine.start();
        if (disposed) {
          await engine.destroy();
          return;
        }
        loop = new BrowserFrameLoop(engine);
        loop.start();
        canvas.dataset.engineState = 'running';
        onReady?.(engine);
      } catch (error) {
        canvas.dataset.engineState = 'error';
        canvas.dataset.engineError = describeError(error);
        if (onError) onError(error);
        else queueMicrotask(() => {
          throw error;
        });
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
      if (initialized) void engine.destroy();
    };
  }, [createEngine, createPlugins, onError, onReady, plugins]);

  return <canvas ref={canvasRef} className={className} style={style} aria-label={ariaLabel} data-engine-state="created" />;
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
