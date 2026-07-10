import type { InputEvent } from '@hooksjam/gl-game-lab-core';

export interface RecordedInputFrame {
  readonly frameNumber: number;
  readonly events: readonly InputEvent[];
}

export interface InputRecording {
  readonly version: 1;
  readonly fixedDeltaSeconds: number;
  readonly frames: readonly RecordedInputFrame[];
}

export class InputRecorder {
  private readonly frames = new Map<number, InputEvent[]>();

  constructor(readonly fixedDeltaSeconds: number) {
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) throw new Error('Replay fixed delta must be positive');
  }

  record(frameNumber: number, events: readonly InputEvent[]): void {
    requireFrameNumber(frameNumber);
    const frame = this.frames.get(frameNumber) ?? [];
    frame.push(...events.map(cloneEvent));
    this.frames.set(frameNumber, frame);
  }

  finish(): InputRecording {
    const frames = [...this.frames.entries()]
      .sort(([left], [right]) => left - right)
      .map(([frameNumber, events]) => Object.freeze({ frameNumber, events: Object.freeze(events.map(cloneEvent)) }));
    return Object.freeze({ version: 1, fixedDeltaSeconds: this.fixedDeltaSeconds, frames: Object.freeze(frames) });
  }
}

export class InputReplay {
  private readonly frames: ReadonlyMap<number, readonly InputEvent[]>;

  constructor(readonly recording: InputRecording) {
    if (recording.version !== 1) throw new Error('Unsupported input recording version');
    if (!Number.isFinite(recording.fixedDeltaSeconds) || recording.fixedDeltaSeconds <= 0) throw new Error('Replay fixed delta must be positive');
    const frames = new Map<number, readonly InputEvent[]>();
    let previous = -1;
    for (const frame of recording.frames) {
      requireFrameNumber(frame.frameNumber);
      if (frame.frameNumber <= previous) throw new Error('Replay frames must be strictly increasing');
      previous = frame.frameNumber;
      frames.set(frame.frameNumber, Object.freeze(frame.events.map(cloneEvent)));
    }
    this.frames = frames;
  }

  eventsForFrame(frameNumber: number): readonly InputEvent[] {
    requireFrameNumber(frameNumber);
    return this.frames.get(frameNumber) ?? Object.freeze([]);
  }
}

function cloneEvent(event: InputEvent): InputEvent {
  return Object.freeze({ ...event });
}

function requireFrameNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Replay frame number must be a non-negative integer');
}
