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
  private nextFrameTimestamp: number | undefined;
  private running = false;
  private maxFps: number | undefined;

  constructor(
    private readonly engine: GameEngine,
    private readonly driver: AnimationFrameDriver = browserAnimationFrameDriver(),
    private readonly onError?: (error: unknown) => void,
    private readonly options: BrowserFrameLoopOptions = {},
  ) {
    this.maxFps = options.maxFps;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setMaxFps(maxFps: number | undefined): void {
    this.maxFps = maxFps;
    this.nextFrameTimestamp = this.previousTimestamp === undefined || !maxFps || maxFps <= 0
      ? undefined
      : this.previousTimestamp + 1_000 / maxFps;
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
    this.nextFrameTimestamp = undefined;
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) return;
    const minimumFrameMs = this.maxFps && this.maxFps > 0 ? 1_000 / this.maxFps : 0;
    if (minimumFrameMs > 0 && this.nextFrameTimestamp !== undefined && timestamp < this.nextFrameTimestamp - 1.5) {
      this.frameHandle = this.driver.request(this.onFrame);
      return;
    }
    const previous = this.previousTimestamp ?? timestamp;
    this.previousTimestamp = timestamp;
    if (minimumFrameMs > 0) {
      const nextDeadline = (this.nextFrameTimestamp ?? timestamp) + minimumFrameMs;
      this.nextFrameTimestamp = nextDeadline < timestamp ? timestamp + minimumFrameMs : nextDeadline;
    } else {
      this.nextFrameTimestamp = undefined;
    }
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
