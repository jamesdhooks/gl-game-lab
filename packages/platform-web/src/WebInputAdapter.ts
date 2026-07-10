import { InputState } from '@hooksjam/gl-game-lab-core';

export interface LogicalViewport {
  readonly width: number;
  readonly height: number;
}

export interface WebInputAdapterOptions {
  readonly input: InputState;
  readonly getViewport: () => LogicalViewport;
  readonly keyboardTarget?: Window;
  readonly preventDefault?: boolean;
}

export interface ClientRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function normalizePointerCoordinates(
  clientX: number,
  clientY: number,
  bounds: ClientRectLike,
  viewport: LogicalViewport,
): { readonly x: number; readonly y: number } {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) throw new Error('Client pointer coordinates must be finite');
  if (!Number.isFinite(bounds.width) || bounds.width <= 0 || !Number.isFinite(bounds.height) || bounds.height <= 0) {
    throw new Error('Canvas bounds must be positive');
  }
  if (!Number.isFinite(viewport.width) || viewport.width <= 0 || !Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new Error('Logical viewport must be positive');
  }
  return Object.freeze({
    x: (clientX - bounds.left) / bounds.width * viewport.width,
    y: (clientY - bounds.top) / bounds.height * viewport.height,
  });
}

export class WebInputAdapter {
  private readonly keyboardTarget: Window;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WebInputAdapterOptions,
  ) {
    this.keyboardTarget = options.keyboardTarget ?? canvas.ownerDocument.defaultView ?? requireWindow();
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.keyboardTarget.addEventListener('keydown', this.onKeyDown);
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.keyboardTarget.removeEventListener('keydown', this.onKeyDown);
    this.keyboardTarget.removeEventListener('keyup', this.onKeyUp);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    this.ingestPointer(event, 'down');
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.ingestPointer(event, 'move');
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.ingestPointer(event, 'up');
    this.releasePointer(event.pointerId);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.ingestPointer(event, 'cancel');
    this.releasePointer(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.options.preventDefault === true) event.preventDefault();
    this.options.input.ingest({
      kind: 'wheel',
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
    });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.preventDefault === true) event.preventDefault();
    this.options.input.ingest({
      kind: 'key',
      phase: 'down',
      code: event.code,
      key: event.key,
      repeat: event.repeat,
    });
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.options.preventDefault === true) event.preventDefault();
    this.options.input.ingest({ kind: 'key', phase: 'up', code: event.code, key: event.key });
  };

  private ingestPointer(event: PointerEvent, phase: 'down' | 'move' | 'up' | 'cancel'): void {
    if (this.options.preventDefault === true) event.preventDefault();
    const point = normalizePointerCoordinates(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), this.options.getViewport());
    this.options.input.ingest({
      kind: 'pointer',
      phase,
      id: event.pointerId,
      x: point.x,
      y: point.y,
      buttons: event.buttons,
      pressure: event.pressure,
      primary: event.isPrimary,
    });
  }

  private releasePointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }
}

function requireWindow(): Window {
  if (typeof window === 'undefined') throw new Error('WebInputAdapter requires a browser window');
  return window;
}
