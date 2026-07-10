export interface ClockOptions {
  readonly fixedDeltaSeconds?: number;
  readonly maximumFrameDeltaSeconds?: number;
  readonly maximumFixedStepsPerFrame?: number;
  readonly timeScale?: number;
}

export interface TimeSnapshot {
  readonly frame: number;
  readonly fixedStep: number;
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
  readonly realDeltaSeconds: number;
  readonly realElapsedSeconds: number;
  readonly interpolationAlpha: number;
  readonly isFixed: boolean;
  readonly paused: boolean;
  readonly timeScale: number;
}

export interface FrameAdvance {
  readonly fixed: readonly TimeSnapshot[];
  readonly variable: TimeSnapshot;
  readonly droppedFixedSeconds: number;
}

export class Clock {
  private readonly fixedDelta: number;
  private readonly maximumFrameDelta: number;
  private readonly maximumFixedSteps: number;
  private scale: number;
  private isPaused = false;
  private frame = 0;
  private fixedStep = 0;
  private elapsed = 0;
  private fixedElapsed = 0;
  private realElapsed = 0;
  private accumulator = 0;
  private requestedSteps = 0;

  constructor(options: ClockOptions = {}) {
    this.fixedDelta = requirePositiveFinite(options.fixedDeltaSeconds ?? 1 / 60, 'fixed delta');
    this.maximumFrameDelta = requirePositiveFinite(
      options.maximumFrameDeltaSeconds ?? 0.25,
      'maximum frame delta',
    );
    this.maximumFixedSteps = requirePositiveInteger(
      options.maximumFixedStepsPerFrame ?? 8,
      'maximum fixed steps',
    );
    this.scale = requireNonNegativeFinite(options.timeScale ?? 1, 'time scale');
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get timeScale(): number {
    return this.scale;
  }

  get fixedDeltaSeconds(): number {
    return this.fixedDelta;
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  setTimeScale(scale: number): void {
    this.scale = requireNonNegativeFinite(scale, 'time scale');
  }

  requestFixedSteps(count = 1): void {
    this.requestedSteps += requirePositiveInteger(count, 'requested fixed steps');
  }

  current(): TimeSnapshot {
    return this.snapshot({
      deltaSeconds: 0,
      elapsedSeconds: this.elapsed,
      realDeltaSeconds: 0,
      interpolationAlpha: this.accumulator / this.fixedDelta,
      isFixed: false,
    });
  }

  advance(realDeltaSeconds: number): FrameAdvance {
    const rawDelta = requireNonNegativeFinite(realDeltaSeconds, 'frame delta');
    const realDelta = Math.min(rawDelta, this.maximumFrameDelta);
    const scaledDelta = this.isPaused ? 0 : realDelta * this.scale;
    this.frame += 1;
    this.realElapsed += rawDelta;
    this.elapsed += scaledDelta;
    this.accumulator += scaledDelta;

    const automaticSteps = Math.floor((this.accumulator + this.fixedDelta * 1e-9) / this.fixedDelta);
    const automaticStepsUsed = Math.min(automaticSteps, this.maximumFixedSteps);
    const requestedStepsUsed = Math.min(
      this.requestedSteps,
      this.maximumFixedSteps - automaticStepsUsed,
    );
    const fixedStepCount = automaticStepsUsed + requestedStepsUsed;
    this.requestedSteps -= requestedStepsUsed;
    const droppedSteps = automaticSteps - automaticStepsUsed;
    const droppedFixedSeconds = droppedSteps * this.fixedDelta;
    this.accumulator = Math.max(
      0,
      this.accumulator - (automaticStepsUsed + droppedSteps) * this.fixedDelta,
    );

    const fixed: TimeSnapshot[] = [];
    for (let index = 0; index < fixedStepCount; index += 1) {
      this.fixedStep += 1;
      this.fixedElapsed += this.fixedDelta;
      fixed.push(this.snapshot({
        deltaSeconds: this.fixedDelta,
        elapsedSeconds: this.fixedElapsed,
        realDeltaSeconds: realDelta,
        interpolationAlpha: 0,
        isFixed: true,
      }));
    }

    return {
      fixed,
      variable: this.snapshot({
        deltaSeconds: scaledDelta,
        elapsedSeconds: this.elapsed,
        realDeltaSeconds: realDelta,
        interpolationAlpha: this.accumulator / this.fixedDelta,
        isFixed: false,
      }),
      droppedFixedSeconds,
    };
  }

  private snapshot(values: Pick<
    TimeSnapshot,
    'deltaSeconds' | 'elapsedSeconds' | 'realDeltaSeconds' | 'interpolationAlpha' | 'isFixed'
  >): TimeSnapshot {
    return Object.freeze({
      frame: this.frame,
      fixedStep: this.fixedStep,
      realElapsedSeconds: this.realElapsed,
      paused: this.isPaused,
      timeScale: this.scale,
      ...values,
    });
  }
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`);
  return value;
}

function requireNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative and finite`);
  return value;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}
