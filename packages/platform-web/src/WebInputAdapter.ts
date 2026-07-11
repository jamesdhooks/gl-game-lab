import { InputState } from '@hooksjam/gl-game-lab-core';

export interface LogicalViewport {
  readonly width: number;
  readonly height: number;
}

export interface WebInputAdapterOptions {
  readonly input: InputState;
  readonly getViewport: () => LogicalViewport;
  readonly keyboardTarget?: Window | HTMLElement;
  readonly document?: Document;
  readonly preventDefault?: boolean;
  readonly focusOnPointer?: boolean;
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
  private readonly keyboardTarget: Window | HTMLElement;
  private readonly document: Document;
  private readonly pointers = new Map<number, PointerEvent>();
  private readonly keys = new Map<string, string>();
  private readonly previousTabIndex: number;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WebInputAdapterOptions,
  ) {
    this.keyboardTarget = options.keyboardTarget ?? canvas;
    this.document = options.document ?? canvas.ownerDocument;
    this.previousTabIndex = canvas.tabIndex;
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.keyboardTarget.addEventListener('keydown', this.onKeyDown as EventListener);
    this.keyboardTarget.addEventListener('keyup', this.onKeyUp as EventListener);
    this.keyboardTarget.addEventListener('blur', this.onBlur);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.keyboardTarget.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.keyboardTarget.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.keyboardTarget.removeEventListener('blur', this.onBlur);
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.cancelActiveInput();
    this.canvas.tabIndex = this.previousTabIndex;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.options.focusOnPointer !== false) this.canvas.focus({ preventScroll: true });
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

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.ingestPointer(pointer, 'cancel');
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
    this.keys.set(event.code, event.key);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.options.preventDefault === true) event.preventDefault();
    this.options.input.ingest({ kind: 'key', phase: 'up', code: event.code, key: event.key });
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => { this.cancelActiveInput(); };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'hidden') this.cancelActiveInput();
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
    if (phase === 'up' || phase === 'cancel') this.pointers.delete(event.pointerId);
    else this.pointers.set(event.pointerId, event);
  }

  private releasePointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
  }

  private cancelActiveInput(): void {
    for (const pointer of [...this.pointers.values()]) this.ingestPointer(pointer, 'cancel');
    for (const [code, key] of this.keys) {
      this.options.input.ingest({ kind: 'key', phase: 'up', code, key });
    }
    this.keys.clear();
  }
}
