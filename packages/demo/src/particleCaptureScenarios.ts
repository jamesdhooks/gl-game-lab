import type { FixedFrameInputEvent } from '@hooksjam/gl-game-lab-react';

const POINTER_ID = 7;

export function particleCaptureInputEvents(experienceId: string, scenarioId: string | undefined): readonly FixedFrameInputEvent[] {
  if (scenarioId === undefined) return Object.freeze([]);
  if (experienceId === 'fireworks' && scenarioId === 'launch') return Object.freeze([
    pointer(0, 'down', 360, 250, 1), pointer(1, 'up', 360, 250, 0),
    pointer(25, 'down', 640, 190, 1), pointer(26, 'up', 640, 190, 0),
    pointer(50, 'down', 920, 280, 1), pointer(51, 'up', 920, 280, 0),
  ]);
  if (experienceId === 'sparks' && scenarioId === 'weld') return Object.freeze([
    pointer(0, 'down', 420, 250, 1),
    pointer(30, 'move', 560, 300, 1),
    pointer(60, 'move', 700, 250, 1),
    pointer(90, 'move', 840, 330, 1),
    pointer(120, 'up', 840, 330, 0),
  ]);
  throw new Error(`Unknown particle capture scenario: ${experienceId}/${scenarioId}`);
}

function pointer(frameNumber: number, phase: 'down' | 'move' | 'up', x: number, y: number, buttons: number): FixedFrameInputEvent {
  return Object.freeze({ frameNumber, event: Object.freeze({ kind: 'pointer', phase, id: POINTER_ID, x, y, buttons, primary: true }) });
}
