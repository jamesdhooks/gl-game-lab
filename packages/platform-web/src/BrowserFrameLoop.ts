import type { GameEngine } from '@hooksjam/gl-game-lab-engine';

export interface AnimationFrameDriver {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface BrowserFrameLoopOptions {
  readonly maxFps?: number;
  readonly onAfterFrame?: (timestamp: number) => void;
}

export class BrowserFrameLoop {
  private frameHandle: number | undefined;
  private previousTimestamp: number | undefined;
  private running = false;

  constructor(
    private readonly engine: GameEngine,
    private readonly driver: AnimationFrameDriver = browserAnimationFrameDriver(),
    private readonly onError?: (error: unknown) => void,
    private readonly options: BrowserFrameLoopOptions = {},
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.frameHandle = this.driver.request(this.onFrame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.frameHandle !== undefined) this.driver.cancel(this.frameHandle);
    this.frameHandle = undefined;
    this.previousTimestamp = undefined;
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) return;
    const minimumFrameMs = this.options.maxFps && this.options.maxFps > 0 ? 1_000 / this.options.maxFps : 0;
    if (this.previousTimestamp !== undefined && minimumFrameMs > 0 && timestamp - this.previousTimestamp < minimumFrameMs) {
      this.frameHandle = this.driver.request(this.onFrame);
      return;
    }
    const previous = this.previousTimestamp ?? timestamp;
    this.previousTimestamp = timestamp;
    try {
      this.engine.frame(Math.max(0, timestamp - previous) / 1000);
    } catch (error) {
      this.stop();
      if (this.onError) this.onError(error);
      else queueMicrotask(() => { throw error; });
      return;
    }
    this.options.onAfterFrame?.(timestamp);
    if (this.running) this.frameHandle = this.driver.request(this.onFrame);
  };
}

function browserAnimationFrameDriver(): AnimationFrameDriver {
  if (typeof window === 'undefined') throw new Error('BrowserFrameLoop requires a browser window');
  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}
