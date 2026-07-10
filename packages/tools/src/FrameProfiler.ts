export interface FrameProfileSummary {
  readonly sampleCount: number;
  readonly cpu: FrameTimePercentiles;
  readonly gpu: FrameTimePercentiles | undefined;
}

export interface FrameTimePercentiles {
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly maximum: number;
}

export class FrameProfiler {
  private readonly cpuSamples: number[] = [];
  private readonly gpuSamples: number[] = [];

  constructor(readonly capacity = 600) {
    if (!Number.isSafeInteger(capacity) || capacity < 2) throw new Error('Profiler capacity must be an integer of at least two');
  }

  record(cpuMilliseconds: number, gpuMilliseconds?: number): void {
    pushSample(this.cpuSamples, cpuMilliseconds, this.capacity, 'CPU frame time');
    if (gpuMilliseconds !== undefined) pushSample(this.gpuSamples, gpuMilliseconds, this.capacity, 'GPU frame time');
  }

  reset(): void {
    this.cpuSamples.length = 0;
    this.gpuSamples.length = 0;
  }

  get summary(): FrameProfileSummary {
    return Object.freeze({
      sampleCount: this.cpuSamples.length,
      cpu: summarize(this.cpuSamples),
      gpu: this.gpuSamples.length > 0 ? summarize(this.gpuSamples) : undefined,
    });
  }
}

function pushSample(samples: number[], value: number, capacity: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite number`);
  samples.push(value);
  if (samples.length > capacity) samples.shift();
}

function summarize(samples: readonly number[]): FrameTimePercentiles {
  if (samples.length === 0) return Object.freeze({ mean: 0, p50: 0, p95: 0, p99: 0, maximum: 0 });
  const ordered = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    mean: ordered.reduce((sum, value) => sum + value, 0) / ordered.length,
    p50: percentile(ordered, 0.5),
    p95: percentile(ordered, 0.95),
    p99: percentile(ordered, 0.99),
    maximum: ordered[ordered.length - 1] ?? 0,
  });
}

function percentile(ordered: readonly number[], fraction: number): number {
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = ordered[lower] ?? 0;
  const upperValue = ordered[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}
