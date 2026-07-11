import type { WorkerService, WorkerTaskOptions } from '@hooksjam/gl-game-lab-engine';

interface WorkerResponse<T> {
  readonly id: number;
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: string;
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type WorkerFactory = (moduleUrl: string) => WorkerLike;

export class WebWorkerService implements WorkerService {
  private nextTaskId = 1;
  private destroyed = false;
  private readonly active = new Map<WorkerLike, (failure: unknown) => void>();

  constructor(private readonly createWorker: WorkerFactory = defaultWorkerFactory) {}

  execute<TInput, TOutput>(moduleUrl: string, input: TInput, options: WorkerTaskOptions = {}): Promise<TOutput> {
    if (this.destroyed) return Promise.reject(new Error('Web worker service has been destroyed'));
    if (moduleUrl.trim().length === 0) return Promise.reject(new Error('Worker module URL cannot be empty'));
    if (options.signal?.aborted) return Promise.reject(abortError());
    let timeoutDuration: number | undefined;
    try {
      timeoutDuration = options.timeoutMs === undefined ? undefined : requireTimeout(options.timeoutMs);
    } catch (error) {
      return Promise.reject(error);
    }
    const taskId = this.nextTaskId;
    this.nextTaskId += 1;
    const worker = this.createWorker(moduleUrl);
    return new Promise<TOutput>((resolve, reject) => {
      let settled = false;
      const finish = (failure?: unknown, value?: TOutput): void => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
        worker.terminate();
        this.active.delete(worker);
        if (failure !== undefined) reject(failure);
        else resolve(value as TOutput);
      };
      const onAbort = (): void => { finish(abortError()); };
      const timeout = timeoutDuration === undefined ? undefined : setTimeout(() => {
        finish(new Error(`Worker task timed out after ${timeoutDuration}ms`));
      }, timeoutDuration);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.active.set(worker, (failure) => { finish(failure); });
      worker.onmessage = (event): void => {
        if (!isWorkerResponse<TOutput>(event.data) || event.data.id !== taskId) {
          finish(new Error('Worker returned an invalid task response'));
          return;
        }
        if (event.data.ok) finish(undefined, event.data.value);
        else finish(new Error(event.data.error ?? 'Worker task failed'));
      };
      worker.onerror = (event): void => { finish(new Error(event.message || 'Worker execution failed')); };
      try {
        worker.postMessage(Object.freeze({ id: taskId, input }));
      } catch (error) {
        finish(error);
      }
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const cancel of this.active.values()) cancel(new Error('Web worker service has been destroyed'));
    this.active.clear();
  }
}

function defaultWorkerFactory(moduleUrl: string): Worker {
  return new Worker(moduleUrl, { type: 'module' });
}

function isWorkerResponse<T>(value: unknown): value is WorkerResponse<T> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkerResponse<T>>;
  return Number.isSafeInteger(candidate.id) && typeof candidate.ok === 'boolean';
}

function requireTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Worker timeout must be positive');
  return value;
}

function abortError(): DOMException {
  return new DOMException('Worker task was aborted', 'AbortError');
}
