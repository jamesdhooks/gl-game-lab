export interface CaptureFrameSource {
  readonly width: number;
  readonly height: number;
  readRgba(): Uint8Array;
}

export interface FrameCapturePlan {
  readonly id: string;
  readonly frameNumbers: readonly number[];
  readonly fixedDeltaSeconds: number;
}

export interface CapturedFrame {
  readonly frameNumber: number;
  readonly elapsedSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly checksum: string;
  readonly rgba: Uint8Array;
}

export interface FrameCaptureManifestEntry {
  readonly frameNumber: number;
  readonly elapsedSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly checksum: string;
}

export interface FrameCaptureManifest {
  readonly id: string;
  readonly fixedDeltaSeconds: number;
  readonly frames: readonly FrameCaptureManifestEntry[];
}

export class FrameCaptureSession {
  private readonly scheduledFrames: ReadonlySet<number>;
  private readonly capturedFrames = new Map<number, CapturedFrame>();
  readonly plan: FrameCapturePlan;

  constructor(private readonly source: CaptureFrameSource, plan: FrameCapturePlan) {
    this.plan = normalizeCapturePlan(plan);
    this.scheduledFrames = new Set(this.plan.frameNumbers);
  }

  capture(frameNumber: number): CapturedFrame | undefined {
    requireFrameNumber(frameNumber);
    if (!this.scheduledFrames.has(frameNumber)) return undefined;
    const existing = this.capturedFrames.get(frameNumber);
    if (existing) return existing;
    const width = requireDimension(this.source.width, 'Capture width');
    const height = requireDimension(this.source.height, 'Capture height');
    const rgba = this.source.readRgba();
    if (rgba.length !== width * height * 4) throw new Error('Capture source RGBA length does not match its dimensions');
    const frame = Object.freeze({
      frameNumber,
      elapsedSeconds: frameNumber * this.plan.fixedDeltaSeconds,
      width,
      height,
      checksum: checksumRgba(rgba),
      rgba: rgba.slice(),
    });
    this.capturedFrames.set(frameNumber, frame);
    return frame;
  }

  get isComplete(): boolean {
    return this.capturedFrames.size === this.plan.frameNumbers.length;
  }

  get frames(): readonly CapturedFrame[] {
    return Object.freeze(this.plan.frameNumbers.flatMap((frameNumber) => {
      const frame = this.capturedFrames.get(frameNumber);
      return frame ? [frame] : [];
    }));
  }

  get manifest(): FrameCaptureManifest {
    return Object.freeze({
      id: this.plan.id,
      fixedDeltaSeconds: this.plan.fixedDeltaSeconds,
      frames: Object.freeze(this.frames.map(({ rgba: _rgba, ...entry }) => Object.freeze(entry))),
    });
  }
}

export function normalizeCapturePlan(plan: FrameCapturePlan): FrameCapturePlan {
  if (plan.id.trim().length === 0) throw new Error('Capture plan id cannot be empty');
  if (!Number.isFinite(plan.fixedDeltaSeconds) || plan.fixedDeltaSeconds <= 0) {
    throw new Error('Capture fixed delta must be positive');
  }
  const frameNumbers = [...new Set(plan.frameNumbers.map(requireFrameNumber))].sort((left, right) => left - right);
  if (frameNumbers.length === 0) throw new Error('Capture plan requires at least one frame');
  return Object.freeze({ id: plan.id, fixedDeltaSeconds: plan.fixedDeltaSeconds, frameNumbers: Object.freeze(frameNumbers) });
}

export function checksumRgba(rgba: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of rgba) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function requireFrameNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Capture frame number must be a non-negative integer');
  return value;
}

function requireDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
