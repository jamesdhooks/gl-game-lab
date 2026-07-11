import type { FixedFrameInputEvent } from '@hooksjam/gl-game-lab-react';

const POINTER_ID = 1;

const SCENARIOS: Readonly<Record<string, readonly FixedFrameInputEvent[]>> = Object.freeze({
  single: Object.freeze([
    pointer(0, 'down', 480, 120, 1),
    pointer(1, 'up', 480, 120, 0),
  ]),
  stream: Object.freeze([
    pointer(0, 'down', 480, 90, 1),
    pointer(60, 'up', 480, 90, 0),
  ]),
  interact: Object.freeze([
    pointer(60, 'down', 480, 300, 1),
    pointer(70, 'move', 560, 300, 1),
    pointer(80, 'move', 640, 260, 1),
    pointer(90, 'up', 640, 260, 0),
  ]),
  explosion: Object.freeze([
    pointer(60, 'down', 480, 300, 1),
    pointer(61, 'up', 480, 300, 0),
  ]),
});

export function ballPitCaptureInputEvents(scenarioId: string | undefined): readonly FixedFrameInputEvent[] {
  if (scenarioId === undefined) return Object.freeze([]);
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Unknown Ball Pit capture scenario: ${scenarioId}`);
  return scenario;
}

function pointer(
  frameNumber: number,
  phase: 'down' | 'move' | 'up',
  x: number,
  y: number,
  buttons: number,
): FixedFrameInputEvent {
  return Object.freeze({
    frameNumber,
    event: Object.freeze({ kind: 'pointer', phase, id: POINTER_ID, x, y, buttons, primary: true }),
  });
}
