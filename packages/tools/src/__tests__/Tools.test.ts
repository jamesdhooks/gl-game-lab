import { describe, expect, it } from 'vitest';
import {
  FrameCaptureSession,
  FrameProfiler,
  InputRecorder,
  InputReplay,
  compareCaptureSequences,
  compareRgba,
} from '../index.js';

describe('frame capture and visual comparison', () => {
  it('captures only scheduled deterministic frames with stable checksums', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const session = new FrameCaptureSession({ width: 2, height: 1, readRgba: () => pixels }, {
      id: 'ball-pit.neon.single',
      frameNumbers: [60, 0, 60],
      fixedDeltaSeconds: 1 / 60,
    });
    expect(session.capture(1)).toBeUndefined();
    expect(session.capture(0)?.checksum).toBe('163e4e7b');
    expect(session.capture(60)?.elapsedSeconds).toBe(1);
    expect(session.isComplete).toBe(true);
    expect(session.manifest.frames.map((frame) => frame.frameNumber)).toEqual([0, 60]);
  });

  it('scores identical images at one and detects a visible change', () => {
    const reference = new Uint8Array(8 * 8 * 4).fill(255);
    const identical = compareRgba(reference, reference.slice(), 8, 8);
    expect(identical.ssim).toBe(1);
    expect(identical.passed).toBe(true);
    const changed = reference.slice();
    changed.fill(0, 0, changed.length / 2);
    expect(compareRgba(reference, changed, 8, 8).passed).toBe(false);
  });

  it('compares aligned deterministic sequences', () => {
    const pixels = new Uint8Array([10, 20, 30, 255]);
    const source = { width: 1, height: 1, readRgba: () => pixels };
    const left = new FrameCaptureSession(source, { id: 'left', frameNumbers: [0], fixedDeltaSeconds: 1 / 60 });
    const right = new FrameCaptureSession(source, { id: 'right', frameNumbers: [0], fixedDeltaSeconds: 1 / 60 });
    left.capture(0);
    right.capture(0);
    expect(compareCaptureSequences(left.frames, right.frames).minimumSsim).toBe(1);
  });
});

describe('frame profiling and replay', () => {
  it('reports rolling CPU and GPU percentiles', () => {
    const profiler = new FrameProfiler(4);
    [1, 2, 3, 4, 5].forEach((value) => profiler.record(value, value * 0.5));
    expect(profiler.summary.sampleCount).toBe(4);
    expect(profiler.summary.cpu.mean).toBe(3.5);
    expect(profiler.summary.cpu.maximum).toBe(5);
    expect(profiler.summary.gpu?.maximum).toBe(2.5);
  });

  it('records immutable frame input and replays it by exact frame number', () => {
    const recorder = new InputRecorder(1 / 60);
    recorder.record(4, [{ kind: 'pointer', phase: 'down', id: 1, x: 10, y: 20, buttons: 1 }]);
    recorder.record(6, [{ kind: 'pointer', phase: 'up', id: 1, x: 10, y: 20, buttons: 0 }]);
    const replay = new InputReplay(recorder.finish());
    expect(replay.eventsForFrame(5)).toEqual([]);
    expect(replay.eventsForFrame(6)).toEqual([{ kind: 'pointer', phase: 'up', id: 1, x: 10, y: 20, buttons: 0 }]);
  });
});
